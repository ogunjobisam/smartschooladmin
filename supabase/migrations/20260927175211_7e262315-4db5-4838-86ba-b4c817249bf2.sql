-- Arms as a field, and subject teachers who can only mark their own subject.
--
-- Two Tier 1 gaps for the report card engine, which depends on both.
--
-- 1. Arms. "JSS1A" was free text in classes.name, so nothing could rank a pupil
--    across JSS1 as a whole, or tell JSS1A from JSS1B except by string. Each
--    class row stays one arm — every foreign key to classes keeps meaning what it
--    meant — and gains level_name ("JSS1") and arm ("A"). name stays the label
--    shown everywhere, so no screen changes what it displays.
--
-- 2. Subject teachers. Mark entry was scoped to the class: anyone in
--    class_teachers could write every subject's score for every pupil in it.
--    subject_teachers records who teaches which subject in which class, and the
--    "manage scores" policy now follows it. A subject nobody has been given stays
--    with the class's teachers, so a school that has assigned nothing keeps
--    working exactly as before.
--
-- Safe to run twice: every policy is dropped before it is created, and every
-- other statement is IF NOT EXISTS or CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1. Arms
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS level_name text;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS arm text;

COMMENT ON COLUMN public.classes.level_name IS
  'The class without its arm, e.g. JSS1. Pupils are ranked across every arm that '
  'shares a level_name. Filled from name on insert when not given.';
COMMENT ON COLUMN public.classes.arm IS
  'The arm, e.g. A or Gold. NULL for a class with a single arm. The class row '
  'itself is the arm, so ranking by arm groups on classes.id.';

-- Splits a trailing single-letter arm off a class name: JSS1A, JSS 1A, SS2-C,
-- Primary 4 b. Only a single letter straight after a number counts, so
-- "Nursery 1" and "JSS1 Annexe" keep their whole name as the level. Word arms
-- ("Gold") are set on the class by hand.
CREATE OR REPLACE FUNCTION public.split_class_arm(_name text)
RETURNS TABLE (level_name text, arm text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    coalesce(btrim(m[1]), btrim(_name)),
    upper(m[2])
  FROM (SELECT regexp_match(btrim(_name), '^(.*[0-9])\s*[-/]?\s*([A-Za-z])$') AS m) s
$$;

-- Existing classes. Only rows not yet split, so a second run changes nothing and
-- never undoes an arm someone has since corrected by hand.
UPDATE public.classes
SET level_name = (SELECT s.level_name FROM public.split_class_arm(name) s),
    arm = coalesce(arm, (SELECT s.arm FROM public.split_class_arm(name) s))
WHERE level_name IS NULL;

-- Onboarding, the demo seeder and every older screen insert a class by name
-- alone. Filling the level here keeps them all correct without touching them.
CREATE OR REPLACE FUNCTION public.fill_class_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  split record;
BEGIN
  IF NEW.level_name IS NULL OR btrim(NEW.level_name) = '' THEN
    SELECT * INTO split FROM public.split_class_arm(NEW.name);
    NEW.level_name := split.level_name;
    IF NEW.arm IS NULL THEN
      NEW.arm := split.arm;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS classes_fill_level ON public.classes;
CREATE TRIGGER classes_fill_level
  BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.fill_class_level();

CREATE INDEX IF NOT EXISTS idx_classes_school_level ON public.classes (school_id, level_name);

-- ---------------------------------------------------------------------------
-- 2. Subject teachers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_teachers_class_subject ON public.subject_teachers (class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_teachers_staff ON public.subject_teachers (staff_id);

ALTER TABLE public.subject_teachers ENABLE ROW LEVEL SECURITY;

-- Same shape as class_teachers: a plain teacher sees their own assignments, and
-- only the people who can assign class teachers can assign subjects. A teacher
-- who could write here could hand themselves any subject's marks.
DROP POLICY IF EXISTS "Staff can view subject teachers in their org" ON public.subject_teachers;
CREATE POLICY "Staff can view subject teachers in their org"
ON public.subject_teachers FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = subject_teachers.class_id
      AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (NOT public.is_teacher_only(auth.uid()) OR staff_id IN (SELECT public.my_staff_ids()))
);

DROP POLICY IF EXISTS "Admins can manage subject teachers" ON public.subject_teachers;
CREATE POLICY "Admins can manage subject teachers"
ON public.subject_teachers FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = subject_teachers.class_id
      AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'school_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = subject_teachers.class_id
      AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'school_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
  )
);

-- Teaching one subject in a class is teaching the class: a subject specialist
-- needs the register and the pupils as much as the form teacher does. Every
-- policy that scopes a teacher goes through these two, so extending them here
-- is the whole change — no policy text needs to move.
CREATE OR REPLACE FUNCTION public.teaches_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_teachers ct
    JOIN public.staff s ON s.id = ct.staff_id
    WHERE ct.class_id = _class_id AND s.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.subject_teachers st
    JOIN public.staff s ON s.id = st.staff_id
    WHERE st.class_id = _class_id AND s.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.teaches_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolments e
    WHERE e.student_id = _student_id AND public.teaches_class(e.class_id)
  )
$$;

-- Whether the caller may write marks for a subject in a class: they were given
-- that subject there, or they hold the class and nobody was given it.
CREATE OR REPLACE FUNCTION public.can_mark_subject(_class_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subject_teachers st
    JOIN public.staff s ON s.id = st.staff_id
    WHERE st.class_id = _class_id AND st.subject_id = _subject_id AND s.user_id = auth.uid()
  ) OR (
    EXISTS (
      SELECT 1 FROM public.class_teachers ct
      JOIN public.staff s ON s.id = ct.staff_id
      WHERE ct.class_id = _class_id AND s.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.subject_teachers st
      WHERE st.class_id = _class_id AND st.subject_id = _subject_id
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_enter_mark(_student_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolments e
    WHERE e.student_id = _student_id AND public.can_mark_subject(e.class_id, _subject_id)
  )
$$;

-- What the mark sheet asks before it offers a cell for editing, so the screen
-- and row-level security give the same answer. Anyone above teacher gets every
-- subject back; the policy decides for them as it always has.
CREATE OR REPLACE FUNCTION public.markable_subjects(_class_id uuid, _subject_ids uuid[])
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_teacher_only(auth.uid()) THEN _subject_ids
    ELSE coalesce(
      (SELECT array_agg(sid ORDER BY ord)
       FROM unnest(_subject_ids) WITH ORDINALITY AS u(sid, ord)
       WHERE public.can_mark_subject(_class_id, sid)),
      ARRAY[]::uuid[]
    )
  END
$$;

REVOKE ALL ON FUNCTION public.can_mark_subject(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_enter_mark(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.markable_subjects(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mark_subject(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_enter_mark(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.markable_subjects(uuid, uuid[]) TO authenticated;

-- Writing is narrowed; reading is not. "Staff can view scores" still admits
-- teaches_student(), because the form teacher compiling a report card needs
-- every subject. This FOR ALL policy is the only one that grants INSERT, UPDATE
-- and DELETE, so it is the one that has to move — and permissive policies
-- combine with OR, so its SELECT half adds nothing the view policy lacks.
DROP POLICY IF EXISTS "Staff can manage scores" ON public.student_scores;
CREATE POLICY "Staff can manage scores"
ON public.student_scores FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.can_enter_mark(student_id, subject_id))
);