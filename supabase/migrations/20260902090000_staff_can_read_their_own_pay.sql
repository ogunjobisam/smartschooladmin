-- Staff can read their own pay.
--
-- Until now every payroll policy was role-gated — bursar, finance officer,
-- proprietor, HR admin — with no notion of "this row is about me". A teacher's own
-- payslip was invisible to the teacher, in the database and not merely in the UI.
-- The product has a parent portal and a student portal; the people who actually
-- work at the school had no way to see what they were paid.
--
-- This adds the missing half: the deduction breakdown a payslip needs, an index on
-- the link between a staff row and a login, and three narrow SELECT policies.

-- ---------------------------------------------------------------------------
-- 1. Record the deduction split.
-- ---------------------------------------------------------------------------
-- calculate_payroll_line computes pension and tax separately and the insert threw
-- both away, keeping only the total. A payslip that cannot tell someone what their
-- pension contribution was is a weak pay record, and re-deriving it later is worse
-- than useless: the rates in payroll_profiles drift after every raise, so last
-- year's payslip would silently re-render with this year's pension rate.
--
-- Rows written before this migration keep 0/0, which the payslip renders as a
-- single "Total deductions" line. That is deliberate — an old run should say what
-- it knows rather than imply a breakdown that was never stored.
ALTER TABLE public.payroll_run_items
  ADD COLUMN IF NOT EXISTS pension bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax     bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_run_items.pension IS
  'Pension deducted for this run, in whole currency units. 0 on rows written before the split was stored.';
COMMENT ON COLUMN public.payroll_run_items.tax IS
  'Tax deducted for this run, in whole currency units. 0 on rows written before the split was stored.';

-- ---------------------------------------------------------------------------
-- 2. Index the staff-to-login link.
-- ---------------------------------------------------------------------------
-- staff.user_id has been nullable and unindexed since the table was created, while
-- the equivalent students.user_id got an index when the student portal was built.
-- Every policy below probes it once per candidate row, so without this each check
-- is a sequential scan of the staff table.
--
-- Partial, because the column is NULL for every staff member added without an
-- invite and those rows can never match auth.uid().
CREATE INDEX IF NOT EXISTS idx_staff_user_id
  ON public.staff (user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Helpers, so the two policies below cannot reach through each other.
-- ---------------------------------------------------------------------------
-- A payslip needs both tables: the item carries the money, the run carries the
-- period and the approval status. Written as plain subqueries, the item policy
-- reads payroll_runs and the run policy reads payroll_run_items — and Postgres
-- evaluates each table's policy while satisfying the other's, which is
-- `42P17 infinite recursion detected in policy`. The exams and student_scores
-- policies hit exactly this once before.
--
-- SECURITY DEFINER breaks the cycle: the function runs as the table owner, for
-- whom row-level security does not apply, so the inner lookup does not re-enter
-- the policy that called it. Each is STABLE, reads one indexed row, and answers
-- only a yes/no question about the caller.

-- Every staff row belonging to the signed-in user.
--
-- Returns a set rather than one id on purpose. The existing my_staff_id() is
-- `SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1` — a LIMIT 1 with no
-- ORDER BY, which returns physical heap order and can change after any UPDATE to
-- the table. Someone employed at two schools in one group would have a payslip
-- appear and disappear for reasons nobody could reproduce. A set is simply
-- correct for one staff row or several.
CREATE OR REPLACE FUNCTION public.my_staff_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.staff WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_staff_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_staff_ids() TO authenticated;

-- Has this run been signed off? A draft is a proposal that can still be rejected
-- or re-run, and showing someone a figure that later changes is worse than
-- showing them nothing — so the subject of a payslip sees it only once the run is
-- approved. The finance roles who have to approve it are unaffected; their own
-- policies are untouched.
CREATE OR REPLACE FUNCTION public.payroll_run_released(_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payroll_runs r
    WHERE r.id = _run_id
      AND r.status IN ('approved'::public.payroll_status, 'paid'::public.payroll_status)
  )
$$;

REVOKE ALL ON FUNCTION public.payroll_run_released(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_run_released(uuid) TO authenticated;

-- Was the caller actually paid in this run? Answers only about the caller, so it
-- cannot be used to enumerate anybody else.
CREATE OR REPLACE FUNCTION public.payroll_run_includes_me(_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payroll_run_items i
    WHERE i.payroll_run_id = _run_id
      AND i.staff_id IN (SELECT public.my_staff_ids())
  )
$$;

REVOKE ALL ON FUNCTION public.payroll_run_includes_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_run_includes_me(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Let a staff member read their own pay.
-- ---------------------------------------------------------------------------
-- Three additive permissive policies, following the shape the student portal
-- established: one narrow policy per table, OR-ing alongside the existing finance
-- policies rather than replacing them. Nothing any finance role could read before
-- becomes unreadable, and nothing else opens.
--
-- All three are SELECT only. Reading a payslip must never become a way to edit
-- one — the existing FOR ALL policies still decide who can write.

DROP POLICY IF EXISTS "Staff can view their own payslips" ON public.payroll_run_items;
CREATE POLICY "Staff can view their own payslips"
ON public.payroll_run_items
FOR SELECT
TO authenticated
USING (
  staff_id IN (SELECT public.my_staff_ids())
  AND public.payroll_run_released(payroll_run_id)
);

-- The payslip needs the run for its period label and pay date, so the run itself
-- has to be readable — but only the runs this person actually appears in.
DROP POLICY IF EXISTS "Staff can view runs they were paid in" ON public.payroll_runs;
CREATE POLICY "Staff can view runs they were paid in"
ON public.payroll_runs
FOR SELECT
TO authenticated
USING (
  status IN ('approved'::public.payroll_status, 'paid'::public.payroll_status)
  AND public.payroll_run_includes_me(id)
);

-- A payslip should say which account was paid. This is the person's own bank
-- account, which they already know; it is not a widening of what anyone can learn
-- about anybody else. payroll_profiles is deliberately NOT opened — the payslip
-- reads the run item, so self-service never needs sight of current salary or the
-- rates behind it.
DROP POLICY IF EXISTS "Staff can view their own bank details" ON public.staff_bank_details;
CREATE POLICY "Staff can view their own bank details"
ON public.staff_bank_details
FOR SELECT
TO authenticated
USING (staff_id IN (SELECT public.my_staff_ids()));
