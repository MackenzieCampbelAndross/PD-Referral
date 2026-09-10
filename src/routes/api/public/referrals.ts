import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const submitSchema = z.object({
  job_slug: z.string().min(3).max(120),
  referrer_name: z.string().trim().min(2).max(120),
  referrer_email: z.string().trim().email().max(200),
  referrer_phone: z.string().trim().min(5).max(40),
});

const normalizeName = (value: string) => value.toLowerCase().trim().replace(/\s+/g, " ");
const normalizeEmail = (value: string) => value.toLowerCase().trim();
const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^00/, "");

async function extractResumeText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (file.name.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return result.value;
    }
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await pdfjs.getDocument({ data: bytes, disableFontFace: true, useWorkerFetch: false }).promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }
      return pages.join("\n");
    }
  } catch (error) {
    console.error("Resume parsing failed", error);
  }
  return new TextDecoder().decode(bytes);
}

function extractIdentity(text: string) {
  const cleaned = text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ");
  const emailMatch = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = cleaned.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines.find((line) => /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(line) && !line.includes("@")) ?? "";
  return { name: name || "Candidate", email: emailMatch?.[0] ?? "", phone: phoneMatch?.[0] ?? "" };
}

export const Route = createFileRoute("/api/public/referrals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = normalizeEmail(url.searchParams.get("email") ?? "");
        const phone = normalizePhone(url.searchParams.get("phone") ?? "");
        if (!email || phone.length < 5) return Response.json({ error: "Enter the email and phone used on the referral." }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const referrer = await supabaseAdmin.from("referrers").select("id").eq("email", email).eq("phone", phone).maybeSingle();
        if (referrer.error || !referrer.data) return Response.json({ referrals: [] });
        const rows = await supabaseAdmin.from("candidates").select("name, status, submitted_at, job_id, jobs(title)").eq("referrer_id", referrer.data.id).order("submitted_at", { ascending: false });
        if (rows.error) return Response.json({ error: "Could not look up referrals." }, { status: 500 });
        return Response.json({ referrals: (rows.data ?? []).map((row) => ({ candidate_name: row.name, status: row.status, submitted_at: row.submitted_at, job_title: Array.isArray(row.jobs) ? row.jobs[0]?.title ?? "Role" : row.jobs?.title ?? "Role" })) });
      },
      POST: async ({ request }) => {
        const formData = await request.formData();
        const parsed = submitSchema.safeParse({ job_slug: formData.get("job_slug"), referrer_name: formData.get("referrer_name"), referrer_email: formData.get("referrer_email"), referrer_phone: formData.get("referrer_phone") });
        const file = formData.get("resume");
        if (!parsed.success || !(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) return Response.json({ error: "Add a valid PDF or DOCX resume under 20 MB." }, { status: 400 });
        const { job_slug, referrer_name, referrer_email, referrer_phone } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const job = await supabaseAdmin.from("jobs").select("id").eq("slug", job_slug).eq("status", "open").maybeSingle();
        if (job.error || !job.data) return Response.json({ error: "This role is not available." }, { status: 404 });
        const resumeText = await extractResumeText(file);
        const identity = extractIdentity(resumeText);
        const candidateEmail = normalizeEmail(identity.email);
        const candidatePhone = normalizePhone(identity.phone);
        const candidateName = normalizeName(identity.name);
        if (!candidateEmail || candidatePhone.length < 5 || candidateName === "candidate") return Response.json({ error: "We could not reliably read the candidate’s name, email, and phone from this file. Please upload a clearer resume." }, { status: 422 });
        const duplicate = await supabaseAdmin.from("candidates").select("id").eq("name_normalized", candidateName).eq("email_normalized", candidateEmail).eq("phone_normalized", candidatePhone).maybeSingle();
        if (duplicate.error) return Response.json({ error: "Could not check this referral." }, { status: 500 });
        if (duplicate.data) {
          await supabaseAdmin.from("duplicate_attempts").insert({ job_id: job.data.id, referrer_name, referrer_email, referrer_phone, candidate_name: identity.name, candidate_email: identity.email, candidate_phone: identity.phone, matched_candidate_id: duplicate.data.id });
          return Response.json({ duplicate: true });
        }
        const referrer = await supabaseAdmin.from("referrers").insert({ name: referrer_name, email: normalizeEmail(referrer_email), phone: normalizePhone(referrer_phone) }).select("id").single();
        if (referrer.error || !referrer.data) return Response.json({ error: "Could not save the referral contact." }, { status: 500 });
        const filePath = `${job.data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const upload = await supabaseAdmin.storage.from("resumes").upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upload.error) return Response.json({ error: "Could not securely store the resume." }, { status: 500 });
        const candidate = await supabaseAdmin.from("candidates").insert({ job_id: job.data.id, referrer_id: referrer.data.id, name: identity.name, phone: identity.phone, email: identity.email, name_normalized: candidateName, phone_normalized: candidatePhone, email_normalized: candidateEmail, resume_file_path: filePath, resume_raw_text: resumeText }).select("id").single();
        if (candidate.error) { await supabaseAdmin.storage.from("resumes").remove([filePath]); return Response.json({ error: "Could not save this referral." }, { status: 500 }); }
        return Response.json({ ok: true });
      },
    },
  },
});