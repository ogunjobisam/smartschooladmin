-- Assign teachers to classes, and scope what a teacher can see to them.
--
-- Until now every teacher could read every student, attendance record and exam
-- score in the school. There was no way to express "this teacher takes JSS2",
-- so there was nothing to scope against.
--
-- Note for deployment: this is correct-by-default rather than
-- permissive-by-default. A teacher with no class assigned sees no students,
-- which is the right posture but means existing teacher accounts go quiet until
-- an admin assigns their classes under Settings -> Classes. The UI says so
-- rather than showing an unexplained empty page.

CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  is_form_teacher boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_class_teachers_staff ON public.class_teachers(staff_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_class ON public.class_teachers(class_id);

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The staff record belonging to the calling user, if any.
CREATE OR REPLACE FUNCTION public.my_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1
$$;

-- Does the caller teach this class?
CREATE OR REPLACE FUNCTION public.teaches_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_teachers ct
    JOIN public.staff s ON s.id = ct.staff_id
    WHERE ct.class_id = _class_id AND s.user_id = auth.uid()
  )
$$;

-- Is this student in any class the caller teaches, in any term?
CREATE OR REPLACE FUNCTION public.teaches_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrolments e
    JOIN public.class_teachers ct ON ct.class_id = e.class_id
    JOIN public.staff s ON s.id = ct.staff_id
    WHERE e.student_id = _student_id AND s.user_id = auth.uid()
  )
$$;

-- Everything below distinguishes a teacher from other staff. Roles that run the
-- school still see the whole school; only 'teacher' is narrowed.
CREATE OR REPLACE FUNCTION public.is_teacher_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'teacher'
  )
$$;

-- ---------------------------------------------------------------------------
-- class_teachers policies
-- ---------------------------------------------------------------------------
CREATE POLICY "Staff can view class teachers in their org"
ON public.class_teachers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = class_teachers.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND NOT public.has_role(auth.uid(), 'parent')
);

CREATE POLICY "Admins can manage class teachers"
ON public.class_teachers FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = class_teachers.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = class_teachers.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
);

-- ---------------------------------------------------------------------------
-- Narrow the teacher's view
-- ---------------------------------------------------------------------------

-- Classes: a teacher sees the ones they take, so every class picker in the app
-- narrows without each page needing its own filter.
DROP POLICY IF EXISTS "Users can view classes in their org" ON public.classes;

CREATE POLICY "Users can view classes in their org"
ON public.classes FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = classes.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_class(classes.id)
  )
);

-- Students
DROP POLICY IF EXISTS "Staff can view students in their org" ON public.students;

CREATE POLICY "Staff can view students in their org"
ON public.students FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_student(students.id)
  )
);

-- Enrolments
DROP POLICY IF EXISTS "Staff can view enrolments" ON public.enrolments;

CREATE POLICY "Staff can view enrolments"
ON public.enrolments FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.students s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = enrolments.student_id AND sc.org_id = public.get_user_org_id(auth.uid()))
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_class(enrolments.class_id)
  )
);

-- Attendance: read and write both narrow, so a teacher cannot mark a register
-- for a class that is not theirs.
DROP POLICY IF EXISTS "Staff can view attendance in their org" ON public.attendance_records;

CREATE POLICY "Staff can view attendance in their org"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_class(attendance_records.class_id)
  )
);

DROP POLICY IF EXISTS "Staff can manage attendance" ON public.attendance_records;

CREATE POLICY "Staff can manage attendance"
ON public.attendance_records FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.has_role(auth.uid(), 'parent')
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_class(attendance_records.class_id)
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.has_role(auth.uid(), 'parent')
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_class(attendance_records.class_id)
  )
);

-- Exam scores
DROP POLICY IF EXISTS "Staff can view scores" ON public.student_scores;

CREATE POLICY "Staff can view scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.schools sc ON sc.id = e.school_id
    WHERE e.id = student_scores.exam_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_student(student_scores.student_id)
  )
);
