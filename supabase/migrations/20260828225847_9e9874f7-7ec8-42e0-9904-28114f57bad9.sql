-- 1. Per-school ID format settings
CREATE TABLE public.school_id_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entity text NOT NULL,
  prefix text,
  year_position text NOT NULL DEFAULT 'before',
  padding integer NOT NULL DEFAULT 4,
  separator text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, entity)
);

ALTER TABLE public.school_id_formats
  ADD CONSTRAINT school_id_formats_entity_chk CHECK (entity IN ('student', 'staff')),
  ADD CONSTRAINT school_id_formats_year_pos_chk CHECK (year_position IN ('before', 'after', 'none')),
  ADD CONSTRAINT school_id_formats_padding_chk CHECK (padding BETWEEN 1 AND 8),
  ADD CONSTRAINT school_id_formats_separator_chk CHECK (separator IN ('/', '-', '.', ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_id_formats TO authenticated;
GRANT ALL ON public.school_id_formats TO service_role;
ALTER TABLE public.school_id_formats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view id formats"
ON public.school_id_formats FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schools s
  WHERE s.id = school_id_formats.school_id
    AND s.org_id = public.get_user_org_id(auth.uid())
));

CREATE POLICY "Managers can manage id formats"
ON public.school_id_formats FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = school_id_formats.school_id
      AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND public.is_school_manager(auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = school_id_formats.school_id
      AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND public.is_school_manager(auth.uid())
);

CREATE TRIGGER school_id_formats_updated_at
BEFORE UPDATE ON public.school_id_formats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Shared counter store (students + staff)
CREATE TABLE public.id_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entity text NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, entity, year)
);

GRANT SELECT ON public.id_counters TO authenticated;
GRANT ALL ON public.id_counters TO service_role;
ALTER TABLE public.id_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view id counters"
ON public.id_counters FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.schools s
  WHERE s.id = id_counters.school_id
    AND s.org_id = public.get_user_org_id(auth.uid())
));

INSERT INTO public.id_counters (school_id, entity, year, last_number)
SELECT school_id, 'student', year, last_number FROM public.student_counters
ON CONFLICT DO NOTHING;

-- 3. Generic ID issuing
CREATE OR REPLACE FUNCTION public.next_entity_id_number(_school_id uuid, _entity text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prefix text;
  _year_position text := 'before';
  _padding integer := 4;
  _separator text := '/';
  _year integer := EXTRACT(YEAR FROM now())::int;
  _counter_year integer;
  _next integer;
  _num text;
BEGIN
  SELECT nullif(btrim(f.prefix), ''), f.year_position, f.padding, f.separator
  INTO _prefix, _year_position, _padding, _separator
  FROM public.school_id_formats f
  WHERE f.school_id = _school_id AND f.entity = _entity;

  IF NOT FOUND THEN
    _year_position := 'before';
    _padding := 4;
    _separator := '/';
  END IF;

  IF _prefix IS NULL THEN
    _prefix := public.school_id_prefix(_school_id);
    IF _entity = 'staff' THEN
      _prefix := _prefix || '-STF';
    END IF;
  END IF;

  _counter_year := CASE WHEN _year_position = 'none' THEN 0 ELSE _year END;

  INSERT INTO public.id_counters (school_id, entity, year, last_number)
  VALUES (_school_id, _entity, _counter_year, 1)
  ON CONFLICT (school_id, entity, year)
  DO UPDATE SET last_number = public.id_counters.last_number + 1
  RETURNING last_number INTO _next;

  _num := lpad(_next::text, coalesce(_padding, 4), '0');

  RETURN CASE _year_position
    WHEN 'before' THEN _prefix || _separator || _year || _separator || _num
    WHEN 'after' THEN _prefix || _separator || _num || _separator || _year
    ELSE _prefix || _separator || _num
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_entity_id_number(uuid, text) FROM authenticated, anon, public;

-- 4. Student trigger now uses the generic issuer
CREATE OR REPLACE FUNCTION public.set_student_id_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _candidate text;
  _tries integer := 0;
BEGIN
  IF NEW.student_id_number IS NOT NULL AND btrim(NEW.student_id_number) <> '' THEN
    NEW.student_id_number := btrim(NEW.student_id_number);
    RETURN NEW;
  END IF;

  LOOP
    _candidate := public.next_entity_id_number(NEW.school_id, 'student');
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

-- 5. Staff auto IDs
CREATE OR REPLACE FUNCTION public.set_staff_id_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _candidate text;
  _tries integer := 0;
BEGIN
  IF NEW.staff_id_number IS NOT NULL AND btrim(NEW.staff_id_number) <> '' THEN
    NEW.staff_id_number := btrim(NEW.staff_id_number);
    RETURN NEW;
  END IF;

  LOOP
    _candidate := public.next_entity_id_number(NEW.school_id, 'staff');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.staff
      WHERE school_id = NEW.school_id AND staff_id_number = _candidate
    );
    _tries := _tries + 1;
    IF _tries > 50 THEN
      _candidate := _candidate || '-' || substr(gen_random_uuid()::text, 1, 4);
      EXIT;
    END IF;
  END LOOP;

  NEW.staff_id_number := _candidate;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_staff_id_number() FROM authenticated, anon, public;

DROP TRIGGER IF EXISTS staff_set_id_number ON public.staff;
CREATE TRIGGER staff_set_id_number
BEFORE INSERT ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.set_staff_id_number();

