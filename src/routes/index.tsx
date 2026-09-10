import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BriefcaseBusiness, Check, Copy, FileText, Link2, LogOut, Plus, Search, Sparkles, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
type CandidateStatus = Database["public"]["Enums"]["candidate_status"];

export const statusLabels: Record<CandidateStatus, string> = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  not_shortlisted: "Not Shortlisted",
  selected: "Selected",
  rejected: "Rejected",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PurpleDrive Referal — Turn introductions into hires" },
      { name: "description", content: "A private referral workspace for sharing roles, collecting resumes, and moving great candidates forward." },
      { property: "og:title", content: "PurpleDrive Referal — Turn introductions into hires" },
      { property: "og:description", content: "Share a role once. Let your network do the sourcing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [showAuth, setShowAuth] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>("all");
  const [trackOpen, setTrackOpen] = useState(false);

  const refreshWorkspace = async (currentUserId: string) => {
    const [{ data: jobRows, error: jobError }, { data: candidateRows, error: candidateError }] = await Promise.all([
      supabase.from("jobs").select("*").eq("recruiter_id", currentUserId).order("created_at", { ascending: false }),
      supabase.from("candidates").select("*").order("submitted_at", { ascending: false }),
    ]);
    if (jobError || candidateError) {
      toast.error("We couldn't load your workspace.");
      return;
    }
    setJobs(jobRows ?? []);
    setCandidates(candidateRows ?? []);
  };

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted && data.user) {
        setUser({ id: data.user.id, email: data.user.email ?? "" });
        void refreshWorkspace(data.user.id);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user;
      setUser(nextUser ? { id: nextUser.id, email: nextUser.email ?? "" } : null);
      if (nextUser) void refreshWorkspace(nextUser.id);
      else {
        setJobs([]);
        setCandidates([]);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const activeCandidates = selectedJob === "all" ? candidates : candidates.filter((candidate) => candidate.job_id === selectedJob);
  const stats = useMemo(() => ({
    roles: jobs.filter((job) => job.status === "open").length,
    referrals: candidates.length,
    shortlisted: candidates.filter((candidate) => candidate.status === "shortlisted").length,
  }), [jobs, candidates]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="/" className="flex items-center gap-3" aria-label="PurpleDrive Referal home">
          <img
            src="/Purple%20drive%20logo.png"
            alt="PurpleDrive Referal"
            className="h-9 w-auto max-w-[140px] object-contain"
          />
          <span className="font-display text-xl font-semibold tracking-tight">PurpleDrive Referal</span>
        </a>
        <nav className="flex items-center gap-2">
          <a href="#track" className="hidden px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex">Track a referral</a>
          {user ? (
            <Button variant="outline" size="sm" onClick={signOut}><LogOut /> Sign out</Button>
          ) : (
            <Button size="sm" onClick={() => setShowAuth(true)}>Recruiter sign in <ArrowRight /></Button>
          )}
        </nav>
      </header>

      {!user ? (
        <>
          <section className="relative mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-20">
            <div className="max-w-2xl">
              <div className="eyebrow"><span className="eyebrow-dot" /> Referral hiring, without the spreadsheet</div>
              <h1 className="mt-7 font-display text-5xl font-semibold leading-[.98] tracking-tight text-foreground sm:text-7xl">Turn introductions into <em className="text-primary">hires.</em></h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">Share a role once. Let your network do the sourcing. PurpleDrive Referal keeps every resume private, catches duplicates automatically, and gives your team a clear path from referral to offer.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => { setAuthMode("signup"); setShowAuth(true); }}>Start recruiting <ArrowRight /></Button>
                <Button size="lg" variant="outline" onClick={() => setTrackOpen(true)}><Search /> Track a referral</Button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-success" /> Automatic duplicate checks</span>
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-success" /> Private resume storage</span>
              </div>
            </div>
            <div className="relative">
              <div className="dashboard-preview">
                <div className="flex items-center justify-between border-b border-border/70 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Your workspace</p><p className="mt-1 font-display text-2xl font-semibold">Hiring pulse</p></div><span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary"><Users className="size-5" /></span></div>
                <div className="grid grid-cols-3 gap-3 py-5"><MiniStat value="12" label="Open roles" accent="warm" /><MiniStat value="38" label="Referrals" accent="cool" /><MiniStat value="6" label="Shortlisted" accent="green" /></div>
                <div className="rounded-2xl border border-border/70 bg-background/80 p-4"><div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold">Recent referrals</span><span className="text-xs text-muted-foreground">This week</span></div><PreviewRow initials="AS" name="Alex Sharma" role="Senior Product Designer" status="Shortlisted" tone="gold" /><PreviewRow initials="MK" name="Maya Kaur" role="Frontend Engineer" status="Submitted" tone="blue" /><PreviewRow initials="JR" name="Jordan Reed" role="Growth Lead" status="Selected" tone="green" /></div>
              </div>
              <div className="absolute -bottom-7 -left-4 hidden w-56 rounded-2xl border border-border bg-card p-4 shadow-xl sm:block"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><span className="size-2 rounded-full bg-success" /> Duplicate check passed</div><p className="mt-2 text-sm font-medium">New referral is ready for review.</p></div>
            </div>
          </section>
          <section className="border-y border-border/70 bg-secondary/45"><div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 sm:grid-cols-3 lg:px-10"><Feature icon={<Link2 />} title="One link per role" copy="Create a shareable referral link in seconds." /><Feature icon={<FileText />} title="Resume-first" copy="Candidate details and skills are extracted automatically from the file." /><Feature icon={<Users />} title="A calmer pipeline" copy="Everyone sees the next step, not another inbox." /></div></section>
        </>
      ) : (
        <Dashboard userEmail={user.email ?? ""} jobs={jobs} candidates={activeCandidates} selectedJob={selectedJob} setSelectedJob={setSelectedJob} stats={stats} onCreate={() => setShowCreate(true)} onRefresh={() => refreshWorkspace(user.id)} />
      )}

      <section id="track" className="mx-auto max-w-7xl px-6 py-20 lg:px-10"><div className="grid gap-8 rounded-3xl border border-border bg-card p-8 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center lg:p-12"><div><div className="eyebrow">For referrers</div><h2 className="mt-4 font-display text-4xl font-semibold tracking-tight">Your introduction has a next step.</h2><p className="mt-3 max-w-xl leading-7 text-muted-foreground">Look up referrals you’ve submitted with the same email and phone number you used on the form.</p></div><Button variant="outline" size="lg" onClick={() => setTrackOpen(true)}><Search /> Check status</Button></div></section>

      {showAuth && <AuthDialog mode={authMode} setMode={setAuthMode} onClose={() => setShowAuth(false)} />}
      {showCreate && user && <CreateJobDialog recruiterId={user.id} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void refreshWorkspace(user.id); }} />}
      {trackOpen && <TrackDialog onClose={() => setTrackOpen(false)} />}
    </main>
  );
}

