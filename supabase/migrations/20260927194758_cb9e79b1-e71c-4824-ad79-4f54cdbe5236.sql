-- Withholding results: count only overdue fees, and let a school hold one pupil.
--
-- Two additions to 20260927190100_withhold_results_until_paid, both folded into
-- its single gate, results_withheld(), so every place that already obeys it —
-- the pupil and parent score policies, withheld_results(), and term_report()'s
-- family snapshot — obeys these too without being touched.
--
-- 1. Overdue only. A school releasing reports the week it sends the term's
--    bills would otherwise hide nearly every child's results. With
--    schools.withhold_overdue_only (on by default), results_outstanding()
--    counts an invoice only once it is due: status 'overdue', a due date that
--    has passed, or no due date at all — a bill with no date is treated as due,
--    as 20260927190100 treated every bill. A school can turn it off to count
--    every unpaid bill, as before.
--
-- 2. Manual holds. result_holds withholds one pupil's results for a reason of
--    the school's own (books not returned, a disciplinary matter), whatever the
--    fee position and whether or not the fee switch is on. A payment-plan
--    release (result_releases) is about fees and does not lift a hold. The
--    reason is for staff; the family sees family_message, or a default.
--
-- Safe to run twice: every policy is dropped before it is created, and every
-- other statement is IF NOT EXISTS, CREATE OR REPLACE or DROP ... IF EXISTS.

-- ---------------------------------------------------------------------------
-- Overdue only
-- ---------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS withhold_overdue_only boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.schools.withhold_overdue_only IS
  'When withholding results until fees are paid, count only invoices that are due: '
  'status overdue, a due date in the past, or no due date. False counts every unpaid bill.';

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
  JOIN public.schools sc ON sc.id = i.school_id
  WHERE i.student_id = _student_id
    AND i.status NOT IN ('void', 'draft')
    AND ip.start_date <= p.start_date
    AND (
      NOT sc.withhold_overdue_only
      OR i.status = 'overdue'
      OR i.due_date IS NULL
      OR i.due_date < current_date
    )
$$;

REVOKE ALL ON FUNCTION public.results_outstanding(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manual holds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.result_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  family_message text CHECK (family_message IS NULL OR length(family_message) BETWEEN 1 AND 500),
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.result_holds ENABLE ROW LEVEL SECURITY;

-- The same people who may release a pupil's results may hold them.
DROP POLICY IF EXISTS "Result releasers can view holds" ON public.result_holds;
CREATE POLICY "Result releasers can view holds"
ON public.result_holds FOR SELECT TO authenticated
USING (public.can_release_results(school_id));

DROP POLICY IF EXISTS "Result releasers can manage holds" ON public.result_holds;
CREATE POLICY "Result releasers can manage holds"
ON public.result_holds FOR ALL TO authenticated
USING (public.can_release_results(school_id))
WITH CHECK (
  public.can_release_results(school_id)
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = result_holds.student_id AND s.school_id = result_holds.school_id
  )
);

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.results_withheld(_student_id uuid, _period_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _period_id IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.result_holds h WHERE h.student_id = _student_id)
      OR (
        EXISTS (
          SELECT 1 FROM public.students s
          JOIN public.schools sc ON sc.id = s.school_id
          WHERE s.id = _student_id AND sc.withhold_results_until_paid
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.result_releases r
          WHERE r.student_id = _student_id AND r.academic_period_id = _period_id
        )
        AND public.results_outstanding(_student_id, _period_id) > 0
      )
    )
$$;

REVOKE ALL ON FUNCTION public.results_withheld(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Telling people why
-- ---------------------------------------------------------------------------
-- As in 20260927190100, plus whether the term is held by hand, what the family
-- is told, and — for staff only — the internal reason. The return type grows,
-- which CREATE OR REPLACE cannot do, so it is dropped and recreated.
DROP FUNCTION IF EXISTS public.withheld_results(uuid);

CREATE FUNCTION public.withheld_results(_student_id uuid)
RETURNS TABLE (
  academic_period_id uuid,
  period_name text,
  outstanding bigint,
  held boolean,
  message text,
  note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT
      (_student_id = public.my_student_id() OR public.is_my_child(_student_id)) AS is_family,
      (
        NOT public.is_self_service_role(auth.uid())
        AND NOT public.is_teacher_only(auth.uid())
        AND NOT public.is_support_staff_only(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.students s
          JOIN public.schools sch ON sch.id = s.school_id
          WHERE s.id = _student_id AND sch.org_id = public.get_user_org_id(auth.uid())
        )
      ) AS is_staff
  ),
  hold AS (
    SELECT h.reason, h.family_message FROM public.result_holds h WHERE h.student_id = _student_id
  )
  SELECT p.id,
         p.name,
         public.results_outstanding(_student_id, p.id),
         EXISTS (SELECT 1 FROM hold),
         CASE WHEN EXISTS (SELECT 1 FROM hold) THEN
           coalesce((SELECT family_message FROM hold),
                    'These results are being held by the school. Please contact the school office.')
         END,
         CASE WHEN (SELECT is_staff FROM caller) THEN (SELECT reason FROM hold) END
  FROM public.academic_periods p
  WHERE EXISTS (
      SELECT 1 FROM public.student_scores sc
      JOIN public.exams e ON e.id = sc.exam_id
      WHERE sc.student_id = _student_id AND e.academic_period_id = p.id
    )
    AND public.results_withheld(_student_id, p.id)
    AND ((SELECT is_family FROM caller) OR (SELECT is_staff FROM caller))
  ORDER BY p.start_date
$$;

REVOKE ALL ON FUNCTION public.withheld_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withheld_results(uuid) TO authenticated;