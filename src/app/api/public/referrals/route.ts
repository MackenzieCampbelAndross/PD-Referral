import { z } from "zod";
import {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  checkRateLimit,
  validateFileContent,
  extractResumeText,
  extractIdentity,
  devReferralsStore,
} from "@/routes/api/public/referrals";

const submitSchema = z.object({
  job_slug: z.string().min(3).max(120),
  referrer_name: z.string().trim().min(2).max(120),
  referrer_email: z.string().trim().email().max(200),
  referrer_phone: z.string().trim().min(5).max(40),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("email") ?? "");
  const phone = normalizePhone(url.searchParams.get("phone") ?? "");

  if (!email || phone.length < 5) {
    return Response.json(
      { error: "Enter the email and phone used on the referral." },
      { status: 400 },
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Fetch from Supabase
  const { data: referrers } = await supabaseAdmin
    .from("referrers")
    .select("id")
    .eq("email", email)
    .eq("phone", phone);

  const results: Array<{
    candidate_name: string;
    status: string;
    submitted_at: string;
    skills: string[];
    job_title: string;
  }> = [];

  if (referrers && referrers.length > 0) {
    const referrerIds = referrers.map((r) => r.id);
    // Data minimization: fetch only candidate_name, status, submitted_at, skills, job_title
    // NEVER fetch resume_raw_text or storage paths
    const rows = await supabaseAdmin
      .from("candidates")
      .select("name, status, submitted_at, job_id, skills, jobs(title)")
      .in("referrer_id", referrerIds)
      .order("submitted_at", { ascending: false });

    if (rows.data && rows.data.length > 0) {
      for (const row of rows.data) {
        results.push({
          candidate_name: row.name,
          status: row.status,
          submitted_at: row.submitted_at,
          skills: (row as any).skills ?? [],
          job_title: Array.isArray(row.jobs)
            ? (row.jobs[0]?.title ?? "Role")
            : (row.jobs?.title ?? "Role"),
        });
      }
    }
  }

  // 2. Fetch from dev fallback store
  const devMatches = devReferralsStore.filter(
    (r) => r.referrer_email === email && r.referrer_phone === phone,
  );
  for (const dev of devMatches) {
    results.push({
      candidate_name: dev.candidate_name,
      status: dev.status,
      submitted_at: dev.submitted_at,
      skills: dev.skills,
      job_title: dev.job_title,
    });
  }

  return Response.json({ referrals: results });
}

export async function POST(request: Request) {
  // Rate limiting check per client IP
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "local";

  if (!checkRateLimit(clientIp)) {
    return Response.json(
      { error: "Too many referral submissions. Please try again later." },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const parsed = submitSchema.safeParse({
    job_slug: formData.get("job_slug"),
    referrer_name: formData.get("referrer_name"),
    referrer_email: formData.get("referrer_email"),
    referrer_phone: formData.get("referrer_phone"),
  });

  const file = formData.get("resume");
  if (!parsed.success || !(file instanceof File)) {
    return Response.json(
      { error: "Please provide all required referral details and a valid resume file." },
      { status: 400 },
    );
  }

  // File validation (size, extension, magic bytes)
  const fileCheck = await validateFileContent(file);
  if (!fileCheck.valid) {
    return Response.json({ error: fileCheck.error || "Invalid file." }, { status: 400 });
  }

  const { job_slug, referrer_name, referrer_email, referrer_phone } = parsed.data;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const job = await supabaseAdmin
    .from("jobs")
    .select("id, title")
    .eq("slug", job_slug)
    .eq("status", "open")
    .maybeSingle();

  if (job.error || !job.data) {
    return Response.json({ error: "This role is not available." }, { status: 404 });
  }

  // 1. Resume text and identity extraction
  const resumeText = await extractResumeText(file);
  const identity = extractIdentity(resumeText);
  const candidateEmail = normalizeEmail(identity.email);
  const candidatePhone = normalizePhone(identity.phone);
  const candidateName = normalizeName(identity.name);

  if (!candidateEmail || candidatePhone.length < 5 || candidateName === "candidate") {
    return Response.json(
      {
        error:
          "We could not reliably read the candidate’s name, email, and phone from this file. Please upload a clearer resume.",
      },
      { status: 422 },
    );
  }

  // 2. Duplicate detection:
  // Match strictly on normalized email OR normalized phone. Candidate name is NOT used.
  const { data: duplicateMatches } = await supabaseAdmin
    .from("candidates")
    .select("id, email_normalized, phone_normalized")
    .or(`email_normalized.eq.${candidateEmail},phone_normalized.eq.${candidatePhone}`)
    .limit(1);

  const isDevDuplicate = devReferralsStore.some(
    (c) => c.email_normalized === candidateEmail || c.phone_normalized === candidatePhone,
  );

  if ((duplicateMatches && duplicateMatches.length > 0) || isDevDuplicate) {
    const matched = duplicateMatches?.[0];
    try {
      await supabaseAdmin.from("duplicate_attempts").insert({
        job_id: job.data.id,
        referrer_name,
        referrer_email,
        referrer_phone,
        candidate_name: identity.name,
        candidate_email: identity.email,
        candidate_phone: identity.phone,
        matched_candidate_id: matched ? matched.id : null,
      });
    } catch (logErr) {
      console.warn("Could not log duplicate attempt:", logErr);
    }
    return Response.json({ duplicate: true });
  }

  // 3. Referrer creation / lookup in Supabase
  let referrerId: string | null = null;
  const normRefEmail = normalizeEmail(referrer_email);
  const normRefPhone = normalizePhone(referrer_phone);

  try {
    const { data: existingRef } = await supabaseAdmin
      .from("referrers")
      .select("id")
      .eq("email", normRefEmail)
      .eq("phone", normRefPhone)
      .limit(1)
      .maybeSingle();

    if (existingRef) {
      referrerId = existingRef.id;
    } else {
      const referrerRes = await supabaseAdmin
        .from("referrers")
        .insert({
          name: referrer_name,
          email: normRefEmail,
          phone: normRefPhone,
        })
        .select("id")
        .single();

      if (referrerRes.data) {
        referrerId = referrerRes.data.id;
      }
    }
  } catch (refErr) {
    console.warn("Referrer DB operation warning:", refErr);
  }

  // 4. File storage in Supabase Storage with path traversal sanitization
  const sanitizedFileName = file.name
    .replace(/\.\.+/g, "")
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 100);

  const filePath = `${job.data.id}/${crypto.randomUUID()}-${sanitizedFileName || "resume"}`;
  let uploadSucceeded = false;

  try {
    const uploadRes = await supabaseAdmin.storage
      .from("resumes")
      .upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (!uploadRes.error) {
      uploadSucceeded = true;
    }
  } catch (uploadErr) {
    console.warn("Resume upload note:", uploadErr);
  }

  // 5. Candidate record insertion
  let candidateInsertedInDb = false;
  if (referrerId) {
    const candidatePayload: Record<string, any> = {
      job_id: job.data.id,
      referrer_id: referrerId,
      name: identity.name,
      phone: identity.phone,
      email: identity.email,
      name_normalized: candidateName,
      phone_normalized: candidatePhone,
      email_normalized: candidateEmail,
      resume_file_path: filePath,
      resume_raw_text: resumeText,
      status: "submitted",
      skills: identity.skills,
    };

    let candidateInsert = await supabaseAdmin
      .from("candidates")
      .insert(candidatePayload as any)
      .select("id")
      .single();

    if (candidateInsert.error && candidateInsert.error.message?.includes("skills")) {
      delete candidatePayload["skills"];
      candidateInsert = await supabaseAdmin
        .from("candidates")
        .insert(candidatePayload as any)
        .select("id")
        .single();
    }

    if (candidateInsert.data) {
      candidateInsertedInDb = true;
    } else if (uploadSucceeded) {
      // Rollback uploaded storage file on candidate insert failure
      await supabaseAdmin.storage.from("resumes").remove([filePath]);
    }
  }

  // If local dev environment prevented DB write, store in local fallback
  if (!candidateInsertedInDb) {
    devReferralsStore.push({
      id: crypto.randomUUID(),
      job_id: job.data.id,
      job_title: job.data.title || "Role",
      referrer_name,
      referrer_email: normRefEmail,
      referrer_phone: normRefPhone,
      candidate_name: identity.name,
      candidate_email: identity.email,
      candidate_phone: identity.phone,
      email_normalized: candidateEmail,
      phone_normalized: candidatePhone,
      name_normalized: candidateName,
      skills: identity.skills,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
  }

  return Response.json({
    ok: true,
    extracted: {
      name: identity.name,
      email: identity.email,
      phone: identity.phone,
      skills: identity.skills,
    },
  });
}
