-- Admissions: a public application form, and a pipeline for what happens next.
--
-- BLMS runs admissions as a visible funnel with a published "Apply" call to
-- action. Enquiries arriving by WhatsApp and losing themselves in a notebook is
-- the norm for a school this size, so the point here is that every application
-- lands in one list with a status you can move.
--
-- Applications are written by the `admissions` edge function using the service
-- role, never by the browser: there is deliberately no policy granting `anon`
-- any access to this table.

-- A school's public admissions page lives at /apply/<slug>.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admissions_slug text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admissions_open boolean NOT NULL DEFAULT false;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admissions_intro text;

-- Backfill a slug from the school name. The id suffix keeps two schools called
-- "Grace Academy" from colliding; schools can set a nicer one in Settings.
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
  /* What the family quotes when they ring to ask where their application got to. */
  reference text NOT NULL UNIQUE DEFAULT (
    'APP-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.application_reference_seq')::text, 5, '0')
  ),
  status public.application_status NOT NULL DEFAULT 'new',

  applicant_first_name text NOT NULL,
  applicant_last_name text NOT NULL,
  date_of_birth date,
  gender text,
  /* The band they are applying into. The exact class is decided at admission,
     so this is what the family picks and the class comes later. */
  section public.school_section,
  desired_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  previous_school text,

  guardian_name text NOT NULL,
  guardian_email text,
  guardian_phone text NOT NULL,
  guardian_address text,
  /* "How did you hear about us" — the only marketing attribution a school this
     size will ever collect. */
  source text,
  message text,

  decision_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  /* Set once the application becomes a student, so the funnel can show what
     converted and the record cannot be converted twice. */
  converted_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_school_status
  ON public.applications(school_id, status, created_at DESC);

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Admissions is school office work: teachers, parents and students have no
-- business reading other families' applications.
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
