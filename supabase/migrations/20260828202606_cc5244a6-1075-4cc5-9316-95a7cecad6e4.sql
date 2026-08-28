-- Number applications per school, not across the whole platform.
--
-- The reference came from one global sequence, so two schools interleaved:
-- Test School got APP-2026-00002 and Demo School APP-2026-00003. A school can
-- read another tenant's application volume straight off the gaps in its own
-- numbering, and a slow term looks obvious to anyone who applies twice.
--
-- References already issued are left exactly as they are — families quote them
-- on the phone, and renumbering would strand every one of them.

-- ---------------------------------------------------------------------------
-- The counter
-- ---------------------------------------------------------------------------
-- Keyed per school and per year, so numbering restarts each session the way a
-- paper register would.
CREATE TABLE IF NOT EXISTS public.application_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, year)
);

GRANT SELECT ON public.application_counters TO authenticated;
GRANT ALL ON public.application_counters TO service_role;

ALTER TABLE public.application_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.application_counters IS
  'Per-school, per-year application numbering. Written only by next_application_reference().';

-- Writes go through the SECURITY DEFINER function, so there is no manage
-- policy. Reads are scoped to a school's own counter: that reveals nothing a
-- school does not already know from its own references, and leaving the table
-- readable by nobody would trip the "row-level security on with no readable
-- policy" check for what would look like an accidental lockout.
DROP POLICY IF EXISTS "Admissions staff can view their own counter" ON public.application_counters;
CREATE POLICY "Admissions staff can view their own counter"
ON public.application_counters FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = application_counters.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
  AND public.is_school_manager(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Issuing a reference
-- ---------------------------------------------------------------------------
-- The UPDATE ... RETURNING inside the upsert is atomic, so two applications
-- arriving at once cannot take the same number.
CREATE OR REPLACE FUNCTION public.next_application_reference(_school_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer := extract(year FROM now())::integer;
  _number integer;
BEGIN
  INSERT INTO public.application_counters (school_id, year, last_number)
  VALUES (_school_id, _year, 1)
  ON CONFLICT (school_id, year)
  DO UPDATE SET last_number = public.application_counters.last_number + 1
  RETURNING last_number INTO _number;

  RETURN 'APP-' || _year::text || '-' || lpad(_number::text, 5, '0');
END $$;

-- ---------------------------------------------------------------------------
-- Use it
-- ---------------------------------------------------------------------------
-- A column DEFAULT cannot see school_id, so the reference is filled by a
-- trigger. An explicitly supplied reference is respected, which keeps imports
-- and any future backfill possible.
CREATE OR REPLACE FUNCTION public.set_application_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := public.next_application_reference(NEW.school_id);
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.applications ALTER COLUMN reference DROP DEFAULT;
ALTER TABLE public.applications ALTER COLUMN reference DROP NOT NULL;

DROP TRIGGER IF EXISTS set_application_reference ON public.applications;
CREATE TRIGGER set_application_reference
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_application_reference();

-- ---------------------------------------------------------------------------
-- Uniqueness moves from the platform to the school
-- ---------------------------------------------------------------------------
-- Per-school numbering means two schools legitimately both hold APP-2026-00001.
-- The reference only ever means anything alongside the school it belongs to, so
-- that is the right scope for the constraint — and keeping the short form
-- matters when a parent is reading it out over the phone.
DO $$
DECLARE _name text;
BEGIN
  SELECT conname INTO _name
  FROM pg_constraint
  WHERE conrelid = 'public.applications'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (reference)';
  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', _name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_school_reference
  ON public.applications (school_id, reference);

-- ---------------------------------------------------------------------------
-- Seed the counters from what each school has already issued
-- ---------------------------------------------------------------------------
-- Without this the first application after this migration would reissue
-- APP-2026-00001 and collide with a reference already in the table.
INSERT INTO public.application_counters (school_id, year, last_number)
SELECT
  school_id,
  extract(year FROM created_at)::integer AS year,
  max(coalesce(nullif(regexp_replace(reference, '^.*-', ''), '')::integer, 0)) AS last_number
FROM public.applications
WHERE reference ~ '^APP-\d{4}-\d+$'
GROUP BY school_id, extract(year FROM created_at)::integer
ON CONFLICT (school_id, year) DO UPDATE
  SET last_number = greatest(public.application_counters.last_number, excluded.last_number);

-- The old global sequence has no remaining reader.
DROP SEQUENCE IF EXISTS public.application_reference_seq;