-- 6. Uniqueness guarantees
CREATE UNIQUE INDEX IF NOT EXISTS staff_school_id_number_uniq
ON public.staff (school_id, staff_id_number)
WHERE staff_id_number IS NOT NULL;

-- 7. Audit trail for ID numbers
CREATE OR REPLACE FUNCTION public.log_id_number_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _org uuid;
  _old text;
  _new text;
  _entity text := TG_ARGV[0];
  _label text;
BEGIN
  IF _entity = 'student' THEN
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.student_id_number END;
    _new := NEW.student_id_number;
  ELSE
    _old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.staff_id_number END;
    _new := NEW.staff_id_number;
  END IF;

  IF TG_OP = 'UPDATE' AND coalesce(_old, '') = coalesce(_new, '') THEN
    RETURN NEW;
  END IF;
  IF _new IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.org_id INTO _org FROM public.schools s WHERE s.id = NEW.school_id;
  IF _org IS NULL THEN
    RETURN NEW;
  END IF;

  _label := NEW.first_name || ' ' || NEW.last_name;

  INSERT INTO public.audit_logs (org_id, user_id, action, entity_type, entity_id, detail, old_values, new_values)
  VALUES (
    _org,
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN 'id_number_assigned' ELSE 'id_number_changed' END,
    _entity,
    NEW.id::text,
    CASE WHEN TG_OP = 'INSERT'
      THEN _label || ' assigned ID ' || _new
      ELSE _label || ' ID changed from ' || coalesce(_old, '(none)') || ' to ' || _new
    END,
    jsonb_build_object('id_number', _old),
    jsonb_build_object('id_number', _new)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_id_number_change() FROM authenticated, anon, public;

DROP TRIGGER IF EXISTS students_log_id_number ON public.students;
CREATE TRIGGER students_log_id_number
AFTER INSERT OR UPDATE OF student_id_number ON public.students
FOR EACH ROW EXECUTE FUNCTION public.log_id_number_change('student');

DROP TRIGGER IF EXISTS staff_log_id_number ON public.staff;
CREATE TRIGGER staff_log_id_number
AFTER INSERT OR UPDATE OF staff_id_number ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.log_id_number_change('staff');

-- 8. Bulk backfill (managers only)
CREATE OR REPLACE FUNCTION public.backfill_student_id_numbers(_school_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer := 0;
  _rec record;
BEGIN
  IF NOT public.is_school_manager(auth.uid())
     OR NOT EXISTS (
       SELECT 1 FROM public.schools s
       WHERE s.id = _school_id AND s.org_id = public.get_user_org_id(auth.uid())
     ) THEN
    RAISE EXCEPTION 'Not authorised to backfill IDs for this school';
  END IF;

  FOR _rec IN
    SELECT id FROM public.students
    WHERE school_id = _school_id
      AND (student_id_number IS NULL OR btrim(student_id_number) = '')
    ORDER BY created_at
  LOOP
    UPDATE public.students
    SET student_id_number = public.next_entity_id_number(_school_id, 'student')
    WHERE id = _rec.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_staff_id_numbers(_school_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer := 0;
  _rec record;
BEGIN
  IF NOT public.is_school_manager(auth.uid())
     OR NOT EXISTS (
       SELECT 1 FROM public.schools s
       WHERE s.id = _school_id AND s.org_id = public.get_user_org_id(auth.uid())
     ) THEN
    RAISE EXCEPTION 'Not authorised to backfill IDs for this school';
  END IF;

  FOR _rec IN
    SELECT id FROM public.staff
    WHERE school_id = _school_id
      AND (staff_id_number IS NULL OR btrim(staff_id_number) = '')
    ORDER BY created_at
  LOOP
    UPDATE public.staff
    SET staff_id_number = public.next_entity_id_number(_school_id, 'staff')
    WHERE id = _rec.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_student_id_numbers(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.backfill_staff_id_numbers(uuid) FROM anon, public;

-- 9. Preview helper for the settings screen
CREATE OR REPLACE FUNCTION public.preview_id_format(_school_id uuid, _entity text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prefix text;
  _year_position text := 'before';
  _padding integer := 4;
  _separator text := '/';
  _year integer := EXTRACT(YEAR FROM now())::int;
  _num text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = _school_id AND s.org_id = public.get_user_org_id(auth.uid())
  ) THEN
    RETURN NULL;
  END IF;

  SELECT nullif(btrim(f.prefix), ''), f.year_position, f.padding, f.separator
  INTO _prefix, _year_position, _padding, _separator
  FROM public.school_id_formats f
  WHERE f.school_id = _school_id AND f.entity = _entity;

  IF NOT FOUND THEN
    _year_position := 'before';
    _padding := 4;
    _separator := '/';
  END IF;

  IF _prefix IS NULL THEN
    _prefix := public.school_id_prefix(_school_id);
    IF _entity = 'staff' THEN
      _prefix := _prefix || '-STF';
    END IF;
  END IF;

  _num := lpad('1', coalesce(_padding, 4), '0');

  RETURN CASE _year_position
    WHEN 'before' THEN _prefix || _separator || _year || _separator || _num
    WHEN 'after' THEN _prefix || _separator || _num || _separator || _year
    ELSE _prefix || _separator || _num
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_id_format(uuid, text) FROM anon, public;

DROP FUNCTION IF EXISTS public.next_student_id_number(uuid);
DROP TABLE IF EXISTS public.student_counters;