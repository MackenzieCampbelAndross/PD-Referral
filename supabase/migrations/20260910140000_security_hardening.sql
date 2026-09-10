-- Migration: Security hardening for Purple Drive Referral

-- 1. Remove overly broad public SELECT policy on referrers
DROP POLICY IF EXISTS "Anyone can view referrer records" ON public.referrers;

-- 2. Ensure referrers can only be viewed by authenticated recruiters for their linked candidates
DROP POLICY IF EXISTS "Recruiters can view linked referrers" ON public.referrers;
CREATE POLICY "Recruiters can view linked referrers" ON public.referrers
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND EXISTS (
    SELECT 1 FROM public.candidates c
    JOIN public.jobs j ON j.id = c.job_id
    WHERE c.referrer_id = public.referrers.id
      AND j.recruiter_id = auth.uid()
  )
);

-- 3. Restrict duplicate_attempts to authenticated recruiters with @purpledrive.com emails
DROP POLICY IF EXISTS "Recruiters can view duplicate attempts for their jobs" ON public.duplicate_attempts;
CREATE POLICY "Recruiters can view duplicate attempts for their jobs" ON public.duplicate_attempts
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = public.duplicate_attempts.job_id
      AND j.recruiter_id = auth.uid()
  )
);

-- 4. Ensure candidates SELECT and UPDATE enforce @purpledrive.com check
DROP POLICY IF EXISTS "Recruiters can view candidates for their jobs" ON public.candidates;
CREATE POLICY "Recruiters can view candidates for their jobs" ON public.candidates
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = public.candidates.job_id
      AND j.recruiter_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Recruiters can update candidates for their jobs" ON public.candidates;
CREATE POLICY "Recruiters can update candidates for their jobs" ON public.candidates
FOR UPDATE TO authenticated
USING (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = public.candidates.job_id
      AND j.recruiter_id = auth.uid()
  )
);

-- 5. Ensure jobs queries enforce @purpledrive.com check for recruiter management
DROP POLICY IF EXISTS "Recruiters can view own jobs" ON public.jobs;
CREATE POLICY "Recruiters can view own jobs" ON public.jobs
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND auth.uid() = recruiter_id
);

DROP POLICY IF EXISTS "Recruiters can create jobs" ON public.jobs;
CREATE POLICY "Recruiters can create jobs" ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND auth.uid() = recruiter_id
);

DROP POLICY IF EXISTS "Recruiters can update own jobs" ON public.jobs;
CREATE POLICY "Recruiters can update own jobs" ON public.jobs
FOR UPDATE TO authenticated
USING (
  (auth.jwt() ->> 'email') ILIKE '%@purpledrive.com'
  AND auth.uid() = recruiter_id
);

-- 6. Enforce @purpledrive.com domain on new user profile creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF LOWER(NEW.email) NOT LIKE '%@purpledrive.com' THEN
    RAISE EXCEPTION 'Only @purpledrive.com accounts can access Purple Drive Referral.';
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;

  RETURN NEW;
END;
$$;
