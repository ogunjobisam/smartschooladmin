DO $$ BEGIN
  CREATE TYPE public.school_section AS ENUM ('toddler', 'nursery', 'primary', 'secondary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS section public.school_section;

COMMENT ON COLUMN public.classes.section IS
  'Age band this class belongs to. Null for schools that do not separate sections.';

UPDATE public.classes SET section = 'secondary'
 WHERE section IS NULL AND (name ~* '^(jss|ss|sss|js|year *[789]|year *1[012]|grade *([789]|1[012]))');

UPDATE public.classes SET section = 'primary'
 WHERE section IS NULL AND (name ~* '(primary|pry|basic|grade *[1-6]\M|year *[1-6]\M)');

UPDATE public.classes SET section = 'nursery'
 WHERE section IS NULL AND (name ~* '(nursery|kg|kindergarten|reception|pre-?school|pre-?k)');

UPDATE public.classes SET section = 'toddler'
 WHERE section IS NULL AND (name ~* '(toddler|creche|crèche|playgroup|play *group)');

CREATE INDEX IF NOT EXISTS idx_classes_section ON public.classes(school_id, section);

DO $$ BEGIN
  CREATE TYPE public.event_audience AS ENUM ('all', 'staff', 'parents', 'students');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_events TO authenticated;
GRANT ALL ON public.school_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_school_events_org_start ON public.school_events(org_id, starts_at);

DROP TRIGGER IF EXISTS update_school_events_updated_at ON public.school_events;
CREATE TRIGGER update_school_events_updated_at
  BEFORE UPDATE ON public.school_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view events for their audience" ON public.school_events;
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

DROP POLICY IF EXISTS "Staff can manage events" ON public.school_events;
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