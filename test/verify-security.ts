import fs from "node:fs";
import path from "node:path";
import { isAuthorizedEmail as isAuthEmailRecruiter } from "../src/routes/api/recruiter";
import { isPurpleDriveEmail, AUTH_ERROR_MESSAGE } from "../src/routes/index";
import {
  validateFileContent,
  normalizeEmail,
  normalizePhone,
} from "../src/routes/api/public/referrals";

async function runSecurityTests() {
  console.log("=========================================");
  console.log(" Purple Drive Referral - Security Suite ");
  console.log("=========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // 1. Recruiter Email Domain Enforcement
  console.log("--- 1. Recruiter Email Domain Enforcement (@purpledrive.com) ---");
  assert(
    isPurpleDriveEmail("recruiter@purpledrive.com"),
    "Accepts standard lowercase @purpledrive.com",
  );
  assert(isPurpleDriveEmail("HIRING.LEAD@PURPLEDRIVE.COM"), "Accepts uppercase @PURPLEDRIVE.COM");
  assert(
    isPurpleDriveEmail("  john.doe@purpledrive.com  "),
    "Accepts @purpledrive.com with whitespace",
  );
  assert(
    isAuthEmailRecruiter("sarah@purpledrive.com"),
    "API helper accepts valid @purpledrive.com",
  );

  assert(!isPurpleDriveEmail("attacker@gmail.com"), "Rejects @gmail.com");
  assert(!isPurpleDriveEmail("fake@purpledrive.com.attacker.com"), "Rejects subdomain spoofing");
  assert(!isPurpleDriveEmail("hacker@notpurpledrive.com"), "Rejects prefix domain spoofing");
  assert(!isPurpleDriveEmail(""), "Rejects empty email");
  assert(!isPurpleDriveEmail(null), "Rejects null email");
  assert(
    AUTH_ERROR_MESSAGE === "Only @purpledrive.com accounts can access Purple Drive Referral.",
    "Exact required error message text verified",
  );

  // 2. Removal of Google Login & Providers
  console.log("\n--- 2. Removal of Google Login & OAuth Handlers ---");
  const indexSource = fs.readFileSync(path.resolve("src/routes/index.tsx"), "utf-8");
  assert(!indexSource.includes("signInWithOAuth"), "Zero signInWithOAuth occurrences in index.tsx");
  assert(
    !indexSource.includes("Continue with Google"),
    "Zero 'Continue with Google' button in index.tsx",
  );
  assert(
    !indexSource.toLowerCase().includes("google"),
    "Zero Google login references in index.tsx",
  );
  assert(!indexSource.includes("lovable"), "Lovable OAuth helper removed from index.tsx");

  // 3. Branding & Spelling Verification
  console.log("\n--- 3. Strict Branding Verification ---");
  assert(!indexSource.includes("PurpleDrive Referal"), "index.tsx has zero 'PurpleDrive Referal'");
  assert(!indexSource.includes("Referflow"), "index.tsx has zero 'Referflow'");
  assert(
    indexSource.includes("Purple Drive Referral"),
    "index.tsx has exact 'Purple Drive Referral' title",
  );

  const rootSource = fs.readFileSync(path.resolve("src/routes/__root.tsx"), "utf-8");
  assert(
    rootSource.includes("Purple Drive Referral"),
    "__root.tsx has exact 'Purple Drive Referral'",
  );
  assert(!rootSource.includes("Referal"), "__root.tsx has zero 'Referal'");
  assert(!rootSource.includes("Referflow"), "__root.tsx has zero 'Referflow'");

  const slugSource = fs.readFileSync(path.resolve("src/routes/j/$slug.tsx"), "utf-8");
  assert(
    slugSource.includes("Purple Drive Referral"),
    "j/$slug.tsx has exact 'Purple Drive Referral'",
  );
  assert(!slugSource.includes("Referal"), "j/$slug.tsx has zero 'Referal'");

  // 4. File Magic Bytes & Extension Security Validation
  console.log("\n--- 4. Resume File Validation (Magic Bytes & Type Restrictions) ---");
  // Test PDF magic bytes: %PDF (0x25, 0x50, 0x44, 0x46)
  const validPdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]).buffer;
  const validPdfFile = new File([validPdfBuffer], "resume.pdf", { type: "application/pdf" });
  const pdfVal = await validateFileContent(validPdfFile);
  assert(pdfVal.valid, "Valid PDF magic bytes accepted");

  // Test DOCX magic bytes: PK\x03\x04 (0x50, 0x4b, 0x03, 0x04)
  const validDocxBuffer = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]).buffer;
  const validDocxFile = new File([validDocxBuffer], "resume.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const docxVal = await validateFileContent(validDocxFile);
  assert(docxVal.valid, "Valid DOCX magic bytes accepted");

  // Test Spoofed file: Executable disguised as PDF
  const fakePdfBuffer = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]).buffer; // 'MZ' DOS header
  const fakePdfFile = new File([fakePdfBuffer], "malware.pdf", { type: "application/pdf" });
  const fakePdfVal = await validateFileContent(fakePdfFile);
  assert(
    !fakePdfVal.valid && Boolean(fakePdfVal.error?.includes("magic bytes")),
    "Spoofed PDF (malicious binary) rejected by magic bytes",
  );

  // Test Disallowed extension: .doc (legacy Word)
  const legacyDocFile = new File([validPdfBuffer], "resume.doc", { type: "application/msword" });
  const docVal = await validateFileContent(legacyDocFile);
  assert(
    !docVal.valid && Boolean(docVal.error?.includes(".doc files are not supported")),
    "Legacy .doc format explicitly rejected",
  );

  // Test Disallowed extension: .exe, .sh
  const exeFile = new File([validPdfBuffer], "script.exe", { type: "application/octet-stream" });
  const exeVal = await validateFileContent(exeFile);
  assert(!exeVal.valid, "Executable file rejected");

  // 5. Data Minimization & Anti-IDOR Check
  console.log("\n--- 5. Recruiter API & Data Minimization Verification ---");
  const recruiterSource = fs.readFileSync(path.resolve("src/routes/api/recruiter.ts"), "utf-8");
  assert(
    !recruiterSource.includes(
      '.select("id, job_id, referrer_id, name, email, phone, status, submitted_at, skills, resume_raw_text")',
    ) && !recruiterSource.includes("resume_raw_text,"),
    "Recruiter API excludes resume_raw_text from select list (Data Minimization)",
  );
  assert(!indexSource.includes('select("*")'), "No select('*') queries in index.tsx");
  assert(
    recruiterSource.includes("jobRecruiterId !== user.id"),
    "Recruiter API enforces Anti-IDOR ownership check",
  );
  assert(recruiterSource.includes("status_history"), "Recruiter API writes to status_history log");

  // 6. Duplicate Detection Rule (Email OR Phone, no Name)
  console.log("\n--- 6. Duplicate Detection Precision ---");
  const phone1 = normalizePhone("+1 (555) 019-2831");
  const phone2 = normalizePhone("15550192831");
  assert(phone1 === phone2, "Phone normalization removes punctuation and country code artifacts");

  const email1 = normalizeEmail("  Candidate.Test@Domain.COM ");
  assert(
    email1 === "candidate.test@domain.com",
    "Email normalization strips whitespace and lowercases",
  );

  // 7. Supabase Security Migration Verification
  console.log("\n--- 7. Supabase Migration Verification ---");
  const migrationPath = path.resolve("supabase/migrations/20260910140000_security_hardening.sql");
  assert(
    fs.existsSync(migrationPath),
    "Migration 20260910140000_security_hardening.sql exists on disk",
  );
  const migrationContent = fs.readFileSync(migrationPath, "utf-8");
  assert(
    migrationContent.includes(
      'DROP POLICY IF EXISTS "Anyone can view referrer records" ON public.referrers',
    ),
    "Migration drops permissive referrers policy",
  );
  assert(
    migrationContent.includes("@purpledrive.com"),
    "Migration validates @purpledrive.com in database trigger",
  );

  console.log("\n=========================================");
  console.log(`Security Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error("Security tests crashed:", err);
  process.exit(1);
});
