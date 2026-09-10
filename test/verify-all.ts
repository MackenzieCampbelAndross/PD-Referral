import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Test runner for Purple Drive Referral
async function runTests() {
  console.log("=========================================");
  console.log("   Purple Drive Referral - Test Suite    ");
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

  // 1. Test Name, Email, Phone, and Skill Extraction
  console.log("--- 1. Testing Resume Extraction Logic ---");
  const { extractIdentity } = await import("../src/routes/api/public/referrals.ts");

  const sampleResumeText = `
    Alex Rivera
    Senior Full Stack Engineer
    Email: alex.rivera.dev@example.com
    Phone: +1 (555) 234-5678
    LinkedIn: linkedin.com/in/alexrivera
    GitHub: github.com/alexrivera

    PROFESSIONAL SUMMARY
    Innovative Full Stack Developer with 7 years of experience developing web applications.

    TECHNICAL SKILLS
    Languages & Frameworks: JavaScript, TypeScript, Python, React, Next.js, Node.js, Express, Tailwind CSS
    Databases & Cloud: PostgreSQL, MongoDB, Redis, AWS, Docker, Kubernetes, Supabase
    Tools & Methodologies: Git, CI/CD, Jest, GraphQL, REST API, Agile, Scrum

    EXPERIENCE
    TechCorp Inc. — Senior Software Engineer
    2021 - Present
    - Architected scalable microservices handling 2M requests/day using Node.js and PostgreSQL.
  `;

  const extracted = extractIdentity(sampleResumeText);
  console.log("Extracted Identity:", extracted);

  assert(extracted.name === "Alex Rivera", "Name extraction matches candidate name", `got: ${extracted.name}`);
  assert(extracted.email === "alex.rivera.dev@example.com", "Email extraction", `got: ${extracted.email}`);
  assert(extracted.phone.replace(/\D/g, "").endsWith("5552345678"), "Phone extraction", `got: ${extracted.phone}`);
  assert(extracted.skills.includes("React"), "Skill extraction includes React");
  assert(extracted.skills.includes("TypeScript"), "Skill extraction includes TypeScript");
  assert(extracted.skills.includes("Node.js"), "Skill extraction includes Node.js");
  assert(extracted.skills.includes("PostgreSQL"), "Skill extraction includes PostgreSQL");
  assert(extracted.skills.includes("Docker"), "Skill extraction includes Docker");
  assert(extracted.skills.length >= 8, "Extracted structured skill set count >= 8", `got: ${extracted.skills.length}`);

  // Test with resume having "Name: Jane Doe" header
  const labeledResumeText = `
    CURRICULUM VITAE
    Candidate Name: Jane Elizabeth Doe
    Email: jane.doe@techpartners.io
    Phone: 9876543210
    Skills: Python, Django, FastAPI, Machine Learning, PyTorch, Docker
  `;
  const labeledExtracted = extractIdentity(labeledResumeText);
  assert(labeledExtracted.name === "Jane Elizabeth Doe", "Labeled name extraction (Candidate Name:)", `got: ${labeledExtracted.name}`);
  assert(labeledExtracted.email === "jane.doe@techpartners.io", "Labeled email extraction", `got: ${labeledExtracted.email}`);
  assert(labeledExtracted.skills.includes("Python") && labeledExtracted.skills.includes("FastAPI"), "Labeled skill extraction includes Python and FastAPI");

  // 2. Test DOCX and PDF parsing libraries with real binary documents
  console.log("\n--- 2. Testing DOCX and PDF Library Integration ---");
  const mammoth = await import("mammoth");
  assert(typeof mammoth.extractRawText === "function", "Mammoth DOCX parser is available");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  assert(typeof pdfjs.getDocument === "function", "PDF.js parser is available");

  const { extractResumeText } = await import("../src/routes/api/public/referrals.ts");
  const { createRealDocxFile, createRealPdfFile } = await import("./helpers.ts");

  // Real DOCX parsing test
  const docxFile = await createRealDocxFile(
    "David Miller",
    "david.miller@example.com",
    "+1 (555) 444-3322",
    ["Java", "Spring Boot", "Docker", "Kubernetes", "AWS"]
  );
  const docxText = await extractResumeText(docxFile);
  const docxExtracted = extractIdentity(docxText);
  console.log("Real DOCX Parsed:", docxExtracted);
  assert(docxExtracted.name === "David Miller", "DOCX Resume Name extraction", `got: ${docxExtracted.name}`);
  assert(docxExtracted.email === "david.miller@example.com", "DOCX Resume Email extraction", `got: ${docxExtracted.email}`);
  assert(docxExtracted.skills.includes("Spring Boot"), "DOCX Resume Skill extraction (Spring Boot)");
  assert(docxExtracted.skills.includes("Docker"), "DOCX Resume Skill extraction (Docker)");

  // Real PDF parsing test
  const pdfFile = createRealPdfFile(
    "Elena Rostova",
    "elena.rostova@example.com",
    "+1 555 777 8899",
    ["Python", "Machine Learning", "PyTorch", "Pandas", "SQL"]
  );
  const pdfText = await extractResumeText(pdfFile);
  const pdfExtracted = extractIdentity(pdfText);
  console.log("Real PDF Parsed:", pdfExtracted);
  assert(pdfExtracted.name === "Elena Rostova", "PDF Resume Name extraction", `got: ${pdfExtracted.name}`);
  assert(pdfExtracted.email === "elena.rostova@example.com", "PDF Resume Email extraction", `got: ${pdfExtracted.email}`);
  assert(pdfExtracted.skills.includes("Python") && pdfExtracted.skills.includes("Machine Learning"), "PDF Resume Skill extraction (Python, ML)");

  // 3. Test Normalization & Duplicate Detection Logic
  console.log("\n--- 3. Testing Duplicate Detection & Normalization ---");
  const { normalizeEmail, normalizePhone } = await import("../src/routes/api/public/referrals.ts");

  assert(normalizeEmail("  Alex.Rivera@Example.COM  ") === "alex.rivera@example.com", "Email normalization (trim + lowercase)");
  assert(normalizePhone("+1 (555) 234-5678") === "15552345678", "Phone normalization (digits only, strip +)");
  assert(normalizePhone("0044 123 456789") === "44123456789", "Phone normalization (strip leading 00)");

  // Verify duplicate logic rules:
  // - Duplicate by email (even if name/phone differ)
  // - Duplicate by phone (even if name/email differ)
  // - Do NOT use name as duplicate requirement
  const existingCandidates = [
    { email_normalized: "john.doe@test.com", phone_normalized: "15550001111", name: "John Doe" }
  ];

  function isDuplicate(email: string, phone: string) {
    const normEmail = normalizeEmail(email);
    const normPhone = normalizePhone(phone);
    return existingCandidates.some(c => c.email_normalized === normEmail || c.phone_normalized === normPhone);
  }

  assert(isDuplicate("john.doe@test.com", "19999999999"), "Duplicate detected by Email (different phone & name)");
  assert(isDuplicate("different.email@test.com", "15550001111"), "Duplicate detected by Phone (different email & name)");
  assert(!isDuplicate("brand.new@test.com", "18887776666"), "Non-duplicate allowed when neither matches");
  assert(!isDuplicate("john.doe@differentcompany.com", "17770002222"), "Different email and phone is not a duplicate even with same name");

  // 4. Test Application Statuses
  console.log("\n--- 4. Testing All 5 Application Statuses ---");
  const { statusLabels } = await import("../src/routes/index.tsx");
  const requiredStatuses = [
    { key: "submitted", label: "Submitted" },
    { key: "shortlisted", label: "Shortlisted" },
    { key: "not_shortlisted", label: "Not Shortlisted" },
    { key: "selected", label: "Selected" },
    { key: "rejected", label: "Rejected" },
  ];

  assert(Object.keys(statusLabels).length === 5, "Exactly 5 statuses defined in statusLabels", `got: ${Object.keys(statusLabels).length}`);
  for (const s of requiredStatuses) {
    assert(statusLabels[s.key as keyof typeof statusLabels] === s.label, `Status '${s.key}' maps to '${s.label}'`);
  }

  // 5. Test Live Server Endpoints & Branding
  console.log("\n--- 5. Testing Live Server Endpoints & Branding ---");
  try {
    const homeRes = await fetch("http://localhost:8080/");
    assert(homeRes.status === 200, "Home page returns HTTP 200");
    const html = await homeRes.text();

    assert(html.includes("Purple Drive Referral"), "Home page includes 'Purple Drive Referral' branding");
    assert(html.includes("/Purple%20drive%20logo.png") || html.includes("Purple drive logo.png"), "Home page includes Purple drive logo");
    assert(html.includes("/favicon.ico"), "Home page links to favicon.ico");
    assert(!html.toLowerCase().includes("referflow"), "Home page contains zero 'referflow' references");
    assert(!html.includes("PurpleDrive Referal"), "Home page contains zero misspelled 'PurpleDrive Referal'");

    // Test Referral Slug Page
    const slugRes = await fetch("http://localhost:8080/j/dev-wqx7g");
    assert(slugRes.status === 200, "Job referral page returns HTTP 200");
    const slugHtml = await slugRes.text();
    assert(slugHtml.includes("Purple Drive Referral"), "Job page includes 'Purple Drive Referral' branding");
    assert(slugHtml.includes("/Purple%20drive%20logo.png") || slugHtml.includes("Purple drive logo.png"), "Job page includes Purple drive logo");
    assert(!slugHtml.includes("PurpleDrive Referal"), "Job page contains zero misspelled 'PurpleDrive Referal'");

    // Test Track Referral API endpoint
    console.log("\n--- 6. Testing Track Referral API ---");
    const trackRes = await fetch("http://localhost:8080/api/public/referrals?email=test@example.com&phone=1234567890");
    assert(trackRes.status === 200, "Track Referral GET endpoint returns HTTP 200");
    const trackData = await trackRes.json();
    assert(Array.isArray(trackData.referrals), "Track Referral returns referrals array", JSON.stringify(trackData));

    // Test Public Referral POST Validation
    const emptyPostRes = await fetch("http://localhost:8080/api/public/referrals", {
      method: "POST",
      body: new FormData(),
    });
    assert(emptyPostRes.status === 400, "POST /api/public/referrals rejects invalid payload with 400");
  } catch (err: any) {
    console.error("Server endpoint test error:", err.message);
    failed++;
  }

  // Summary
  console.log("\n=========================================");
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
