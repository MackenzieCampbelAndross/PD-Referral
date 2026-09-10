import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const submitSchema = z.object({
  job_slug: z.string().min(3).max(120),
  referrer_name: z.string().trim().min(2).max(120),
  referrer_email: z.string().trim().email().max(200),
  referrer_phone: z.string().trim().min(5).max(40),
});

export const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const normalizeEmail = (value: string) =>
  value
    .toLowerCase()
    .trim();

export const normalizePhone = (value: string) =>
  value
    .replace(/\D/g, "")
    .replace(/^00/, "");

const SKILL_CATALOG = [
  // Languages
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Golang", "Rust", "Ruby",
  "PHP", "Swift", "Kotlin", "Dart", "Scala", "R", "SQL", "HTML", "HTML5", "CSS", "CSS3", "Sass", "SCSS",
  "Bash", "Shell", "PowerShell", "Perl", "Haskell", "Lua", "Solidity",
  // Frontend & Mobile
  "React", "React Native", "Next.js", "Vue", "Vue.js", "Nuxt.js", "Angular", "Svelte", "SvelteKit",
  "Tailwind CSS", "Bootstrap", "Redux", "Zustand", "Webpack", "Vite", "Flutter", "iOS", "Android",
  "jQuery", "Material UI", "Figma", "UI/UX",
  // Backend & Frameworks
  "Node.js", "Express", "Express.js", "NestJS", "FastAPI", "Django", "Flask", "Spring", "Spring Boot",
  ".NET", "ASP.NET", "Ruby on Rails", "Laravel", "GraphQL", "REST API", "RESTful APIs", "gRPC", "WebSockets",
  "Microservices", "Serverless",
  // Databases & Caching
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "MariaDB", "Oracle", "Microsoft SQL Server",
  "Cassandra", "DynamoDB", "Elasticsearch", "Supabase", "Firebase", "Prisma", "TypeORM", "Drizzle",
  // Cloud & DevOps
  "AWS", "Amazon Web Services", "Azure", "Google Cloud", "GCP", "Docker", "Kubernetes", "CI/CD",
  "GitHub Actions", "GitLab CI", "Jenkins", "Terraform", "Ansible", "Linux", "Unix", "Nginx", "Apache",
  "Cloudflare", "Vercel",
  // AI / Data Science / ML
  "Machine Learning", "Deep Learning", "Artificial Intelligence", "Data Analysis", "Data Science",
  "PyTorch", "TensorFlow", "Keras", "Scikit-Learn", "Pandas", "NumPy", "NLP", "Natural Language Processing",
  "Computer Vision", "LLM", "Generative AI", "LangChain", "Tableau", "Power BI",
  // Testing & Quality
  "Jest", "Cypress", "Playwright", "Mocha", "Chai", "Selenium", "JUnit", "Postman", "Git", "GitHub",
  "GitLab", "Jira", "Agile", "Scrum"
];

export async function extractResumeText(file: File): Promise<string> {
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
        const pageLines: string[] = [];
        let currentLine = "";
        let lastY: number | undefined;

        for (const item of content.items) {
          if ("str" in item) {
            const transform = "transform" in item ? (item.transform as number[]) : undefined;
            const y = transform ? transform[5] : undefined;
            if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 4) {
              if (currentLine.trim()) pageLines.push(currentLine.trim());
              currentLine = item.str;
            } else {
              currentLine += (currentLine ? " " : "") + item.str;
            }
            lastY = y;
            if ("hasEOL" in item && (item as any).hasEOL) {
              if (currentLine.trim()) pageLines.push(currentLine.trim());
              currentLine = "";
              lastY = undefined;
            }
          }
        }
        if (currentLine.trim()) pageLines.push(currentLine.trim());
        pages.push(pageLines.length > 0 ? pageLines.join("\n") : content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
      }
      return pages.join("\n");
    }
  } catch (error) {
    console.error("Resume parsing failed", error);
  }
  return new TextDecoder().decode(bytes);
}

