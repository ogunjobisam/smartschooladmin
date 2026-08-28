-- Notices for the school's public page.
--
-- BLMS runs a notice strip on its site — resumption dates, when admissions
-- open, PTA meetings. These are for people who are not signed in, which is what
-- separates them from announcements (internal, per-role) and events (dated, on
-- the calendar). A notice is a short standing statement with a window.

CREATE TABLE IF NOT EXISTS public.school_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  /* Unpublished notices are drafts; a school writes next term's dates early. */
  is_published boolean NOT NULL DEFAULT false,
  /* The window the notice is live for. Null on either side means "no limit",
     so a school that does not want to think about dates does not have to. */
  starts_on date,
  ends_on date,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_notices_school
  ON public.school_notices(school_id, display_order);

CREATE TRIGGER update_school_notices_updated_at
  BEFORE UPDATE ON public.school_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.school_notices ENABLE ROW LEVEL SECURITY;

-- Everyone signed in at the school can read them: they are public statements,
-- and the parent and student portals show them too.
CREATE POLICY "Members can view school notices"
ON public.school_notices FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = school_notices.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
);

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

-- The public admissions page reads notices through the `admissions` edge
-- function with the service role, so anonymous visitors get no policy here.
