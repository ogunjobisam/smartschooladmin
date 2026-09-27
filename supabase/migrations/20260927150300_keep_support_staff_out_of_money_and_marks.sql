-- Keep support_staff out of the cash book and the mark book.
--
-- This is the migration that makes adding a role safe rather than a leak.
--
-- The staff read policies on these six tables are written as denylists — "not a
-- parent or pupil, and not teacher-only, therefore allowed" — so every one of
-- them admits any new role the enum gains, silently, the moment it exists. A
-- support_staff user would have been able to read every invoice, payment, fee
-- schedule, exam and score in the organisation. The navigation map hides those
-- pages, but src/lib/access.ts says in its own header that it is defence in
-- depth and not the boundary, and it is right: the boundary is here.
--
-- So the role needs its own "only" helper, in the same shape as
-- is_teacher_only() — most senior role held, not merely a role held. Someone who
-- is both support_staff and bursar keeps the bursar's reach; the office
-- assistant who is only support_staff does not.

CREATE OR REPLACE FUNCTION public.is_support_staff_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- True only when support_staff is the most senior role the user holds.
  -- role_rank() is the single definition of seniority, so this cannot drift
  -- from primary_user_role().
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'support_staff')
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND public.role_rank(role) < public.role_rank('support_staff'::app_role)
     )
$$;

-- ---------------------------------------------------------------------------
-- Money: fee schedules, invoices, payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view fee schedules" ON public.fee_schedules;
CREATE POLICY "Staff can view fee schedules"
ON public.fee_schedules FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = fee_schedules.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can view invoices in their org" ON public.invoices;
CREATE POLICY "Staff can view invoices in their org"
ON public.invoices FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = invoices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can view payments in their org" ON public.payments;
CREATE POLICY "Staff can view payments in their org"
ON public.payments FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = payments.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

-- ---------------------------------------------------------------------------
-- Marks: exams, exam subjects, scores
--
-- These three read differently from the money ones: is_teacher_only() does not
-- deny there, it *narrows* — a teacher-only user sees their own school, or their
-- own pupils' scores. Leaving support_staff out of that shape would have given
-- them the whole organisation's marks, which is wider than a teacher gets.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view exams" ON public.exams;
CREATE POLICY "Staff can view exams"
ON public.exams FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools s WHERE s.id = exams.school_id AND s.org_id = public.get_user_org_id(auth.uid()))
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.get_user_school_id(auth.uid()) IS NULL
    OR school_id = public.get_user_school_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Staff can view exam subjects" ON public.exam_subjects;
CREATE POLICY "Staff can view exam subjects"
ON public.exam_subjects FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_subjects.exam_id
      AND public.exam_org_id(e.id) = public.get_user_org_id(auth.uid())
      AND (
        NOT public.is_teacher_only(auth.uid())
        OR public.get_user_school_id(auth.uid()) IS NULL
        OR e.school_id = public.get_user_school_id(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Staff can view scores" ON public.student_scores;
CREATE POLICY "Staff can view scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
);

-- The FOR ALL "manage" policies beside them have to move too, and this is the
-- part that is easy to miss: permissive policies combine with OR, so tightening
-- only the SELECT policy above changed nothing at all for exams and scores.
--
-- The money tables needed no equivalent, and not by luck — "Finance can manage
-- invoices/payments/fee schedules" are allowlists naming proprietor, bursar and
-- finance_officer, so a support_staff was never in them. These two are denylists
-- of the same shape as the SELECT policies, so they admitted the new role just
-- as readily. Excluding support staff here also means they cannot write a mark,
-- which matches having no exams screen.
DROP POLICY IF EXISTS "Staff can manage exams" ON public.exams;
CREATE POLICY "Staff can manage exams"
ON public.exams FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = exams.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can manage scores" ON public.student_scores;
CREATE POLICY "Staff can manage scores"
ON public.student_scores FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_id))
);
