import { z } from "zod";

export const submitSchema = z.object({
  job_slug: z.string().min(3).max(120),
  referrer_name: z.string().trim().min(2).max(120),
  referrer_email: z.string().trim().email().max(200),
  referrer_phone: z.string().trim().min(5).max(40),
});

export const normalizeName = (value: string) => value.toLowerCase().trim().replace(/\s+/g, " ");

export const normalizeEmail = (value: string) => value.toLowerCase().trim();

export const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^00/, "");

// In-memory rate limiter for public submission (abuse protection)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(ip: string, maxRequests = 10, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) {
    return false;
  }
  record.count += 1;
  return true;
}

export async function validateFileContent(file: File): Promise<{ valid: boolean; error?: string }> {
  // File size enforcement: 20 MB max
  if (file.size === 0 || file.size > 20 * 1024 * 1024) {
    return { valid: false, error: "Please attach a resume file under 20 MB." };
  }

  // File format validation: ONLY .pdf and .docx
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".doc") && !lowerName.endsWith(".docx")) {
    return {
      valid: false,
      error: ".doc files are not supported. Please upload a .pdf or .docx resume.",
    };
  }

  if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".docx")) {
    return {
      valid: false,
      error: "Unsupported file format. Please upload a .pdf or .docx resume.",
    };
  }

  // Magic byte verification to prevent spoofed/malformed uploads
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  if (lowerName.endsWith(".pdf")) {
    // %PDF magic bytes (0x25, 0x50, 0x44, 0x46)
    const isPdf =
      fileBytes.length >= 4 &&
      fileBytes[0] === 0x25 &&
      fileBytes[1] === 0x50 &&
      fileBytes[2] === 0x44 &&
      fileBytes[3] === 0x46;
    if (!isPdf) {
      return {
        valid: false,
        error: "The uploaded PDF file has invalid magic bytes or is corrupted.",
      };
    }
  } else if (lowerName.endsWith(".docx")) {
    // Zip signature PK (0x50, 0x4B, 0x03, 0x04)
    const isDocx =
      fileBytes.length >= 4 &&
      fileBytes[0] === 0x50 &&
      fileBytes[1] === 0x4b &&
      (fileBytes[2] === 0x03 || fileBytes[2] === 0x05);
    if (!isDocx) {
      return {
        valid: false,
        error: "The uploaded DOCX file has invalid magic bytes or is corrupted.",
      };
    }
  }

  return { valid: true };
}

export const SKILL_CATALOG = [
  // Languages
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C++",
  "C#",
  "Go",
  "Golang",
  "Rust",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
  "Dart",
  "Scala",
  "R",
  "SQL",
  "HTML",
  "HTML5",
  "CSS",
  "CSS3",
  "Sass",
  "SCSS",
  "Bash",
  "Shell",
  "PowerShell",
  "Perl",
  "Haskell",
  "Lua",
  "Solidity",
  // Frontend & Mobile
  "React",
  "React Native",
  "Next.js",
  "Vue",
  "Vue.js",
  "Nuxt.js",
  "Angular",
  "Svelte",
  "SvelteKit",
  "Tailwind CSS",
  "Bootstrap",
  "Redux",
  "Zustand",
  "Webpack",
  "Vite",
  "Flutter",
  "iOS",
  "Android",
  "jQuery",
  "Material UI",
  "Figma",
  "UI/UX",
  // Backend & Frameworks
  "Node.js",
  "Express",
  "Express.js",
  "NestJS",
  "FastAPI",
  "Django",
  "Flask",
  "Spring",
  "Spring Boot",
  ".NET",
  "ASP.NET",
  "Ruby on Rails",
  "Laravel",
  "GraphQL",
  "REST API",
  "RESTful APIs",
  "gRPC",
  "WebSockets",
  "Microservices",
  "Serverless",
  // Databases & Caching
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "SQLite",
  "MariaDB",
  "Oracle",
  "Microsoft SQL Server",
  "Cassandra",
  "DynamoDB",
  "Elasticsearch",
  "Supabase",
  "Firebase",
  "Prisma",
  "TypeORM",
  "Drizzle",
  // Cloud & DevOps
  "AWS",
  "Amazon Web Services",
  "Azure",
  "Google Cloud",
  "GCP",
  "Docker",
  "Kubernetes",
  "CI/CD",
  "GitHub Actions",
  "GitLab CI",
  "Jenkins",
  "Terraform",
  "Ansible",
  "Linux",
  "Unix",
  "Nginx",
  "Apache",
  "Cloudflare",
  "Vercel",
  // AI / Data Science / ML
  "Machine Learning",
  "Deep Learning",
  "Artificial Intelligence",
  "Data Analysis",
  "Data Science",
  "PyTorch",
  "TensorFlow",
  "Keras",
  "Scikit-Learn",
  "Pandas",
  "NumPy",
  "NLP",
  "Natural Language Processing",
  "Computer Vision",
  "LLM",
  "Generative AI",
  "LangChain",
  "Tableau",
  "Power BI",
  // Testing & Quality
  "Jest",
  "Cypress",
  "Playwright",
  "Mocha",
  "Chai",
  "Selenium",
  "JUnit",
  "Postman",
  "Git",
  "GitHub",
  "GitLab",
  "Jira",
  "Agile",
  "Scrum",
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
      const pdf = await pdfjs.getDocument({
        data: bytes,
        disableFontFace: true,
        useWorkerFetch: false,
      }).promise;
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
        pages.push(
          pageLines.length > 0
            ? pageLines.join("\n")
            : content.items.map((i) => ("str" in i ? i.str : "")).join(" "),
        );
      }
      return pages.join("\n");
    }
  } catch (error) {
    console.error("Resume parsing failed", error);
  }
  return new TextDecoder().decode(bytes);
}

const COMMON_HEADER_WORDS = new Set([
  "resume",
  "curriculum",
  "vitae",
  "cv",
  "summary",
  "profile",
  "objective",
  "experience",
  "education",
  "skills",
  "technical skills",
  "projects",
  "certifications",
  "contact",
  "phone",
  "email",
  "address",
  "linkedin",
  "github",
  "portfolio",
  "page",
  "references",
  "work experience",
  "professional experience",
  "career objective",
  "personal details",
  "about me",
  "software engineer",
  "developer",
  "frontend",
  "backend",
  "full stack",
  "designer",
  "product manager",
  "analyst",
  "intern",
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
    const valid = emailMatches.find(
      (m) => !m.endsWith(".png") && !m.endsWith(".jpg") && !m.endsWith(".jpeg"),
    );
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
    const labelMatch = line.match(
      /^(?:name|full\s*name|candidate\s*name)\s*[:\-]\s*([A-Za-z][A-Za-z\s.'-]{1,60})/i,
    );
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
    const inlineMatch = cleaned.match(
      /^([A-Za-z][A-Za-z .'-]{2,50}?)(?=\s+(?:email|phone|contact|linkedin|\+?\d|[a-zA-Z0-9._%+-]+@))/i,
    );
    if (inlineMatch && inlineMatch[1]) {
      const cand = inlineMatch[1].trim();
      const words = cand.split(/\s+/).filter(Boolean);
      if (
        words.length >= 2 &&
        words.length <= 4 &&
        !words.some((w) => COMMON_HEADER_WORDS.has(w.toLowerCase()))
      ) {
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
        !COMMON_HEADER_WORDS.has(line.toLowerCase()),
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
  const skillsSectionRegex =
    /(?:technical\s*skills|skills|core\s*competencies|technologies|areas\s*of\s*expertise)\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:experience|work|education|projects|certifications|employment|history|$))/i;
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
export interface DevReferralRecord {
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
