-- Scope events to the school that owns them, and stop a student holding two
-- transport assignments for the same term.
--
-- Every policy here drops before it creates. The previous batch did not, and
-- replaying it against a fresh project failed on a duplicate policy name.

-- ---------------------------------------------------------------------------
-- Which school a user belongs to
-- ---------------------------------------------------------------------------
-- NULL means "not tied to one school" — proprietors and group admins carry no
-- school_id on their role row and are meant to see the whole organisation.
CREATE OR REPLACE FUNCTION public.get_user_school_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- Events belong to a school
-- ---------------------------------------------------------------------------
-- school_events has always stored school_id, but neither the policy nor the
-- query used it, so in a group every school saw every other school's events.
-- An event with a NULL school_id stays organisation-wide, which is what the
-- proprietor's "whole group" announcements want.
DROP POLICY IF EXISTS "Users can view events for their audience" ON public.school_events;
CREATE POLICY "Users can view events for their audience"
ON public.school_events FOR SELECT TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    school_events.school_id IS NULL
    OR public.get_user_school_id(auth.uid()) IS NULL
    OR school_events.school_id = public.get_user_school_id(auth.uid())
  )
  AND (
    audience = 'all'
    OR (audience = 'parents' AND public.has_role(auth.uid(), 'parent'))
    OR (audience = 'students' AND public.has_role(auth.uid(), 'student'))
    OR (audience = 'staff' AND NOT public.is_self_service_role(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff can manage events" ON public.school_events;
CREATE POLICY "Staff can manage events"
ON public.school_events FOR ALL TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    school_events.school_id IS NULL
    OR public.get_user_school_id(auth.uid()) IS NULL
    OR school_events.school_id = public.get_user_school_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
)
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    school_events.school_id IS NULL
    OR public.get_user_school_id(auth.uid()) IS NULL
    OR school_events.school_id = public.get_user_school_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
    OR public.has_role(auth.uid(), 'principal')
  )
);

-- ---------------------------------------------------------------------------
-- Parents belong to their children's school
-- ---------------------------------------------------------------------------
-- The guardian invite used to omit school_id entirely, so existing parent role
-- rows carry NULL and the app fell back to the organisation's first school.
-- Backfill the unambiguous ones: a guardian whose children all attend the same
-- school. Split families stay NULL rather than being guessed at.
UPDATE public.user_roles ur
SET school_id = sub.school_id
FROM (
  -- There is no min(uuid); the HAVING below guarantees a single distinct value,
  -- so take the first element of the aggregate.
  SELECT g.user_id, (array_agg(DISTINCT s.school_id))[1] AS school_id
  FROM public.guardians g
  JOIN public.student_guardians sg ON sg.guardian_id = g.id
  JOIN public.students s ON s.id = sg.student_id
  WHERE g.user_id IS NOT NULL
  GROUP BY g.user_id
  HAVING count(DISTINCT s.school_id) = 1
) AS sub
WHERE ur.user_id = sub.user_id
  AND ur.role = 'parent'
  AND ur.school_id IS NULL;

-- ---------------------------------------------------------------------------
-- One transport assignment per student per term
-- ---------------------------------------------------------------------------
-- UNIQUE (student_id, academic_period_id) does not bind when the period is
-- NULL, because Postgres treats NULLs as distinct. A school with no current
-- term could therefore accumulate rows until the portal card, which expects at
-- most one, started raising. A partial index covers the NULL case without
-- needing NULLS NOT DISTINCT, which would tie us to PostgreSQL 15+.
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_transport_no_period
  ON public.student_transport (student_id)
  WHERE academic_period_id IS NULL;