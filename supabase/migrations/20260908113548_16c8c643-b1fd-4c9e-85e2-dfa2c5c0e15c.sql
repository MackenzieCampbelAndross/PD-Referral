CREATE TYPE public.job_status AS ENUM ('open', 'closed', 'on_hold');
CREATE TYPE public.candidate_status AS ENUM ('submitted', 'in_review', 'interview', 'offer', 'hired', 'rejected');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  status public.job_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT SELECT ON public.jobs TO anon;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recruiters can view their own jobs" ON public.jobs FOR SELECT TO authenticated USING (recruiter_id = auth.uid());
CREATE POLICY "Anyone can view open jobs by slug" ON public.jobs FOR SELECT TO anon USING (status = 'open');
CREATE POLICY "Recruiters can create their own jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK (recruiter_id = auth.uid());
CREATE POLICY "Recruiters can update their own jobs" ON public.jobs FOR UPDATE TO authenticated USING (recruiter_id = auth.uid()) WITH CHECK (recruiter_id = auth.uid());
CREATE POLICY "Recruiters can delete their own jobs" ON public.jobs FOR DELETE TO authenticated USING (recruiter_id = auth.uid());

CREATE TABLE public.referrers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.referrers TO anon, authenticated;
GRANT ALL ON public.referrers TO service_role;
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create referrer records" ON public.referrers FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.referrers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  resume_file_path TEXT NOT NULL DEFAULT '',
  resume_raw_text TEXT NOT NULL DEFAULT '',
  status public.candidate_status NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.candidates TO anon, authenticated;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create candidate referrals" ON public.candidates FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Recruiters can view candidates for their jobs" ON public.candidates FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = candidates.job_id AND j.recruiter_id = auth.uid()));
CREATE POLICY "Recruiters can update candidates for their jobs" ON public.candidates FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = candidates.job_id AND j.recruiter_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = candidates.job_id AND j.recruiter_id = auth.uid()));

CREATE POLICY "Recruiters can view linked referrers" ON public.referrers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.candidates c JOIN public.jobs j ON j.id = c.job_id WHERE c.referrer_id = referrers.id AND j.recruiter_id = auth.uid()));

CREATE TABLE public.duplicate_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  referrer_name TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  referrer_phone TEXT NOT NULL,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT NOT NULL,
  matched_candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.duplicate_attempts TO anon, authenticated;
GRANT ALL ON public.duplicate_attempts TO service_role;
ALTER TABLE public.duplicate_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log duplicate attempts" ON public.duplicate_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Recruiters can view duplicate attempts for their jobs" ON public.duplicate_attempts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = duplicate_attempts.job_id AND j.recruiter_id = auth.uid()));

CREATE TABLE public.status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  status public.candidate_status NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.status_history TO authenticated;
GRANT ALL ON public.status_history TO service_role;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recruiters can view status history for their candidates" ON public.status_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.candidates c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = status_history.candidate_id AND j.recruiter_id = auth.uid()));
CREATE POLICY "Recruiters can add status history for their candidates" ON public.status_history FOR INSERT TO authenticated WITH CHECK (changed_by = auth.uid() AND EXISTS (SELECT 1 FROM public.candidates c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = status_history.candidate_id AND j.recruiter_id = auth.uid()));

CREATE INDEX candidates_duplicate_lookup_idx ON public.candidates (name_normalized, phone_normalized, email_normalized);
CREATE INDEX candidates_job_idx ON public.candidates (job_id, created_at DESC);
CREATE INDEX jobs_recruiter_idx ON public.jobs (recruiter_id, created_at DESC);
CREATE INDEX duplicate_attempts_job_idx ON public.duplicate_attempts (job_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_referrers_updated_at BEFORE UPDATE ON public.referrers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$ BEGIN INSERT INTO public.profiles (id, full_name, email) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.email, '')); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_candidate_status_updated_at() RETURNS TRIGGER AS $$ BEGIN IF NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_updated_at = now(); END IF; RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER update_candidate_status_timestamp BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.touch_candidate_status_updated_at();