function MiniStat({ value, label, accent }: { value: string; label: string; accent: string }) { return <div className={`mini-stat mini-stat-${accent}`}><span className="font-display text-2xl font-semibold">{value}</span><span className="mt-1 text-[11px] text-muted-foreground">{label}</span></div>; }
function PreviewRow({ initials, name, role, status, tone }: { initials: string; name: string; role: string; status: string; tone: string }) { return <div className="flex items-center gap-3 border-t border-border/60 py-3 first:border-0 first:pt-0 last:pb-0"><span className={`avatar avatar-${tone}`}>{initials}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="truncate text-xs text-muted-foreground">{role}</p></div><span className="status-pill">{status}</span></div>; }
function Feature({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) { return <div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">{icon}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p></div></div>; }

function Dashboard({ userEmail, jobs, candidates, selectedJob, setSelectedJob, stats, onCreate, onRefresh }: { userEmail: string; jobs: Job[]; candidates: Candidate[]; selectedJob: string; setSelectedJob: (value: string) => void; stats: { roles: number; referrals: number; shortlisted: number }; onCreate: () => void; onRefresh: () => void }) {
  const jobTitle = (jobId: string) => jobs.find((job) => job.id === jobId)?.title ?? "Unknown role";
  const updateStatus = async (candidateId: string, status: CandidateStatus) => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { error } = await supabase.from("candidates").update({ status }).eq("id", candidateId);
    if (error) { toast.error("Could not update status"); return; }
    try {
      await supabase.from("status_history").insert({ candidate_id: candidateId, status, changed_by: authData.user.id });
    } catch (err) {
      console.warn("Could not log status history:", err);
    }
    toast.success("Status updated");
    onRefresh();
  };
  const copyLink = async (slug: string) => { await navigator.clipboard.writeText(`${window.location.origin}/j/${slug}`); toast.success("Referral link copied"); };
  return <section className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-10"><div className="mb-10 flex flex-col justify-between gap-5 border-b border-border pb-8 sm:flex-row sm:items-end"><div><div className="eyebrow"><span className="eyebrow-dot" /> Recruiter workspace</div><h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Good to see you.</h1><p className="mt-2 text-muted-foreground">{userEmail} · Here’s what’s moving.</p></div><Button onClick={onCreate}><Plus /> Create a role</Button></div><div className="grid gap-4 sm:grid-cols-3"><StatCard label="Open roles" value={stats.roles} detail="Shareable links live" icon={<BriefcaseBusiness />} /><StatCard label="Total referrals" value={stats.referrals} detail="Across every role" icon={<Users />} /><StatCard label="Shortlisted" value={stats.shortlisted} detail="Candidates shortlisted" icon={<Sparkles />} /></div><div className="mt-12 grid gap-10 lg:grid-cols-[.8fr_1.5fr]"><div><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl font-semibold">Your roles</h2><span className="text-sm text-muted-foreground">{jobs.length} total</span></div><div className="space-y-3">{jobs.length === 0 ? <EmptyState onCreate={onCreate} /> : jobs.map((job) => <div key={job.id} className={`job-row ${selectedJob === job.id ? "job-row-active" : ""}`}><button className="min-w-0 flex-1 text-left" onClick={() => setSelectedJob(selectedJob === job.id ? "all" : job.id)}><div className="flex items-center gap-2"><span className={`job-dot job-dot-${job.status}`} /><span className="truncate font-medium">{job.title}</span></div><p className="mt-1 text-xs text-muted-foreground">{candidates.filter((candidate) => candidate.job_id === job.id).length} referrals · {job.status === "open" ? "Accepting referrals" : job.status.replace("_", " ")}</p></button><Button size="icon" variant="ghost" aria-label={`Copy referral link for ${job.title}`} onClick={() => void copyLink(job.slug)}><Copy /></Button></div>)}</div></div><div><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-2xl font-semibold">Referral pipeline</h2><p className="mt-1 text-sm text-muted-foreground">{selectedJob === "all" ? "Every role" : jobTitle(selectedJob)}</p></div>{selectedJob !== "all" && <Button size="sm" variant="outline" onClick={() => setSelectedJob("all")}><X /> Clear filter</Button>}</div><div className="overflow-hidden rounded-2xl border border-border bg-card">{candidates.length === 0 ? <div className="p-10 text-center"><Users className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No referrals here yet</p><p className="mt-1 text-sm text-muted-foreground">Share a role link to start the conversation.</p></div> : <div className="divide-y divide-border">{candidates.map((candidate) => <div key={candidate.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className="avatar avatar-blue">{candidate.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="font-medium">{candidate.name}</p><p className="mt-1 text-sm text-muted-foreground">{jobTitle(candidate.job_id)} · {new Date(candidate.submitted_at).toLocaleDateString()}</p>{Array.isArray(candidate.skills) && candidate.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{(candidate.skills as string[]).slice(0, 6).map((skill: string) => <span key={skill} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">{skill}</span>)}{(candidate.skills as string[]).length > 6 && <span className="rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">+{(candidate.skills as string[]).length - 6} more</span>}</div>}</div><Select value={candidate.status} onValueChange={(value) => void updateStatus(candidate.id, value as CandidateStatus)}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}</div>}</div></div></div></section>;
}
function StatCard({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) { return <div className="stat-card"><span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">{icon}</span><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 font-display text-4xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function EmptyState({ onCreate }: { onCreate: () => void }) { return <div className="rounded-2xl border border-dashed border-border p-7 text-center"><BriefcaseBusiness className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Your first role starts here</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Create a role, then share its private referral link.</p><Button className="mt-5" size="sm" onClick={onCreate}><Plus /> Create role</Button></div>; }

function DialogShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) { return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog-panel">{children}</div></div>; }
function DialogHeader({ eyebrow, title, copy, onClose }: { eyebrow: string; title: string; copy: string; onClose: () => void }) { return <div className="flex items-start justify-between gap-5"><div><div className="eyebrow">{eyebrow}</div><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p></div><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button></div>; }
function AuthDialog({ mode, setMode, onClose }: { mode: "signin" | "signup"; setMode: (mode: "signin" | "signup") => void; onClose: () => void }) { const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); const result = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } }); setBusy(false); if (result.error) { toast.error(result.error.message); return; } if (mode === "signup") { toast.success("Account created. Check your email to confirm access."); setMode("signin"); } else { toast.success("Welcome to your workspace"); onClose(); } }; const google = async () => { setBusy(true); const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) toast.error(result.error.message); setBusy(false); }; return <DialogShell onClose={onClose}><DialogHeader eyebrow="Recruiter access" title={mode === "signin" ? "Welcome back." : "Build your referral engine."} copy={mode === "signin" ? "Sign in to manage roles and review your pipeline." : "Create a private workspace for the people you trust."} onClose={onClose} /><form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">{mode === "signup" && <Field label="Your name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required /></Field>}<Field label="Work email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></Field><Field label="Password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength={6} required /></Field><Button className="w-full" size="lg" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create workspace"}<ArrowRight /></Button></form><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="w-full" onClick={() => void google()} disabled={busy}>Continue with Google</Button><button type="button" className="mt-6 block w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Need a recruiter account? Create one" : "Already have an account? Sign in"}</button></DialogShell>; }
function CreateJobDialog({ recruiterId, onClose, onCreated }: { recruiterId: string; onClose: () => void; onCreated: () => void }) { const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [busy, setBusy] = useState(false); const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); const slug = `${base || "role"}-${Math.random().toString(36).slice(2, 7)}`; const { error } = await supabase.from("jobs").insert({ recruiter_id: recruiterId, title: title.trim(), description: description.trim(), slug }); setBusy(false); if (error) { toast.error(error.message); return; } toast.success("Role created. Your link is ready to share."); onCreated(); }; return <DialogShell onClose={onClose}><DialogHeader eyebrow="New role" title="Give your network a reason to reach out." copy="Add the essentials. You can share the referral link as soon as you save." onClose={onClose} /><form onSubmit={(event) => void submit(event)} className="mt-8 space-y-5"><Field label="Role title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Senior Product Designer" required /></Field><Field label="What should referrers know?" hint="Optional"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A quick snapshot of the role, team, or ideal background." rows={5} /></Field><Button className="w-full" size="lg" disabled={busy}>{busy ? "Creating…" : "Create role"}<Plus /></Button></form></DialogShell>; }
function TrackDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<Array<{ candidate_name: string; job_title: string; status: CandidateStatus; submitted_at: string; skills?: string[] }>>([]);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResults([]);
    const response = await fetch(`/api/public/referrals?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    const data = await response.json() as { referrals?: typeof results; error?: string };
    setBusy(false);
    if (!response.ok) {
      toast.error(data.error ?? "No referrals found");
      return;
    }
    if (!data.referrals || data.referrals.length === 0) {
      toast.info("No referrals found for this email and phone.");
      return;
    }
    setResults(data.referrals);
  };
  return (
    <DialogShell onClose={onClose}>
      <DialogHeader eyebrow="Referral status" title="See what’s next." copy="Use the same contact details you shared with your referral." onClose={onClose} />
      <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">
        <Field label="Your email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></Field>
        <Field label="Your phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 555 010 2040" required /></Field>
        <Button className="w-full" size="lg" disabled={busy}>{busy ? "Looking up…" : "Check status"}<Search /></Button>
      </form>
      {results.length > 0 && (
        <div className="mt-7 space-y-3 border-t border-border pt-6 max-h-[360px] overflow-y-auto">
          {results.map((result) => (
            <div key={`${result.candidate_name}-${result.job_title}-${result.submitted_at}`} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary shrink-0"><Check className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{result.candidate_name}</p>
                    <p className="text-xs text-muted-foreground">{result.job_title} · {new Date(result.submitted_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="status-pill shrink-0">{statusLabels[result.status] ?? result.status}</span>
              </div>
              {Array.isArray(result.skills) && result.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 border-t border-border/50 pt-2">
                  {result.skills.slice(0, 5).map((skill) => (
                    <span key={skill} className="rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {skill}
                    </span>
                  ))}
                  {result.skills.length > 5 && (
                    <span className="rounded bg-secondary/50 px-1 py-0.5 text-[9px] text-muted-foreground">
                      +{result.skills.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DialogShell>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 flex items-center justify-between text-sm font-medium">{label}{hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}</span>{children}</label>; }
