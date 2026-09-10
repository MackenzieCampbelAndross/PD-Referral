-- Migration: Update candidate statuses and add skills column

-- 1. Add skills column if not exists
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure RLS permissions for public referral submission and tracking
GRANT SELECT, INSERT ON public.referrers TO anon, authenticated;
DROP POLICY IF EXISTS "Anyone can create referrer records" ON public.referrers;
CREATE POLICY "Anyone can create referrer records" ON public.referrers FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view referrer records" ON public.referrers;
CREATE POLICY "Anyone can view referrer records" ON public.referrers FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT, INSERT ON public.duplicate_attempts TO anon, authenticated;
DROP POLICY IF EXISTS "Anyone can log duplicate attempts" ON public.duplicate_attempts;
CREATE POLICY "Anyone can log duplicate attempts" ON public.duplicate_attempts FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 3. Update candidate_status enum to the 5 required statuses:
-- submitted, shortlisted, not_shortlisted, selected, rejected
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_status') THEN
    ALTER TABLE public.candidates ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.candidates ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE public.status_history ALTER COLUMN status TYPE text USING status::text;

    UPDATE public.candidates SET status = 'shortlisted' WHERE status IN ('in_review', 'interview', 'offer');
    UPDATE public.candidates SET status = 'selected' WHERE status = 'hired';
    UPDATE public.candidates SET status = 'submitted' WHERE status NOT IN ('submitted', 'shortlisted', 'not_shortlisted', 'selected', 'rejected');

    UPDATE public.status_history SET status = 'shortlisted' WHERE status IN ('in_review', 'interview', 'offer');
    UPDATE public.status_history SET status = 'selected' WHERE status = 'hired';
    UPDATE public.status_history SET status = 'submitted' WHERE status NOT IN ('submitted', 'shortlisted', 'not_shortlisted', 'selected', 'rejected');

    DROP TYPE public.candidate_status;
    CREATE TYPE public.candidate_status AS ENUM (
      'submitted',
      'shortlisted',
      'not_shortlisted',
      'selected',
      'rejected'
    );

    ALTER TABLE public.candidates ALTER COLUMN status TYPE public.candidate_status USING status::public.candidate_status;
    ALTER TABLE public.candidates ALTER COLUMN status SET DEFAULT 'submitted'::public.candidate_status;
    ALTER TABLE public.status_history ALTER COLUMN status TYPE public.candidate_status USING status::public.candidate_status;
  END IF;
END $$;
