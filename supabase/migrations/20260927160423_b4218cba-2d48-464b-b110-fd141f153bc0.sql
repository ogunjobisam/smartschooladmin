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

DROP POLICY IF EXISTS "Staff can manage exam subjects" ON public.exam_subjects;
CREATE POLICY "Staff can manage exam subjects"
ON public.exam_subjects FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_subjects.exam_id
        AND e.class_id IS NOT NULL
        AND public.teaches_class(e.class_id)
    )
  )
);