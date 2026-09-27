-- Withhold results from fee debtors, and from pupils on a manual hold.
--
-- The lever BLMS gives a proprietor on fee collection: a family that owes more
-- than the school allows does not see the term's results until it pays.
--
--   * result_access_settings — per school: whether debtors are withheld, the
--     balance they may owe and still see results, and what families are told.
--   * result_holds — one pupil held by hand, with an internal reason (books not
--     returned, a disciplinary matter). Families see a generic message, never
--     the reason.
--
-- A debt is overdue invoices only: status 'overdue', or 'pending' past its due
-- date. A family is not a debtor the day a bill goes out.
--
-- Withholding is live. It is checked when results are read, not frozen into a
-- release, so paying the balance brings the results back with nothing for the
-- school to redo. It reaches the raw marks as well as the term report: blocking
-- only the report card would leave every mark visible on the parent dashboard.
--
-- Safe to run twice: every policy is dropped before it is created, and every
-- other statement is IF NOT EXISTS or CREATE OR REPLACE.

CREATE TABLE IF NOT EXISTS public.result_access_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  withhold_debtors boolean NOT NULL DEFAULT false,
  allowed_balance bigint NOT NULL DEFAULT 0 CHECK (allowed_balance >= 0),
  debtor_message text NOT NULL DEFAULT
    'Results are withheld until outstanding school fees are paid. Please contact the bursary.'
    CHECK (length(debtor_message) BETWEEN 1 AND 500),
  hold_message text NOT NULL DEFAULT
    'Results are being held by the school. Please contact the school office.'
    CHECK (length(hold_message) BETWEEN 1 AND 500),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.result_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.result_access_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_holds ENABLE ROW LEVEL SECURITY;

-- Settings: staff read (the Term report page explains what is withheld and
-- why); academic managers decide. Families never read either table — they are
-- told through term_report() and withheld_notice().
DROP POLICY IF EXISTS "Staff can view result access settings" ON public.result_access_settings;
CREATE POLICY "Staff can view result access settings"
ON public.result_access_settings FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools sc WHERE sc.id = result_access_settings.school_id
              AND sc.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Academic managers can manage result access settings" ON public.result_access_settings;
CREATE POLICY "Academic managers can manage result access settings"
ON public.result_access_settings FOR ALL TO authenticated
USING (
  public.is_academic_manager(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools sc WHERE sc.id = result_access_settings.school_id
              AND sc.org_id = public.get_user_org_id(auth.uid()))
)
WITH CHECK (
  public.is_academic_manager(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools sc WHERE sc.id = result_access_settings.school_id
              AND sc.org_id = public.get_user_org_id(auth.uid()))
);

