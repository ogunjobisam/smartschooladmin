-- Score policies: run each per-user check once per query, not once per row.
--
-- The student_scores policies called is_self_service_role(auth.uid()) and its
-- siblings bare. Postgres does not know their answers are the same for every
-- row, so it re-ran all of them for each row it read: about 1.3 ms a row on the
-- live database, measured as a proprietor. Reading one organisation's marks
-- through a join checked the whole platform's scores and ran past the 8-second
-- statement timeout, and every screen that loads marks paid the same cost.
--
-- Wrapped in (SELECT ...), a call whose inputs are fixed for the statement —
-- auth.uid() and nothing from the row — becomes an InitPlan and runs once.
-- The answers are identical by construction; supabase/tests/rls.sql asserts
-- the reach did not move (own organisation yes, another organisation no, the
-- teacher, support staff, pupil and parent cases above it unchanged).
--
-- Checks that take a row value (exam_org_id, teaches_student, can_enter_mark,
-- is_my_child, score_withheld_from_family) cannot be hoisted and stay as they
-- were.
--
-- The pupil policy also gains a leading "(SELECT my_student_id()) IS NOT NULL".
-- For anyone who is not a pupil my_student_id() is NULL, and
-- "student_id = NULL AND NOT score_withheld_from_family(...)" still has to run
-- the second half, because NULL AND false is false. So every staff read paid
-- for score_withheld_from_family — 0.26 ms a row, the largest single cost —
-- on rows it could never grant. The new first conjunct is plainly false for a
-- non-pupil, and the rest is skipped. Nobody's reach changes: a NULL pupil id
-- already matched no row.
--
-- Safe to run twice: every policy is dropped before it is created.

DROP POLICY IF EXISTS "Staff can view scores" ON public.student_scores;
CREATE POLICY "Staff can view scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  NOT (SELECT public.is_self_service_role(auth.uid()))
  AND NOT (SELECT public.is_support_staff_only(auth.uid()))
  AND public.exam_org_id(exam_id) = (SELECT public.get_user_org_id(auth.uid()))
  AND (NOT (SELECT public.is_teacher_only(auth.uid())) OR public.teaches_student(student_id))
);

DROP POLICY IF EXISTS "Staff can manage scores" ON public.student_scores;
CREATE POLICY "Staff can manage scores"
ON public.student_scores FOR ALL TO authenticated
USING (
  NOT (SELECT public.is_self_service_role(auth.uid()))
  AND NOT (SELECT public.is_support_staff_only(auth.uid()))
  AND public.exam_org_id(exam_id) = (SELECT public.get_user_org_id(auth.uid()))
  AND (NOT (SELECT public.is_teacher_only(auth.uid())) OR public.can_enter_mark(student_id, subject_id))
);

DROP POLICY IF EXISTS "Students can view their own scores" ON public.student_scores;
CREATE POLICY "Students can view their own scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  (SELECT public.my_student_id()) IS NOT NULL
  AND student_id = (SELECT public.my_student_id())
  AND NOT public.score_withheld_from_family(student_id, exam_id)
);