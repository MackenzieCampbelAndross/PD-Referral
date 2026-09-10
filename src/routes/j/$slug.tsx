import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, FileUp, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/j/$slug")({
  head: () => ({
    meta: [
      { title: "Submit a referral — PurpleDrive Referal" },
      { name: "description", content: "Refer someone exceptional for an open role." },
      { property: "og:title", content: "Submit a referral — PurpleDrive Referal" },
      { property: "og:description", content: "Refer someone exceptional for an open role." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralPage,
});

function ReferralPage() {
  const { slug } = Route.useParams();
  const [job, setJob] = useState<{ id: string; title: string; description: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    void supabase
      .from("jobs")
      .select("id,title,description")
      .eq("slug", slug)
      .eq("status", "open")
      .maybeSingle()
      .then(({ data }) => {
        setJob(data);
        setLoading(false);
      });
  }, [slug]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast.error("Please attach the candidate’s resume.");
      return;
    }
    if (!job) return;
    setBusy(true);

    const body = new FormData();
    body.append("job_slug", slug);
    body.append("referrer_name", form.name);
    body.append("referrer_email", form.email);
    body.append("referrer_phone", form.phone);
    body.append("resume", file);

    const response = await fetch("/api/public/referrals", { method: "POST", body });
    const data = (await response.json()) as { duplicate?: boolean; error?: string };
    setBusy(false);

    if (data.duplicate) {
      toast.error("This candidate has already been referred.");
      return;
    }
    if (!response.ok) {
      toast.error(data.error ?? "We couldn’t send this referral.");
      return;
    }
    setSubmitted(true);
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-3" aria-label="PurpleDrive Referal home">
          <img
            src="/Purple%20drive%20logo.png"
            alt="PurpleDrive Referal"
            className="h-9 w-auto max-w-[140px] object-contain"
          />
          <span className="font-display text-xl font-semibold tracking-tight">PurpleDrive Referal</span>
        </a>
        <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back home
        </a>
      </header>

      {loading ? (
        <div className="mx-auto max-w-xl px-6 py-28 text-center">
          <div className="loading-bar" />
          <p className="mt-5 text-sm text-muted-foreground">Loading this role…</p>
        </div>
      ) : !job ? (
        <div className="mx-auto max-w-xl px-6 py-28 text-center">
          <span className="flex size-14 mx-auto items-center justify-center rounded-2xl bg-secondary text-primary">
            <FileUp />
          </span>
          <h1 className="mt-6 font-display text-4xl font-semibold">This role is no longer open.</h1>
          <p className="mt-3 leading-7 text-muted-foreground">
            The referral link may have expired or the team may have filled the role.
          </p>
          <Button asChild className="mt-7">
            <a href="/">
              Explore PurpleDrive Referal <ArrowRight />
            </a>
          </Button>
        </div>
      ) : submitted ? (
        <SuccessState candidateFile={file?.name ?? "resume"} />
      ) : (
        <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start lg:pt-20">
          <div className="lg:sticky lg:top-10">
            <div className="eyebrow">
              <span className="eyebrow-dot" /> Someone thought of someone great
            </div>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1] tracking-tight sm:text-6xl">
              Refer for <em className="text-primary">{job.title}</em>
            </h1>
            <p className="mt-6 whitespace-pre-line text-lg leading-8 text-muted-foreground">
              {job.description || "Know someone who would be a strong fit? Send their resume and we’ll take it from here."}
            </p>
            <div className="mt-10 space-y-4 border-t border-border pt-6 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>The resume is stored privately and only shared with the hiring team.</span>
              </div>
              <div className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                <span>Candidate details and skills are read automatically from the resume.</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-9">
            <div className="mb-8">
              <p className="text-sm font-semibold text-primary">Your details</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">Make the introduction.</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We’ll use this to keep you updated on the referral.
              </p>
            </div>
            <form onSubmit={(event) => void submit(event)} className="space-y-5">
              <Field label="Your name">
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Jordan Lee"
                  required
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Your email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="jordan@example.com"
                    required
                  />
                </Field>
                <Field label="Your phone">
                  <Input
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    placeholder="+1 555 010 2040"
                    required
                  />
                </Field>
              </div>
              <Field label="Candidate resume">
                <label className={`upload-zone ${file ? "upload-zone-filled" : ""}`}>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    className="sr-only"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    required
                  />
                  <FileUp className="mx-auto size-7 text-primary" />
                  <span className="mt-3 block font-medium">
                    {file ? file.name : "Drop a resume here or browse"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    PDF or DOCX · up to 20 MB
                  </span>
                </label>
              </Field>
              <p className="text-xs leading-5 text-muted-foreground">
                By submitting, you confirm you have permission to share this resume for this role.
              </p>
              <Button className="w-full" size="lg" disabled={busy}>
                {busy ? "Reading the resume…" : "Send referral"}
                <ArrowRight />
              </Button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}

function SuccessState({ candidateFile }: { candidateFile: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-28 text-center">
      <span className="success-mark">
        <Check />
      </span>
      <div className="eyebrow mt-7 justify-center">Referral sent</div>
      <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">That introduction is in motion.</h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">
        We read <strong className="text-foreground">{candidateFile}</strong>, saved the candidate securely, and sent
        the referral to the hiring team.
      </p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-left text-sm leading-6 text-muted-foreground">
        <span className="font-semibold text-foreground">Want to check progress later?</span> Use the email and phone
        number you submitted on the PurpleDrive Referal home page.
      </div>
      <Button asChild variant="outline" className="mt-8">
        <a href="/">Back to PurpleDrive Referal</a>
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}