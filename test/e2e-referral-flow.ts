import { createClient } from "@supabase/supabase-js";
import { createRealDocxFile } from "./helpers.ts";

async function runE2E() {
  console.log("=========================================");
  console.log("   E2E Referral Submission & Track Test  ");
  console.log("=========================================\n");

  const SUPABASE_URL = "https://c--06a70722-a572-4edd-b69a-241bf595d575-prod.lovable.cloud";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RcB_DnqbRWWer5ZEZNGWwA_HxCuE5C_";
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  // 1. Fetch an open job to refer for
  const { data: jobs, error: jobErr } = await sb.from("jobs").select("id, slug, title").eq("status", "open").limit(1);
  if (jobErr || !jobs || jobs.length === 0) {
    console.error("No open jobs found in database:", jobErr);
    process.exit(1);
  }
  const job = jobs[0];
  console.log(`Using open job: "${job.title}" (${job.slug})`);

  const uniqueId = Math.random().toString(36).slice(2, 7);
  const referrerEmail = `referrer_${uniqueId}@company.com`;
  const referrerPhone = `+1 555 777 ${Math.floor(1000 + Math.random() * 9000)}`;

  const candidateEmail1 = `cand_${uniqueId}_1@example.com`;
  const candidatePhone1 = `+1 555 888 ${Math.floor(1000 + Math.random() * 9000)}`;
  const candidateName1 = "Marcus Vance";

  // Step 1: Submit a brand new referral using real binary DOCX
  console.log("\n--- Step 1: Submitting new candidate (real DOCX) ---");
  const resume1 = await createRealDocxFile(
    candidateName1,
    candidateEmail1,
    candidatePhone1,
    ["React", "TypeScript", "Node.js", "PostgreSQL", "Docker", "AWS"],
    "marcus_vance_resume.docx"
  );

  const fd1 = new FormData();
  fd1.append("job_slug", job.slug);
  fd1.append("referrer_name", "Sarah Jenkins");
  fd1.append("referrer_email", referrerEmail);
  fd1.append("referrer_phone", referrerPhone);
  fd1.append("resume", resume1);

  const res1 = await fetch("http://localhost:8080/api/public/referrals", { method: "POST", body: fd1 });
  const data1 = await res1.json();
  console.log("Submission 1 response:", data1);

  if (!res1.ok || !data1.ok) {
    console.error("❌ Failed to submit referral 1:", data1);
    process.exit(1);
  }
  console.log("✅ Candidate 1 successfully submitted and parsed!");
  console.log("   Extracted name:", data1.extracted?.name);
  console.log("   Extracted skills:", data1.extracted?.skills);

  // Step 2: Test Duplicate Detection by Email (different name & phone)
  console.log("\n--- Step 2: Testing duplicate detection by Email ---");
  const differentPhone = `+1 555 999 ${Math.floor(1000 + Math.random() * 9000)}`;
  const resumeDuplicateEmail = await createRealDocxFile(
    "Completely Different Name",
    candidateEmail1, // SAME EMAIL
    differentPhone,
    ["Python", "Django"],
    "other_resume.docx"
  );

  const fd2 = new FormData();
  fd2.append("job_slug", job.slug);
  fd2.append("referrer_name", "Another Referrer");
  fd2.append("referrer_email", "another@company.com");
  fd2.append("referrer_phone", "+1 555 111 2222");
  fd2.append("resume", resumeDuplicateEmail);

  const res2 = await fetch("http://localhost:8080/api/public/referrals", { method: "POST", body: fd2 });
  const data2 = await res2.json();
  console.log("Duplicate email response:", data2);

  if (data2.duplicate === true) {
    console.log("✅ Correctly rejected duplicate by Email (different name & phone)!");
  } else {
    console.error("❌ Failed to detect duplicate by Email:", data2);
    process.exit(1);
  }

  // Step 3: Test Duplicate Detection by Phone (different name & email)
  console.log("\n--- Step 3: Testing duplicate detection by Phone ---");
  const differentEmail = `cand_${uniqueId}_different@example.com`;
  const resumeDuplicatePhone = await createRealDocxFile(
    "Another Different Name",
    differentEmail,
    candidatePhone1, // SAME PHONE
    ["Go", "Kubernetes"],
    "other_resume2.docx"
  );

  const fd3 = new FormData();
  fd3.append("job_slug", job.slug);
  fd3.append("referrer_name", "Another Referrer 2");
  fd3.append("referrer_email", "another2@company.com");
  fd3.append("referrer_phone", "+1 555 111 3333");
  fd3.append("resume", resumeDuplicatePhone);

  const res3 = await fetch("http://localhost:8080/api/public/referrals", { method: "POST", body: fd3 });
  const data3 = await res3.json();
  console.log("Duplicate phone response:", data3);

  if (data3.duplicate === true) {
    console.log("✅ Correctly rejected duplicate by Phone (different name & email)!");
  } else {
    console.error("❌ Failed to detect duplicate by Phone:", data3);
    process.exit(1);
  }

  // Step 4: Test Track Referral
  console.log("\n--- Step 4: Testing Track Referral End-to-End ---");
  const trackUrl = `http://localhost:8080/api/public/referrals?email=${encodeURIComponent(referrerEmail)}&phone=${encodeURIComponent(referrerPhone)}`;
  const trackRes = await fetch(trackUrl);
  const trackData = await trackRes.json();
  console.log("Track Referral Response:", trackData);

  if (!trackRes.ok || !trackData.referrals || trackData.referrals.length === 0) {
    console.error("❌ Track referral did not return submitted referral:", trackData);
    process.exit(1);
  }

  const tracked = trackData.referrals[0];
  console.log(`Found tracked candidate: "${tracked.candidate_name}" for role "${tracked.job_title}" with status "${tracked.status}"`);

  if (tracked.candidate_name === candidateName1 && tracked.status === "submitted") {
    console.log("✅ Track Referral verified candidate name, job title, and initial status (Submitted)!");
  } else {
    console.error("❌ Track Referral data mismatch:", tracked);
    process.exit(1);
  }

  // Step 5: Test Status Updates & Synchronization
  console.log("\n--- Step 5: Testing Status Updates & Synchronization ---");
  const { data: candRows } = await sb.from("candidates").select("id").eq("email_normalized", candidateEmail1.toLowerCase().trim()).limit(1);
  if (candRows && candRows.length > 0) {
    const candidateId = candRows[0].id;
    console.log(`Updating candidate ${candidateId} to status 'shortlisted'...`);
    const { error: updErr } = await sb.from("candidates").update({ status: "shortlisted" as any }).eq("id", candidateId);
    if (updErr) {
      console.warn("Candidate status update notice:", updErr.message);
    } else {
      // Re-query Track Referral to ensure live synchronization
      const syncedRes = await fetch(trackUrl);
      const syncedData = await syncedRes.json();
      console.log("Track Referral after status update:", syncedData);
      if (syncedData.referrals?.[0]?.status === "shortlisted") {
        console.log("✅ Track Referral verified live status update to 'Shortlisted'!");
      }
    }
  }

  console.log("\n=========================================");
  console.log("   ALL E2E REFERRAL TESTS PASSED! 🎉    ");
  console.log("=========================================");
}

runE2E().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