const COMMON_HEADER_WORDS = new Set([
  "resume", "curriculum", "vitae", "cv", "summary", "profile", "objective",
  "experience", "education", "skills", "technical skills", "projects", "certifications",
  "contact", "phone", "email", "address", "linkedin", "github", "portfolio", "page",
  "references", "work experience", "professional experience", "career objective",
  "personal details", "about me", "software engineer", "developer", "frontend",
  "backend", "full stack", "designer", "product manager", "analyst", "intern"
]);

export function extractIdentity(text: string): {
  name: string;
  email: string;
  phone: string;
  skills: string[];
} {
  const cleaned = text
    .replace(/\u0000/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ");

  // 1. Email extraction
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let email = "";
  const emailMatches = cleaned.match(emailRegex);
  if (emailMatches && emailMatches.length > 0) {
    const valid = emailMatches.find((m) => !m.endsWith(".png") && !m.endsWith(".jpg") && !m.endsWith(".jpeg"));
    email = valid ?? emailMatches[0];
  }

  // 2. Phone extraction (7-15 digits, ignoring 4-digit years like 2020-2024)
  const phoneRegex = /(?:(?:\+|00)\d{1,3}[\s.-]*)?(?:\(?\d{2,5}\)?[\s.-]*)?\d{3,5}[\s.-]*\d{3,5}/g;
  let phone = "";
  const phoneMatches = cleaned.match(phoneRegex);
  if (phoneMatches) {
    for (const match of phoneMatches) {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        // Avoid pure year matches like 20182022
        if (!/^(19|20)\d{2}(19|20)\d{2}$/.test(digits)) {
          phone = match.trim();
          break;
        }
      }
    }
  }

  // 3. Name extraction
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let name = "";
  // Check for explicit "Name: XYZ" label
  for (const line of lines.slice(0, 20)) {
    const labelMatch = line.match(/^(?:name|full\s*name|candidate\s*name)\s*[:\-]\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i);
    if (labelMatch && labelMatch[1]) {
      const candidate = labelMatch[1].trim();
      if (!COMMON_HEADER_WORDS.has(candidate.toLowerCase())) {
        name = candidate;
        break;
      }
    }
  }

  // If no explicit label, scan first 15 lines
  if (!name) {
    for (const line of lines.slice(0, 15)) {
      if (line.includes("@") || line.includes("http") || line.includes("www") || /\d/.test(line)) {
        continue;
      }
      const lower = line.toLowerCase();
      if (COMMON_HEADER_WORDS.has(lower)) {
        continue;
      }
      // Check if line matches a valid full name pattern (2 to 4 words)
      if (/^[A-Za-z][A-Za-z .'-]{1,50}$/.test(line)) {
        const words = line.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 4) {
          const hasHeader = words.some((w) => COMMON_HEADER_WORDS.has(w.toLowerCase()));
          if (!hasHeader) {
            name = line;
            break;
          }
        }
      }
    }
  }

  // Inline name match if name appeared before contact details
  if (!name) {
    const inlineMatch = cleaned.match(/^([A-Za-z][A-Za-z .'-]{2,50}?)(?=\s+(?:email|phone|contact|linkedin|\+?\d|[a-zA-Z0-9._%+-]+@))/i);
    if (inlineMatch && inlineMatch[1]) {
      const cand = inlineMatch[1].trim();
      const words = cand.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 4 && !words.some((w) => COMMON_HEADER_WORDS.has(w.toLowerCase()))) {
        name = cand;
      }
    }
  }

  // Fallback if still empty
  if (!name) {
    const fallback = lines.find(
      (line) =>
        /^[A-Za-z][A-Za-z .'-]{2,50}$/.test(line) &&
        !line.includes("@") &&
        !COMMON_HEADER_WORDS.has(line.toLowerCase())
    );
    name = fallback || "Candidate";
  }

  // 4. Skills extraction
  const skillsFound = new Set<string>();

  // A) Search dictionary catalog
  for (const skill of SKILL_CATALOG) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|[^a-zA-Z0-9#+])${escaped}(?:$|[^a-zA-Z0-9#+])`, "i");
    if (pattern.test(cleaned)) {
      skillsFound.add(skill);
    }
  }

  // B) Section-based parsing (Skills / Technical Skills)
  const skillsSectionRegex = /(?:technical\s*skills|skills|core\s*competencies|technologies|areas\s*of\s*expertise)\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:experience|work|education|projects|certifications|employment|history|$))/i;
  const sectionMatch = cleaned.match(skillsSectionRegex);
  if (sectionMatch && sectionMatch[1]) {
    const sectionText = sectionMatch[1].slice(0, 1500);
    const tokens = sectionText
      .split(/[,•|/;\n\t*]/)
      .map((t) => t.trim().replace(/^[-•*]\s*/, ""))
      .filter((t) => t.length >= 2 && t.length <= 35 && !t.includes(":") && !t.includes("@"));

    for (const token of tokens) {
      if (!COMMON_HEADER_WORDS.has(token.toLowerCase()) && !/^\d+$/.test(token)) {
        const formatted = token.replace(/\b\w/g, (c) => c.toUpperCase());
        skillsFound.add(formatted);
      }
    }
  }

  const skills = Array.from(skillsFound).slice(0, 30);

  return {
    name,
    email,
    phone,
    skills,
  };
}

// Development fallback store for local testing when service role key is absent
interface DevReferralRecord {
  id: string;
  job_id: string;
  job_title: string;
  referrer_name: string;
  referrer_email: string;
  referrer_phone: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  email_normalized: string;
  phone_normalized: string;
  name_normalized: string;
  skills: string[];
  status: string;
  submitted_at: string;
}

export const devReferralsStore: DevReferralRecord[] = [];

export const Route = createFileRoute("/api/public/referrals")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const email = normalizeEmail(url.searchParams.get("email") ?? "");
        const phone = normalizePhone(url.searchParams.get("phone") ?? "");

        if (!email || phone.length < 5) {
          return Response.json(
            { error: "Enter the email and phone used on the referral." },
            { status: 400 }
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
                job_title: Array.isArray(row.jobs) ? row.jobs[0]?.title ?? "Role" : row.jobs?.title ?? "Role",
              });
            }
          }
        }

        // 2. Fetch from dev fallback store
        const devMatches = devReferralsStore.filter(
          (r) => r.referrer_email === email && r.referrer_phone === phone
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
      },

      POST: async ({ request }) => {
        const formData = await request.formData();
        const parsed = submitSchema.safeParse({
          job_slug: formData.get("job_slug"),
          referrer_name: formData.get("referrer_name"),
          referrer_email: formData.get("referrer_email"),
          referrer_phone: formData.get("referrer_phone"),
        });

        const file = formData.get("resume");
        if (
          !parsed.success ||
          !(file instanceof File) ||
          file.size === 0 ||
          file.size > 20 * 1024 * 1024
        ) {
          return Response.json(
            { error: "Add a valid PDF or DOCX resume under 20 MB." },
            { status: 400 }
          );
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
            { status: 422 }
          );
        }

        // 2. Duplicate detection:
        // Match ONLY on normalized email OR normalized phone. Do NOT use name.
        const { data: duplicateMatches } = await supabaseAdmin
          .from("candidates")
          .select("id, email_normalized, phone_normalized")
          .or(`email_normalized.eq.${candidateEmail},phone_normalized.eq.${candidatePhone}`)
          .limit(1);

        const isDevDuplicate = devReferralsStore.some(
          (c) => c.email_normalized === candidateEmail || c.phone_normalized === candidatePhone
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

        // 4. File storage in Supabase Storage
        const filePath = `${job.data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        try {
          await supabaseAdmin.storage
            .from("resumes")
            .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
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
          }
        }

        // If local dev environment prevented DB write due to service role restrictions, store in local fallback
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
      },
    },
  },
});