-- Holds: the people who run the school, bursar included — a hold is often
-- about money in a form the invoice ledger does not show.
DROP POLICY IF EXISTS "School managers can view result holds" ON public.result_holds;
CREATE POLICY "School managers can view result holds"
ON public.result_holds FOR SELECT TO authenticated
USING (
  public.is_school_manager(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
);

DROP POLICY IF EXISTS "School managers can manage result holds" ON public.result_holds;
CREATE POLICY "School managers can manage result holds"
ON public.result_holds FOR ALL TO authenticated
USING (
  public.is_school_manager(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
)
WITH CHECK (
  public.is_school_manager(auth.uid())
  AND public.student_org_id(student_id) = public.get_user_org_id(auth.uid())
);

-- ---------------------------------------------------------------------------
-- Whether, and why, a pupil's results are withheld
-- ---------------------------------------------------------------------------
-- Internal: no caller check, so granted to no one. The two readers below and
-- the score policies decide who may learn the answer.
CREATE OR REPLACE FUNCTION public.result_withholding(_student_id uuid)
RETURNS TABLE (reason text, balance bigint, message text, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH pupil AS (
    SELECT s.id, s.school_id FROM public.students s WHERE s.id = _student_id
  ),
  settings AS (
    SELECT ras.* FROM public.result_access_settings ras JOIN pupil ON pupil.school_id = ras.school_id
  ),
  debt AS (
    SELECT coalesce(sum(greatest(i.total_amount - coalesce(i.amount_paid, 0), 0)), 0)::bigint AS balance
    FROM public.invoices i
    WHERE i.student_id = _student_id
      AND (i.status = 'overdue' OR (i.status = 'pending' AND i.due_date < current_date))
  )
  -- A hold wins over a debt: it is the more deliberate decision.
  SELECT 'hold', (SELECT balance FROM debt),
         coalesce((SELECT hold_message FROM settings),
                  'Results are being held by the school. Please contact the school office.'),
         h.reason
  FROM public.result_holds h WHERE h.student_id = _student_id
  UNION ALL
  SELECT 'debt', d.balance, st.debtor_message, NULL
  FROM settings st, debt d
  WHERE st.withhold_debtors
    AND d.balance > st.allowed_balance
    AND NOT EXISTS (SELECT 1 FROM public.result_holds h WHERE h.student_id = _student_id)
$$;

REVOKE ALL ON FUNCTION public.result_withholding(uuid) FROM PUBLIC, anon, authenticated;

-- For the score policies. Answers only about a pupil in the caller's own
-- organisation, so it cannot be used to probe other schools' debtors.
CREATE OR REPLACE FUNCTION public.results_withheld(_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.student_org_id(_student_id) = public.get_user_org_id(auth.uid())
     AND EXISTS (SELECT 1 FROM public.result_withholding(_student_id))
$$;

-- What a family is told, or NULL. Only the pupil, their parents and staff of
-- the school may ask, and it never returns the internal reason for a hold.
CREATE OR REPLACE FUNCTION public.withheld_notice(_student_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT w.message FROM public.result_withholding(_student_id) w
  WHERE _student_id = public.my_student_id()
     OR public.is_my_child(_student_id)
     OR (NOT public.is_self_service_role(auth.uid())
         AND public.student_org_id(_student_id) = public.get_user_org_id(auth.uid()))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.results_withheld(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withheld_notice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.results_withheld(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withheld_notice(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- The raw marks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students can view their own scores" ON public.student_scores;
CREATE POLICY "Students can view their own scores"
ON public.student_scores FOR SELECT TO authenticated
USING (student_id = public.my_student_id() AND NOT public.results_withheld(student_id));

DROP POLICY IF EXISTS "Parents can view their children's scores" ON public.student_scores;
CREATE POLICY "Parents can view their children's scores"
ON public.student_scores FOR SELECT TO authenticated
USING (public.is_my_child(student_id) AND NOT public.results_withheld(student_id));

-- ---------------------------------------------------------------------------
-- The term report
-- ---------------------------------------------------------------------------
-- As in 20260927190000, plus: families lose a withheld child's part of the
-- snapshot and are given the school's message instead; staff get a 'withheld'
-- list of who is withheld in the arm, why, and the overdue balance.
CREATE OR REPLACE FUNCTION public.term_report(_class_id uuid, _period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  class_org uuid;
  is_staff boolean;
  release record;
  mine uuid[];
  visible uuid[];
  withheld jsonb;
  live jsonb;
  empty jsonb;
BEGIN
  SELECT sc.org_id INTO class_org
  FROM public.classes c JOIN public.schools sc ON sc.id = c.school_id
  WHERE c.id = _class_id;

  SELECT r.snapshot, r.released_at INTO release
  FROM public.term_report_releases r
  WHERE r.class_id = _class_id AND r.academic_period_id = _period_id;

  empty := jsonb_build_object(
    'released', release.released_at IS NOT NULL,
    'components', '[]'::jsonb, 'students', '[]'::jsonb, 'subjects', '[]'::jsonb,
    'comments', '[]'::jsonb, 'ratings', '[]'::jsonb, 'withheld', '[]'::jsonb);

  is_staff := uid IS NOT NULL
    AND class_org IS NOT NULL
    AND class_org = public.get_user_org_id(uid)
    AND NOT public.is_self_service_role(uid)
    AND NOT public.is_support_staff_only(uid)
    AND (NOT public.is_teacher_only(uid) OR public.teaches_class(_class_id));

  IF is_staff THEN
    live := public.term_report_compute(_class_id, _period_id);
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'student_id', e.student_id, 'reason', w.reason, 'balance', w.balance, 'note', w.note)), '[]'::jsonb)
      INTO withheld
    FROM (SELECT DISTINCT student_id FROM public.enrolments
          WHERE class_id = _class_id AND academic_period_id = _period_id) e
    CROSS JOIN LATERAL public.result_withholding(e.student_id) w;

    RETURN live || jsonb_build_object(
      'released', release.released_at IS NOT NULL,
      'released_at', release.released_at,
      'snapshot', release.snapshot,
      'withheld', withheld);
  END IF;

  IF uid IS NULL OR release.snapshot IS NULL THEN
    RETURN empty;
  END IF;

  SELECT array_agg((x->>'student_id')::uuid) INTO mine
  FROM jsonb_array_elements(release.snapshot->'students') x
  WHERE (x->>'student_id')::uuid = public.my_student_id()
     OR public.is_my_child((x->>'student_id')::uuid);

  IF mine IS NULL THEN
    RETURN empty;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('student_id', m.id, 'message', w.message)), '[]'::jsonb)
    INTO withheld
  FROM unnest(mine) AS m(id)
  CROSS JOIN LATERAL public.result_withholding(m.id) w;

  SELECT array_agg(m.id) INTO visible
  FROM unnest(mine) AS m(id)
  WHERE NOT EXISTS (SELECT 1 FROM public.result_withholding(m.id));
  visible := coalesce(visible, ARRAY[]::uuid[]);

  RETURN release.snapshot || jsonb_build_object(
    'released', true,
    'released_at', release.released_at,
    'withheld', withheld,
    'students', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'students') x
                          WHERE (x->>'student_id')::uuid = ANY (visible)), '[]'::jsonb),
    'subjects', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'subjects') x
                          WHERE (x->>'student_id')::uuid = ANY (visible)), '[]'::jsonb),
    'comments', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'comments') x
                          WHERE (x->>'student_id')::uuid = ANY (visible)), '[]'::jsonb),
    'ratings', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(release.snapshot->'ratings') x
                         WHERE (x->>'student_id')::uuid = ANY (visible)), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.term_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.term_report(uuid, uuid) TO authenticated;
