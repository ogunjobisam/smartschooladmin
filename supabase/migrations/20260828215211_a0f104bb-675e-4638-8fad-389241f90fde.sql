-- Helper: does a parent's child sit this exam?
CREATE OR REPLACE FUNCTION public.child_sits_exam(_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_scores ss
    JOIN public.student_guardians sg ON sg.student_id = ss.student_id
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE ss.exam_id = _exam_id AND g.user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.child_sits_exam(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.child_sits_exam(uuid) TO authenticated;

-- Approval requests: only approvers (and the requester) may read them.
DROP POLICY IF EXISTS "Users can view approvals in their org" ON public.approval_requests;
CREATE POLICY "Approvers can view approvals in their org"
ON public.approval_requests
FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.is_school_manager(auth.uid())
    OR requested_by = auth.uid()
  )
);

-- Payments: teachers have no business in the cash book.
DROP POLICY IF EXISTS "Staff can view payments in their org" ON public.payments;
CREATE POLICY "Staff can view payments in their org"
ON public.payments
FOR SELECT
TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = payments.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
);

-- Fee schedules: finance and management only.
DROP POLICY IF EXISTS "Users can view fee schedules" ON public.fee_schedules;
CREATE POLICY "Staff can view fee schedules"
ON public.fee_schedules
FOR SELECT
TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = fee_schedules.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
);

-- Staff directory: a teacher sees only their own record.
DROP POLICY IF EXISTS "Staff can view staff in their org" ON public.staff;
CREATE POLICY "Staff can view staff in their org"
ON public.staff
FOR SELECT
TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = staff.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR staff.user_id = auth.uid()
  )
);

-- Exams: staff see the org's exams; parents and students see only their own.
DROP POLICY IF EXISTS "Users can view exams" ON public.exams;
CREATE POLICY "Staff can view exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = exams.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "Parents can view exams their child sits"
ON public.exams
FOR SELECT
TO authenticated
USING (public.child_sits_exam(id));

-- Exam writes: a teacher may only touch exams for classes they teach.
DROP POLICY IF EXISTS "Staff can manage exams" ON public.exams;
CREATE POLICY "Staff can manage exams"
ON public.exams
FOR ALL
TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = exams.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR (exams.class_id IS NOT NULL AND public.teaches_class(exams.class_id))
  )
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = exams.school_id
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR (exams.class_id IS NOT NULL AND public.teaches_class(exams.class_id))
  )
);