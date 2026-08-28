-- Close the role-boundary holes an external audit surfaced, plus two worse ones
-- found while fixing them.
--
-- The pattern behind all of these: permissive policies combine with OR, so a
-- broad "staff can manage X" policy sitting beside a carefully scoped "staff can
-- view X" policy makes the scoping decorative. And several manage policies were
-- still gated on `NOT has_role(..., 'parent')`, written before the `student`
-- role existed — a student is not a parent, so those predicates were true for
-- them.
--
-- Every policy here drops before it creates, so the set stays replayable.

-- ---------------------------------------------------------------------------
-- Who may change school records
-- ---------------------------------------------------------------------------
-- The office. Teachers are staff but do not administer students or guardians;
-- has_role() already grants super_admin everything except the self-service
-- roles, so it is not listed.
CREATE OR REPLACE FUNCTION public.is_school_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'proprietor'::app_role)
      OR public.has_role(_user_id, 'group_admin'::app_role)
      OR public.has_role(_user_id, 'school_admin'::app_role)
      OR public.has_role(_user_id, 'principal'::app_role)
      OR public.has_role(_user_id, 'bursar'::app_role)
$$;

-- ---------------------------------------------------------------------------
-- students — a teacher could read and write every student in the organisation
-- ---------------------------------------------------------------------------
-- "Staff can view students in their org" already narrows teachers to the classes
-- they are assigned to. This FOR ALL policy sat beside it granting every
-- non-parent staff member full access to every student, which made the scoping
-- pointless and let a teacher edit any record. Verified during the audit: a
-- teacher's UPDATE succeeded.
DROP POLICY IF EXISTS "Staff can manage students" ON public.students;
CREATE POLICY "Staff can manage students"
ON public.students FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND public.is_school_manager(auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND public.is_school_manager(auth.uid())
);

-- ---------------------------------------------------------------------------
-- invoices — a teacher could read the whole school's finances
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view invoices in their org" ON public.invoices;
CREATE POLICY "Staff can view invoices in their org"
ON public.invoices FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = invoices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

-- ---------------------------------------------------------------------------
-- guardians — same shape as students, and a student could write them
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view guardians in their org" ON public.guardians;
CREATE POLICY "Staff can view guardians in their org"
ON public.guardians FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can manage guardians" ON public.guardians;
CREATE POLICY "Staff can manage guardians"
ON public.guardians FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()) AND public.is_school_manager(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.is_school_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- user_roles — any signed-in member could enumerate every role in the org
-- ---------------------------------------------------------------------------
-- That included parents and students, and told them which account is
-- super_admin. Staff who actually run user management keep the list; everyone
-- else sees only their own row. get_my_role() is SECURITY DEFINER, so sign-in
-- is unaffected.
DROP POLICY IF EXISTS "Users can view roles in their org" ON public.user_roles;
CREATE POLICY "Users can view roles in their org"
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    org_id IS NOT NULL
    AND org_id = public.get_user_org_id(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- exams and student_scores — recursion, and students could edit their grades
-- ---------------------------------------------------------------------------
-- The two tables' policies read each other: the exams policy subqueried
-- student_scores and every student_scores policy joined exams. Evaluating
-- either raised `42P17 infinite recursion detected in policy for relation
-- "exams"`, which surfaced as a 500 on every performance and transcript view —
-- hidden behind a "No performance data yet" empty state. Both directions now go
-- through SECURITY DEFINER helpers, which do not re-enter RLS.
CREATE OR REPLACE FUNCTION public.exam_org_id(_exam_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.org_id
  FROM public.exams e
  JOIN public.schools s ON s.id = e.school_id
  WHERE e.id = _exam_id
$$;

CREATE OR REPLACE FUNCTION public.student_sits_exam(_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_scores ss
    WHERE ss.exam_id = _exam_id AND ss.student_id = public.my_student_id()
  )
$$;

DROP POLICY IF EXISTS "Students can view exams for their scores" ON public.exams;
CREATE POLICY "Students can view exams for their scores"
ON public.exams FOR SELECT TO authenticated
USING (public.student_sits_exam(id));

-- A student is not a parent, so the old `NOT has_role(..., 'parent')` gate let
-- them manage exams.
DROP POLICY IF EXISTS "Staff can manage exams" ON public.exams;
CREATE POLICY "Staff can manage exams"
ON public.exams FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = exams.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = exams.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

-- The same gate on scores meant a student could write their own marks. Teachers
-- still record scores, but only for students they teach.
DROP POLICY IF EXISTS "Staff can manage scores" ON public.student_scores;
CREATE POLICY "Staff can manage scores"
ON public.student_scores FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
);

DROP POLICY IF EXISTS "Staff can view scores" ON public.student_scores;
CREATE POLICY "Staff can view scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
);

-- ---------------------------------------------------------------------------
-- get_my_role — every fresh sign-in landed on onboarding
-- ---------------------------------------------------------------------------
-- LIMIT 1 with no ORDER BY returns an arbitrary row when a user holds more than
-- one. A row with a NULL org_id winning makes AuthContext treat the user as not
-- onboarded, so teachers, parents and bursars were all sent to the org-creation
-- wizard — where they could create a second organisation. Prefer a row that
-- actually carries an organisation, then a school, then the oldest.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY (org_id IS NULL), (school_id IS NULL), created_at
  LIMIT 1;
$$;