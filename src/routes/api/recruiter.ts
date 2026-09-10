import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type CandidateStatus = Database["public"]["Enums"]["candidate_status"];

const ALLOWED_STATUSES: CandidateStatus[] = [
  "submitted",
  "shortlisted",
  "not_shortlisted",
  "selected",
  "rejected",
];

const REQUIRED_DOMAIN = "@purpledrive.com";

export function isAuthorizedEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(REQUIRED_DOMAIN);
}

// Helper to authenticate recruiter session server-side
async function authenticateRecruiter(request: Request): Promise<
  | { error: string; status: number }
  | { user: any; supabaseAdmin: any }
> {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: "Unauthorized: Missing or invalid authorization header.", status: 401 };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { error: "Unauthorized: Missing authentication token.", status: 401 };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return { error: "Unauthorized: Invalid or expired session.", status: 401 };
  }

  const user = data.user;
  const email = user.email || "";

  // Server-side strict case-insensitive domain enforcement
  if (!isAuthorizedEmail(email)) {
    return {
      error: "Only @purpledrive.com accounts can access Purple Drive Referral.",
      status: 403,
    };
  }

  return { user, supabaseAdmin };
}

export const Route = createFileRoute("/api/recruiter")({
  server: {
    handlers: {
      // GET: Fetch workspace data (jobs & candidates owned by the authenticated recruiter)
      GET: async ({ request }) => {
        const auth = await authenticateRecruiter(request);
        if ("error" in auth) {
          return Response.json({ error: auth.error }, { status: auth.status });
        }

        const { user, supabaseAdmin } = auth;

        // 1. Fetch only jobs owned by this recruiter (deriving ID from token, never client input)
        const { data: jobs, error: jobError } = await supabaseAdmin
          .from("jobs")
          .select("id, recruiter_id, title, description, slug, status, created_at, updated_at")
          .eq("recruiter_id", user.id)
          .order("created_at", { ascending: false });

        if (jobError) {
          return Response.json({ error: "Could not load jobs." }, { status: 500 });
        }

        const jobIds = (jobs || []).map((j: { id: string }) => j.id);

        if (jobIds.length === 0) {
          return Response.json({ jobs: [], candidates: [] });
        }

        // 2. Fetch candidates for these jobs with strict DATA MINIMIZATION (NO resume_raw_text)
        const { data: candidates, error: candError } = await supabaseAdmin
          .from("candidates")
          .select("id, job_id, referrer_id, name, email, phone, status, submitted_at, skills")
          .in("job_id", jobIds)
          .order("submitted_at", { ascending: false });

        if (candError) {
          return Response.json({ error: "Could not load candidates." }, { status: 500 });
        }

        return Response.json({
          jobs: jobs || [],
          candidates: candidates || [],
        });
      },

      // POST: Mutate recruiter operations (create job, update candidate status)
      POST: async ({ request }) => {
        const auth = await authenticateRecruiter(request);
        if ("error" in auth) {
          return Response.json({ error: auth.error }, { status: auth.status });
        }

        const { user, supabaseAdmin } = auth;
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body." }, { status: 400 });
        }

        const action = payload.action;

        // Action 1: Create a Job
        if (action === "create_job") {
          const title = typeof payload.title === "string" ? payload.title.trim() : "";
          const description = typeof payload.description === "string" ? payload.description.trim() : "";

          if (title.length < 2 || title.length > 120) {
            return Response.json({ error: "Job title must be between 2 and 120 characters." }, { status: 400 });
          }

          const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          const slug = `${base || "role"}-${Math.random().toString(36).slice(2, 7)}`;

          // Always assign recruiter_id from verified server session (anti-IDOR)
          const { data: job, error: insertError } = await supabaseAdmin
            .from("jobs")
            .insert({
              recruiter_id: user.id,
              title,
              description,
              slug,
              status: "open",
            })
            .select("id, recruiter_id, title, description, slug, status, created_at, updated_at")
            .single();

          if (insertError || !job) {
            return Response.json({ error: "Could not create job." }, { status: 500 });
          }

          return Response.json({ ok: true, job });
        }

        // Action 2: Update Candidate Status (Protected against IDOR)
        if (action === "update_status") {
          const candidateId = typeof payload.candidate_id === "string" ? payload.candidate_id : "";
          const newStatus = payload.status as CandidateStatus;

          if (!candidateId) {
            return Response.json({ error: "candidate_id is required." }, { status: 400 });
          }

          if (!ALLOWED_STATUSES.includes(newStatus)) {
            return Response.json(
              { error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` },
              { status: 400 }
            );
          }

          // Anti-IDOR Check: Verify candidate belongs to a job owned by this recruiter
          const { data: candidate, error: candLookupErr } = await supabaseAdmin
            .from("candidates")
            .select("id, job_id, jobs(recruiter_id)")
            .eq("id", candidateId)
            .maybeSingle();

          if (candLookupErr || !candidate) {
            return Response.json({ error: "Candidate not found." }, { status: 404 });
          }

          const jobRecruiterId = Array.isArray(candidate.jobs)
            ? candidate.jobs[0]?.recruiter_id
            : (candidate.jobs as any)?.recruiter_id;

          if (jobRecruiterId !== user.id) {
            // Recruiter A cannot modify Recruiter B's candidates
            return Response.json(
              { error: "Forbidden: You do not own the role for this candidate." },
              { status: 403 }
            );
          }

          // Update candidate status
          const { error: updateErr } = await supabaseAdmin
            .from("candidates")
            .update({ status: newStatus })
            .eq("id", candidateId);

          if (updateErr) {
            return Response.json({ error: "Could not update candidate status." }, { status: 500 });
          }

          // Log status history safely with error check
          const { error: histErr } = await supabaseAdmin.from("status_history").insert({
            candidate_id: candidateId,
            status: newStatus,
            changed_by: user.id,
          });

          if (histErr) {
            console.warn("Status history record failure:", histErr);
          }

          return Response.json({ ok: true, status: newStatus });
        }

        return Response.json({ error: "Unknown action." }, { status: 400 });
      },
    },
  },
});
