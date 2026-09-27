-- Withhold results until fees are paid.
--
-- Nigerian schools expect this and use it: a family that has not cleared the
-- term's fees sees the report card only once they have. It is the strongest
-- collection lever a school has, so it is a per-school switch, off by default.
--
-- What "paid" means here: no balance on any invoice for that term or an
-- earlier one. A family cannot clear this term and leave last term owing. Void
-- and draft invoices do not count, and nor do invoices with no term — a uniform
-- bill should not hold back a report card.
--
-- A school can release one pupil's results for one term regardless, for the
-- family on an agreed payment plan. That is result_releases.
--
-- The boundary is row-level security on student_scores, not the interface.
-- Only the pupil and parent policies are narrowed; staff see scores as before,
-- because they have to enter them.

-- ---------------------------------------------------------------------------
-- The switch
-- ---------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS withhold_results_until_paid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.withhold_results_until_paid IS
  'When true, pupils and parents cannot see a term''s scores while any invoice for that term or an earlier one has a balance, unless the pupil has a result_releases row for the term.';

-- ---------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.result_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_period_id uuid NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  reason text,
  released_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_period_id)
);

ALTER TABLE public.result_releases ENABLE ROW LEVEL SECURITY;

-- Who may release: people who run the school or its money. An allowlist, not
-- the staff denylist — a role added later gets nothing here until someone
-- decides it should. has_role() admits super_admin to every non-self-service
-- role, so the platform can too. It reads auth.uid() itself rather than taking
-- a user id, so nobody can use it to ask what roles someone else holds.
CREATE OR REPLACE FUNCTION public.can_release_results(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_self_service_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools sc
      WHERE sc.id = _school_id AND sc.org_id = public.get_user_org_id(auth.uid())
    )
    AND (
      public.has_role(auth.uid(), 'proprietor'::app_role)
      OR public.has_role(auth.uid(), 'group_admin'::app_role)
      OR public.has_role(auth.uid(), 'school_admin'::app_role)
      OR public.has_role(auth.uid(), 'principal'::app_role)
      OR public.has_role(auth.uid(), 'bursar'::app_role)
      OR public.has_role(auth.uid(), 'finance_officer'::app_role)
    )
$$;

DROP POLICY IF EXISTS "Result releasers can view releases" ON public.result_releases;
CREATE POLICY "Result releasers can view releases"
ON public.result_releases FOR SELECT TO authenticated
USING (public.can_release_results(school_id));

-- The student must belong to the school the row names, or a releaser could
-- file a release against their own school for somebody else's pupil.
DROP POLICY IF EXISTS "Result releasers can manage releases" ON public.result_releases;
CREATE POLICY "Result releasers can manage releases"
ON public.result_releases FOR ALL TO authenticated
USING (public.can_release_results(school_id))
WITH CHECK (
  public.can_release_results(school_id)
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = result_releases.student_id AND s.school_id = result_releases.school_id
  )
);

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------
-- Balance owed on invoices for this term and every earlier one. Internal: it
-- answers for any student, so clients cannot call it.
CREATE OR REPLACE FUNCTION public.results_outstanding(_student_id uuid, _period_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(greatest(i.total_amount - i.amount_paid, 0)), 0)::bigint
  FROM public.invoices i
  JOIN public.academic_periods ip ON ip.id = i.academic_period_id
  JOIN public.academic_periods p ON p.id = _period_id
  WHERE i.student_id = _student_id
    AND i.status NOT IN ('void', 'draft')
    AND ip.start_date <= p.start_date
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default, so revoking from PUBLIC alone would not be enough.
REVOKE ALL ON FUNCTION public.results_outstanding(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Whether a pupil's results for a term are held back. Also internal.
CREATE OR REPLACE FUNCTION public.results_withheld(_student_id uuid, _period_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _period_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.schools sc ON sc.id = s.school_id
      WHERE s.id = _student_id AND sc.withhold_results_until_paid
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.result_releases r
      WHERE r.student_id = _student_id AND r.academic_period_id = _period_id
    )
    AND public.results_outstanding(_student_id, _period_id) > 0
$$;

REVOKE ALL ON FUNCTION public.results_withheld(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- What the pupil and parent score policies call. It has to be SECURITY DEFINER
-- and look the exam up itself: a policy on student_scores that subqueried exams
-- would recurse, because the exams policies for pupils and parents subquery
-- student_scores (42P17, which this codebase has already hit once).
--
-- Callable by any signed-in user, because policies run with the caller's
-- privileges. So it answers only for the caller's own record or their own
-- child's, and says "not withheld" otherwise — which reveals nothing, since
-- that is also the answer for every family that has paid.
CREATE OR REPLACE FUNCTION public.score_withheld_from_family(_student_id uuid, _exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (_student_id = public.my_student_id() OR public.is_my_child(_student_id))
    AND public.results_withheld(
      _student_id,
      (SELECT e.academic_period_id FROM public.exams e WHERE e.id = _exam_id)
    )
$$;

REVOKE ALL ON FUNCTION public.score_withheld_from_family(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_withheld_from_family(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Students can view their own scores" ON public.student_scores;
CREATE POLICY "Students can view their own scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  student_id = public.my_student_id()
  AND NOT public.score_withheld_from_family(student_id, exam_id)
);

DROP POLICY IF EXISTS "Parents can view their children's scores" ON public.student_scores;
CREATE POLICY "Parents can view their children's scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  public.is_my_child(student_id)
  AND NOT public.score_withheld_from_family(student_id, exam_id)
);

-- ---------------------------------------------------------------------------
-- Telling people why
-- ---------------------------------------------------------------------------
-- Without this a withheld term just looks like a term with no results, and the
-- school's phone rings. Returns the terms held back for one pupil, with what is
-- owed, for the pupil, their parent, or staff who can already see invoices —
-- the same staff test as "Staff can view invoices in their org". Anyone else
-- gets no rows.
CREATE OR REPLACE FUNCTION public.withheld_results(_student_id uuid)
RETURNS TABLE (academic_period_id uuid, period_name text, outstanding bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, public.results_outstanding(_student_id, p.id)
  FROM public.academic_periods p
  WHERE EXISTS (
      SELECT 1 FROM public.student_scores sc
      JOIN public.exams e ON e.id = sc.exam_id
      WHERE sc.student_id = _student_id AND e.academic_period_id = p.id
    )
    AND public.results_withheld(_student_id, p.id)
    AND (
      _student_id = public.my_student_id()
      OR public.is_my_child(_student_id)
      OR (
        NOT public.is_self_service_role(auth.uid())
        AND NOT public.is_teacher_only(auth.uid())
        AND NOT public.is_support_staff_only(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.students s
          JOIN public.schools sch ON sch.id = s.school_id
          WHERE s.id = _student_id AND sch.org_id = public.get_user_org_id(auth.uid())
        )
      )
    )
  ORDER BY p.start_date
$$;

REVOKE ALL ON FUNCTION public.withheld_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withheld_results(uuid) TO authenticated;