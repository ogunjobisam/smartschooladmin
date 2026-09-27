-- Teachers write only the exams of classes they teach.
--
-- "Staff can manage exams" (last set in 20260927155546) had lost the teacher
-- narrowing that 20260828215211 once gave it, so anyone whose most senior role
-- is teacher could create, rename, re-weight or delete any exam in the whole
-- organisation. exam_subjects and exam_grade_bands were already narrowed to
-- exams for a class the teacher teaches; this brings exams itself into line.
--
-- A whole-school exam (class_id NULL) belongs to the people who run the school:
-- a teacher can still enter marks in it, which student_scores governs
-- separately, but can no longer create or change the exam.
--
-- Also closes the same gap on exam_grade_bands for support staff. Its policies
-- never excluded them, so the school office could rewrite the bands that decide
-- every pupil's grade (CLAUDE.md §4). Exams and exam_subjects already exclude
-- them.
--
-- Safe to run twice.

DROP POLICY IF EXISTS "Staff can manage exams" ON public.exams;
CREATE POLICY "Staff can manage exams"
ON public.exams FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = exams.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (NOT public.is_teacher_only(auth.uid()) OR (class_id IS NOT NULL AND public.teaches_class(class_id)))
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = exams.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (NOT public.is_teacher_only(auth.uid()) OR (class_id IS NOT NULL AND public.teaches_class(class_id)))
);

DROP POLICY IF EXISTS "Staff can view exam grade bands" ON public.exam_grade_bands;
CREATE POLICY "Staff can view exam grade bands"
ON public.exam_grade_bands FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can manage exam grade bands" ON public.exam_grade_bands;
CREATE POLICY "Staff can manage exam grade bands"
ON public.exam_grade_bands FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_grade_bands.exam_id AND e.class_id IS NOT NULL AND public.teaches_class(e.class_id)
    )
  )
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_grade_bands.exam_id AND e.class_id IS NOT NULL AND public.teaches_class(e.class_id)
    )
  )
);
