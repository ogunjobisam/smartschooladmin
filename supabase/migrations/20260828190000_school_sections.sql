-- Age-banded school sections.
--
-- Onboarding created JSS1-SS3 — secondary only — while Nigerian private schools
-- commonly span toddler through secondary, as BLMS does. Classes now belong to a
-- section so a school can express the whole range and group by it.

CREATE TYPE public.school_section AS ENUM ('toddler', 'nursery', 'primary', 'secondary');

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS section public.school_section;

COMMENT ON COLUMN public.classes.section IS
  'Age band this class belongs to. Null for schools that do not separate sections.';

-- Best-effort backfill from the naming conventions already in use, so existing
-- schools get sensible sections without anyone re-entering their classes.
UPDATE public.classes SET section = 'secondary'
 WHERE section IS NULL AND (name ~* '^(jss|ss|sss|js|year *[789]|year *1[012]|grade *([789]|1[012]))');

UPDATE public.classes SET section = 'primary'
 WHERE section IS NULL AND (name ~* '(primary|pry|basic|grade *[1-6]\M|year *[1-6]\M)');

UPDATE public.classes SET section = 'nursery'
 WHERE section IS NULL AND (name ~* '(nursery|kg|kindergarten|reception|pre-?school|pre-?k)');

UPDATE public.classes SET section = 'toddler'
 WHERE section IS NULL AND (name ~* '(toddler|creche|crèche|playgroup|play *group)');

CREATE INDEX IF NOT EXISTS idx_classes_section ON public.classes(school_id, section);
