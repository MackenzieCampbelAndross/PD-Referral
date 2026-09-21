# Referral Linker

Claude finished the response

Updated memory

Designing a recruiter referral platform with duplicate detection.

Good — that gives me a clear picture. Here's how I'd structure it:

Core entities

Job — title, description, recruiter owner, referral link (unique slug/token)

Recruiter — creates jobs, generates links, sees referrals for their jobs

Referral — referrer's name, phone, email + the job it's tied to + timestamp

Candidate — name, phone, email, resume file, parsed resume text, linked to the referral that brought them in, status

The duplicate-check flow

Referrer opens the job-specific link, fills in their own details, uploads the candidate's resume.

Before final submission, the system needs the candidate's name/phone/email — either:

Parsed automatically from the resume (via a resume-parsing step — extracts name, phone, email from the PDF/DOCX), or

Entered manually by the referrer alongside the upload (more reliable, no parsing errors)

System checks name + phone + email against the candidates table.

All three match (or a strong majority, e.g. phone is usually the most unique identifier) → blocked, shown "This candidate has already been referred."

No match → candidate + referral saved, status set to "Submitted."

One decision point: resume parsing to auto-fill name/phone/email is a nice UX touch but parsing accuracy varies (formatting, scanned PDFs, etc.). Many staffing tools use parsing to pre-fill the fields but still let the referrer confirm/edit them before the duplicate check runs — that avoids blocking someone incorrectly due to a bad parse.

Status view

Referrers see the status of who they've referred (e.g., Submitted → In Review → Interview → Offer/Hired/Rejected). Recruiters get a dashboard across all their job's referrals to update status.

Recommended stack (real build, not a demo)

Since this needs a persistent database, file storage for resumes, and duplicate-checking logic, this is a proper full-stack app — not something that fits in a chat artifact. Typical stack:

Frontend: Next.js/React (web app, responsive)

Backend: Node/Next API routes or a small backend service

Database: PostgreSQL (candidates, jobs, referrals, recruiters)

File storage: S3 or equivalent for resumes

Resume parsing (optional): a parsing API/library to auto-extract name/phone/email

What would be most useful from me right now?Both

Should candidates confirm/edit their parsed details before submission, or should it be fully automatic?Fully automatic from resume parsing

Created 2 files, edited a memory, and 2 more tools

Both are ready. A couple of notes on the prototype:

It's fully clickable — create a job, copy its link, switch to "Refer a Candidate," submit a candidate, and watch the duplicate check block a repeat submission. Data persists across reloads (stored in your browser session).

Real resume file upload is just for show — actual PDF/DOCX parsing needs a server-side parsing engine, so I added a "resume text" field that stands in for what a real parser would extract (name, phone, email). The spec doc flags this and recommends parsing services to use in the real build.

