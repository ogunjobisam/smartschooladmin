ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admissions_slug text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admissions_open boolean NOT NULL DEFAULT false;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admissions_intro text;

UPDATE public.schools
SET admissions_slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
                      || '-' || substr(id::text, 1, 6)
WHERE admissions_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_admissions_slug
  ON public.schools(admissions_slug) WHERE admissions_slug IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status') THEN
    CREATE TYPE public.application_status AS ENUM (
      'new', 'reviewing', 'interview', 'offered', 'accepted', 'enrolled', 'rejected', 'withdrawn'
    );
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.application_reference_seq;

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE DEFAULT (
    'APP-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.application_reference_seq')::text, 5, '0')
  ),
  status public.application_status NOT NULL DEFAULT 'new',
  applicant_first_name text NOT NULL,
  applicant_last_name text NOT NULL,
  date_of_birth date,
  gender text,
  section public.school_section,
  desired_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  previous_school text,
  guardian_name text NOT NULL,
  guardian_email text,
  guardian_phone text NOT NULL,
  guardian_address text,
  source text,
  message text,
  decision_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  converted_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
GRANT USAGE ON SEQUENCE public.application_reference_seq TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_applications_school_status
  ON public.applications(school_id, status, created_at DESC);

DROP TRIGGER IF EXISTS update_applications_updated_at ON public.applications;
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admissions staff can view applications" ON public.applications;
CREATE POLICY "Admissions staff can view applications"
ON public.applications FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = applications.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
);

DROP POLICY IF EXISTS "Admissions staff can manage applications" ON public.applications;
CREATE POLICY "Admissions staff can manage applications"
ON public.applications FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = applications.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = applications.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
  )
);

CREATE TABLE IF NOT EXISTS public.school_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  is_published boolean NOT NULL DEFAULT false,
  starts_on date,
  ends_on date,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_notices TO authenticated;
GRANT ALL ON public.school_notices TO service_role;

CREATE INDEX IF NOT EXISTS idx_school_notices_school
  ON public.school_notices(school_id, display_order);

DROP TRIGGER IF EXISTS update_school_notices_updated_at ON public.school_notices;
CREATE TRIGGER update_school_notices_updated_at
  BEFORE UPDATE ON public.school_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.school_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view school notices" ON public.school_notices;
CREATE POLICY "Members can view school notices"
ON public.school_notices FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = school_notices.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins can manage school notices" ON public.school_notices;
CREATE POLICY "Admins can manage school notices"
ON public.school_notices FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = school_notices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = school_notices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
  )
);