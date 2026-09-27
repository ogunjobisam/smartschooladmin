-- Make is_teacher_only() mean what it says, and tolerate a teacher with no
-- school of their own.
--
-- 20260908162058 started scoping schools, exams, subjects, class_subjects and
-- exam_subjects with:
--
--   NOT is_teacher_only(auth.uid()) OR <col> = get_user_school_id(auth.uid())
--
-- which is the right idea — a teacher should see their own school, not the
-- whole group — but two things underneath it turned "one school" into "no
-- schools at all".
--
-- First, is_teacher_only() never had any "only" in it:
--
--   SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'teacher')
--
-- That is has_role(_user_id, 'teacher') under a name claiming the opposite. A
-- school_admin, principal, bursar, hr_admin or finance_officer who also teaches
-- a class — a combination invite-user's rolesCompatible() explicitly permits —
-- was therefore treated as a teacher everywhere. Proprietors and group_admins
-- escaped only by luck, through the older FOR ALL "Admins can manage schools"
-- policy; nobody else had a fallback.
--
-- Second, `id = get_user_school_id(...)` is NULL rather than true when the
-- school is NULL, and NULL school_ids are ordinary: invite-user writes
-- `school_id: school_id || null` for an org-level invite, and
-- primary_user_role() ranks by seniority before it prefers a non-NULL school,
-- so a senior row's NULL beats a teacher row's real school. Such a user saw
-- zero schools, zero exams and zero subjects.
--
-- AuthContext.tsx loads the school list from `schools`, so an empty list means
-- no current school and a blank app — with no error for anyone to report. The
-- repo already had the right shape for this in 20260828235900, which tolerates
-- a NULL school on school_events.
--
-- The name stays. Roughly thirty policies across eight migrations call it, and
-- fixing the body is the proportionate change; the comment below is what makes
-- the name honest from here on.

CREATE OR REPLACE FUNCTION public.is_teacher_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- True only when teacher is the most senior role the user holds, which is
  -- what every caller already assumes. role_rank() is the single definition of
  -- seniority, so this cannot drift from primary_user_role().
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'teacher')
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND public.role_rank(role) < public.role_rank('teacher'::app_role)
     )
$$;

COMMENT ON FUNCTION public.is_teacher_only(uuid) IS
  'True when teacher is the most senior role this user holds — so an admin who '
  'also teaches is NOT teacher-only. Used to scope a plain teacher to their own '
  'school. Pair it with a NULL check on get_user_school_id(): a teacher invited '
  'at org level has no school, and "col = NULL" is NULL, not true.';

-- The five clauses from 20260908162058, re-asserted with NULL tolerance. A
-- teacher with no school of their own falls back to the org scope the policy
-- already enforces, rather than to nothing.

DROP POLICY IF EXISTS "Users can view schools in their org" ON public.schools;
CREATE POLICY "Users can view schools in their org"
ON public.schools FOR SELECT
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    NOT is_teacher_only(auth.uid())
    OR get_user_school_id(auth.uid()) IS NULL
    OR id = get_user_school_id(auth.uid())
  )
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
  AND (
    NOT is_teacher_only(auth.uid())
    OR get_user_school_id(auth.uid()) IS NULL
    OR school_id = get_user_school_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view subjects" ON public.subjects;
CREATE POLICY "Users can view subjects"
ON public.subjects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = subjects.school_id AND s.org_id = get_user_org_id(auth.uid())
  )
  AND (
    NOT is_teacher_only(auth.uid())
    OR get_user_school_id(auth.uid()) IS NULL
    OR school_id = get_user_school_id(auth.uid())
  )
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
      AND (
        NOT is_teacher_only(auth.uid())
        OR get_user_school_id(auth.uid()) IS NULL
        OR c.school_id = get_user_school_id(auth.uid())
      )
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
      AND (
        NOT is_teacher_only(auth.uid())
        OR get_user_school_id(auth.uid()) IS NULL
        OR e.school_id = get_user_school_id(auth.uid())
      )
  )
);