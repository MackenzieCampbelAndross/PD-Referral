DROP POLICY IF EXISTS "Anyone can create referrer records" ON public.referrers;
REVOKE INSERT ON public.referrers FROM anon, authenticated;

DROP POLICY IF EXISTS "Anyone can log duplicate attempts" ON public.duplicate_attempts;
REVOKE INSERT ON public.duplicate_attempts FROM anon, authenticated;

DROP POLICY IF EXISTS "Recruiters can view resumes for their candidates" ON storage.objects;
CREATE POLICY "Recruiters can view resumes for their candidates"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    JOIN public.jobs j ON j.id = c.job_id
    WHERE storage.objects.name = c.resume_file_path
      AND j.recruiter_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Recruiters can delete resumes for their candidates" ON storage.objects;
CREATE POLICY "Recruiters can delete resumes for their candidates"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1
    FROM public.candidates c
    JOIN public.jobs j ON j.id = c.job_id
    WHERE storage.objects.name = c.resume_file_path
      AND j.recruiter_id = auth.uid()
  )
);