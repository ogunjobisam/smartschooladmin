CREATE TABLE public.student_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, year)
);

GRANT SELECT ON public.student_counters TO authenticated;
GRANT ALL ON public.student_counters TO service_role;

ALTER TABLE public.student_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org staff can view student counters"
ON public.student_counters
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = student_counters.school_id
      AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND public.is_org_staff(auth.uid())
);

-- Prefix from the school's name initials, e.g. "Smartever School of Life" -> "SSL".
CREATE OR REPLACE FUNCTION public.school_id_prefix(_school_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _prefix text;
BEGIN
  SELECT name INTO _name FROM public.schools WHERE id = _school_id;
  IF _name IS NULL THEN
    RETURN 'STU';
  END IF;

  SELECT string_agg(upper(left(word, 1)), '')
  INTO _prefix
  FROM (
    SELECT word
    FROM regexp_split_to_table(regexp_replace(_name, '[^a-zA-Z ]', '', 'g'), '\s+') AS word
    WHERE length(word) > 2
    LIMIT 4
  ) w;

  IF _prefix IS NULL OR length(_prefix) = 0 THEN
    _prefix := upper(left(regexp_replace(_name, '[^a-zA-Z]', '', 'g'), 3));
  END IF;

  RETURN coalesce(nullif(_prefix, ''), 'STU');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_student_id_number(_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer := EXTRACT(YEAR FROM now())::int;
  _next integer;
BEGIN
  INSERT INTO public.student_counters (school_id, year, last_number)
  VALUES (_school_id, _year, 1)
  ON CONFLICT (school_id, year)
  DO UPDATE SET last_number = public.student_counters.last_number + 1
  RETURNING last_number INTO _next;

  RETURN public.school_id_prefix(_school_id) || '/' || _year || '/' || lpad(_next::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_student_id_number(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.school_id_prefix(uuid) FROM public, anon;

-- Fill in an ID only when none was typed in, and never collide with an existing one.
CREATE OR REPLACE FUNCTION public.set_student_id_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _candidate text;
  _tries integer := 0;
BEGIN
  IF NEW.student_id_number IS NOT NULL AND btrim(NEW.student_id_number) <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    _candidate := public.next_student_id_number(NEW.school_id);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.students
      WHERE school_id = NEW.school_id AND student_id_number = _candidate
    );
    _tries := _tries + 1;
    IF _tries > 50 THEN
      _candidate := _candidate || '-' || substr(gen_random_uuid()::text, 1, 4);
      EXIT;
    END IF;
  END LOOP;

  NEW.student_id_number := _candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER students_set_id_number
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_student_id_number();

-- Start each school's counter above any numbers already issued this year.
INSERT INTO public.student_counters (school_id, year, last_number)
SELECT s.school_id, EXTRACT(YEAR FROM now())::int,
       coalesce(max((regexp_match(s.student_id_number, '(\d+)$'))[1]::int), 0)
FROM public.students s
WHERE s.student_id_number ~ '\d+$'
GROUP BY s.school_id
ON CONFLICT (school_id, year) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS students_school_id_number_key
  ON public.students (school_id, student_id_number)
  WHERE student_id_number IS NOT NULL;