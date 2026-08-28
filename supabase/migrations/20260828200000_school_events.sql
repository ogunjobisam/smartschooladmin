-- School events calendar.
--
-- There was no calendar in the product at all. BLMS surfaces upcoming events to
-- parents on its front page; this is the same idea, with an audience so a staff
-- meeting is not shown to parents.

CREATE TYPE public.event_audience AS ENUM ('all', 'staff', 'parents', 'students');

CREATE TABLE IF NOT EXISTS public.school_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  audience public.event_audience NOT NULL DEFAULT 'all',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_events_ends_after_starts CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_school_events_org_start ON public.school_events(org_id, starts_at);

CREATE TRIGGER update_school_events_updated_at
  BEFORE UPDATE ON public.school_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

-- Everyone in the organisation sees the events meant for them.
CREATE POLICY "Users can view events for their audience"
ON public.school_events FOR SELECT TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    audience = 'all'
    OR (audience = 'parents' AND public.has_role(auth.uid(), 'parent'))
    OR (audience = 'students' AND public.has_role(auth.uid(), 'student'))
    OR (audience = 'staff' AND NOT public.is_self_service_role(auth.uid()))
  )
);

CREATE POLICY "Staff can manage events"
ON public.school_events FOR ALL TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
)
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
);