Duplicate check is exact match on name + phone + email, as you specified — the spec doc flags one thing worth reconsidering with your team before launch (typos in names could let a real duplicate slip through if all three fields aren't identical).

The spec doc covers the data model, both flows, the parsing/dedupe logic, a status workflow, a recommended stack, and an API sketch — enough to hand straight to a developer.

Purple drive referral prototype

Code·JSX 

Purple drive referral system spec

Document·MD 

Write a message…

Claude is AI and can make mistakes.

Purple drive referral system spec · MD

Candidate Referral System — Technical Spec

1. Overview

A web app that lets recruiters generate a unique referral link per job opening. Anyone with that link can submit a candidate (with resume) for the role. The system automatically checks the candidate against the existing candidate database on name, phone, and email, and blocks the submission if that candidate has already been referred. Recruiters and referrers can both view referral status.

Platform: browser-based web app, no native app required. Fresh database — no existing ATS integration.

2. User Roles

RoleAccessRecruiterLogged-in. Creates jobs, gets the referral link, views/updates status of all candidates for their jobs.ReferrerNo login required. Opens a job-specific link, submits their own contact details + a candidate's resume. Can look up status later via email/phone.Admin (optional, phase 2)Manage recruiters, jobs across the org, reporting.

3. Data Model

recruiters

id (uuid, pk)

name

email (unique)

password_hash / SSO identifier

created_at

jobs

id (uuid, pk)

recruiter_id (fk → recruiters)

title

slug (unique, used in the referral URL)

status (open / closed / on-hold)

created_at

referrers

id (uuid, pk)

name

phone

email

created_at

(a referrer can submit multiple candidates over time — dedupe referrers by phone or email if you want a single referrer record reused across submissions)

candidates

id (uuid, pk)

job_id (fk → jobs)

referrer_id (fk → referrers)

name

phone (normalized, digits only, stored alongside raw)

email (normalized lowercase, stored alongside raw)

resume_file_url (pointer to object storage)

resume_raw_text (extracted text, used for parsing/search)

status (enum: Submitted, In Review, Interview, Offer, Hired, Rejected)

submitted_at

status_updated_at

status_history (optional, for an audit trail)

id

candidate_id (fk)

status

changed_by (recruiter_id)

changed_at

4. Core Flows

4.1 Job creation & link generation

Recruiter logs in, enters a job title (and optional description).

System generates a unique slug (title-xxxx with a random suffix, or a short random token) and stores the job.

Referral link: https://refer.<yourdomain>.com/j/<slug>.

Recruiter copies/shares the link (email, WhatsApp, LinkedIn, etc.).

4.2 Referral submission

Referrer opens the link — the job is identified from the URL, no login needed.

Form fields: referrer name, phone, email; resume file upload (PDF/DOCX).

On upload, the resume is sent to a resume-parsing step (see §5) to extract the candidate's name, phone, and email automatically — no manual edit step, per requirements.

The extracted candidate identity is checked against the candidates table (§5.2).

Match found → submission is rejected with a clear message ("This candidate has already been referred") and nothing is written to the database.

No match → a new candidates row is created (status = Submitted), linked to the job and to the referrer (a referrers row is created or reused if that email/phone already exists).

Referrer sees a confirmation screen.

4.3 Status tracking

Recruiter view: dashboard per job, listing all candidates with current status; recruiter updates status via a dropdown/select, which writes to status_history.

Referrer view: a lightweight lookup — referrer enters their own email or phone, sees the candidates they've referred and each one's current status. No login required, so this must not expose candidate resumes or other referrers' data — only what that referrer submitted.

5. Resume Parsing & Duplicate Detection

5.1 Parsing

Use a resume-parsing service/library to extract name, phone, and email from the uploaded file (PDF/DOCX/image).

Options: a hosted parsing API (e.g., Affinda, Sovren, RChilli, HireAbility), or a self-hosted pipeline (text extraction via pdf-parse/mammoth + regex/NER for phone & email, and a name-extraction heuristic or a lightweight LLM call).

Because this step is fully automatic, budget for parsing failures: if no phone/email can be extracted, the safest default is to reject the submission and ask the referrer to re-upload a clearer file, rather than silently letting an unidentifiable candidate through the duplicate check.

Store resume_raw_text regardless, so a human can review it later if the parse looks wrong.

5.2 Duplicate check

Normalize before comparing:

Phone → digits only, drop country code formatting differences.

Email → lowercase, trimmed.

Name → lowercase, trimmed, collapsed whitespace.

Per current spec: a candidate is a duplicate when name, phone, and email all match an existing record.

This is the exact-match approach implemented in the prototype.

Recommended refinement for production: treat phone OR email match alone as a strong duplicate signal (people's names get spelled differently, resumes get updated), and only require name similarity as a secondary check — otherwise near-duplicate submissions with typos will slip through. Worth revisiting with the team before launch.

On duplicate: log the attempt (who tried to refer whom, when) even though nothing is created — useful for recruiters to see "this person has already been referred by someone else."

6. Status Workflow

Submitted → In Review → Interview → Offer → Hired
↘ Rejected (can happen from any stage)

Recruiters can move a candidate to any status manually; no forced linear flow is required in v1.

7. Recommended Tech Stack

Frontend: React (Next.js) — server-rendered pages for the public referral form (fast, SEO not needed but good for link previews), client app for the recruiter dashboard.

Backend: Next.js API routes or a standalone Node/Express service.

Database: PostgreSQL (relational data, straightforward duplicate-check queries).

File storage: S3-compatible object storage for resumes (signed URLs, not public).

Resume parsing: hosted parsing API to start (fastest to ship); revisit self-hosted if volume/cost demands it.

Auth: recruiter login via email/password or SSO (Google Workspace, if the company uses it).

Hosting: Vercel/Render/AWS — any of these work; pick based on existing company infrastructure.

8. API Sketch

MethodEndpointPurposePOST/api/jobsRecruiter creates a job, returns slug/linkGET/api/jobs/:slugPublic — resolve a link to job info for the referral formPOST/api/jobs/:slug/referralsPublic — submit referrer + resume, triggers parsing + dedupeGET/api/recruiter/jobs/:id/candidatesRecruiter — list candidates + statuses for a jobPATCH/api/candidates/:id/statusRecruiter — update statusGET/api/track?email=&phone=Public — referrer looks up their own submissions' status

9. Non-functional Considerations

PII handling: candidate and referrer phone/email are personal data — store securely, restrict access to authorized recruiters, define a retention policy.

File security: resumes should never be publicly accessible; use signed, time-limited URLs.

Rate limiting: the public referral endpoint should be rate-limited/captcha-protected to prevent spam submissions.

Consent: consider a short notice on the referral form about how the candidate's data will be used/stored, especially if operating in jurisdictions with data-protection requirements.

10. Open Questions for the Team

Should a referrer be able to see why their referral is stuck at a certain status, or just the status label?

Should recruiters be notified (email/Slack) instantly when a new referral comes in?

Should the duplicate-check rule (§5.2) require all three fields or treat phone/email alone as sufficient? Recommend revisiting before launch.

Any need to track referral rewards/incentives (e.g., a bonus paid to referrers when a candidate is hired)? Not in current scope but common in referral programs — worth flagging now if likely to be added later.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://refer-bright.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/06a70722-a572-4edd-b69a-241bf595d575).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
