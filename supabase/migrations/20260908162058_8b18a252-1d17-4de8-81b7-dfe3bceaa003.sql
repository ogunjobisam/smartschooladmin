-- Teachers: restricted to their own school
DROP POLICY IF EXISTS "Users can view schools in their org" ON public.schools;
CREATE POLICY "Users can view schools in their org"
ON public.schools FOR SELECT
USING (
  org_id = get_user_org_id(auth.uid())
  AND (NOT is_teacher_only(auth.uid()) OR id = get_user_school_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can view exams" ON public.exams;
CREATE POLICY "Staff can view exams"
ON public.exams FOR SELECT
USING (
  NOT is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = exams.school_id AND s.org_id = get_user_org_id(auth.uid())
  )
  AND (NOT is_teacher_only(auth.uid()) OR school_id = get_user_school_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users can view subjects" ON public.subjects;
CREATE POLICY "Users can view subjects"
ON public.subjects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = subjects.school_id AND s.org_id = get_user_org_id(auth.uid())
  )
  AND (NOT is_teacher_only(auth.uid()) OR school_id = get_user_school_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users can view class subjects" ON public.class_subjects;
CREATE POLICY "Users can view class subjects"
ON public.class_subjects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools s ON s.id = c.school_id
    WHERE c.id = class_subjects.class_id
      AND s.org_id = get_user_org_id(auth.uid())
      AND (NOT is_teacher_only(auth.uid()) OR c.school_id = get_user_school_id(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff can view exam subjects" ON public.exam_subjects;
CREATE POLICY "Staff can view exam subjects"
ON public.exam_subjects FOR SELECT
USING (
  NOT is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_subjects.exam_id
      AND exam_org_id(e.id) = get_user_org_id(auth.uid())
      AND (NOT is_teacher_only(auth.uid()) OR e.school_id = get_user_school_id(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff can view class teachers in their org" ON public.class_teachers;
CREATE POLICY "Staff can view class teachers in their org"
ON public.class_teachers FOR SELECT
USING (
  NOT is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = class_teachers.class_id AND sc.org_id = get_user_org_id(auth.uid())
  )
  AND (
    NOT is_teacher_only(auth.uid())
    OR staff_id = my_staff_id()
  )
);