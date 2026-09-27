-- Put the support_staff exclusion back on exams and exam subjects, and finish
-- the job on exam_subjects.
--
-- Two separate things landed here, and only one of them is anybody's mistake.
--
-- 1. THE REGRESSION. Applying the migrations through Lovable re-stamped three
--    of them under fresh timestamps (20260927154644, 154718, 154809). Those
--    copies sort *after* 20260927150300, so replaying the set re-created the
--    older definitions of "Staff can view exams" and "Staff can view exam
--    subjects" — the versions written before support_staff existed — and
--    silently dropped the NOT is_support_staff_only() clause from both. The
--    office could read the whole organisation's exams again.
--
--    This is a structural hazard, not a one-off: any migration re-applied that
--    way reappears at the end of the ordering and undoes whatever later work
--    touched the same policy. It is why supabase/tests/rls.sql asserts the
--    behaviour rather than the policy text — the assertion caught this; reading
--    the file list would not have.
--
-- 2. A GAP OF MY OWN. "Staff can manage exam subjects" never had the clause,
--    because 20260927150300 tightened the FOR ALL policies on exams and
--    student_scores and missed this third one. Permissive policies combine with
--    OR, so that single omission granted through everything the SELECT policy
--    beside it denied. The exam_subjects assertion added alongside this
--    migration is what would have caught it the first time.

-- ---------------------------------------------------------------------------
-- exams — SELECT
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

-- ---------------------------------------------------------------------------
-- exam_subjects — SELECT and the FOR ALL beside it
-- ---------------------------------------------------------------------------
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
