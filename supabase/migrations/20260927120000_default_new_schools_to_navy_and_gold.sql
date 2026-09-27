-- A newly onboarded school should look like the product looks.
--
-- schools.primary_color / accent_color have carried shadcn's stock slate-and-
-- blue since they were added. Those two colours now drive the whole theme (see
-- src/lib/theme.ts), and they already showed through on the login panel and on
-- printed ID cards, so the stock values left every new school looking like a
-- different product from the one in the screenshots.

ALTER TABLE public.schools
  ALTER COLUMN primary_color SET DEFAULT '#15255b',  -- royal navy
  ALTER COLUMN accent_color  SET DEFAULT '#bc9529';  -- ceremonial gold

-- Move the schools that never chose a colour onto the new defaults. Matching
-- the exact old default is deliberate: a school that picked slate on purpose
-- keeps it, and one that picked anything else is untouched. NULL is included
-- because rows created before the columns existed have no value at all.
UPDATE public.schools
   SET primary_color = '#15255b'
 WHERE primary_color IS NULL OR lower(primary_color) = '#1e293b';

UPDATE public.schools
   SET accent_color = '#bc9529'
 WHERE accent_color IS NULL OR lower(accent_color) = '#3b82f6';

-- The demo school hard-codes teal and amber, which now repaints the entire
-- chrome teal the moment anyone seeds demo data. Only two literals need to
-- change in a 400-line function, so rewrite them in place rather than
-- re-emitting the body and inviting the two copies to drift apart.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.create_demo_org(text, integer)'::regprocedure)
    INTO def;

  IF position('#0f766e' IN def) = 0 AND position('#15255b' IN def) = 0 THEN
    RAISE EXCEPTION
      'create_demo_org no longer contains the demo brand colour this migration rewrites';
  END IF;

  def := replace(def, '#0f766e', '#15255b');
  def := replace(def, '#f59e0b', '#bc9529');
  EXECUTE def;  -- pg_get_functiondef emits CREATE OR REPLACE
END $$;
