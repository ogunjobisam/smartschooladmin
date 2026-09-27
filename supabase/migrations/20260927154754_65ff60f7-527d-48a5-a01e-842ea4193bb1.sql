-- Staff can read their own pay (completion: columns already exist; this adds
-- the index, helpers and policies that were missing).

CREATE INDEX IF NOT EXISTS idx_staff_user_id
  ON public.staff (user_id)
  WHERE user_id IS NOT NULL;

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

DROP POLICY IF EXISTS "Staff can view their own payslips" ON public.payroll_run_items;
CREATE POLICY "Staff can view their own payslips"
ON public.payroll_run_items
FOR SELECT
TO authenticated
USING (
  staff_id IN (SELECT public.my_staff_ids())
  AND public.payroll_run_released(payroll_run_id)
);

DROP POLICY IF EXISTS "Staff can view runs they were paid in" ON public.payroll_runs;
CREATE POLICY "Staff can view runs they were paid in"
ON public.payroll_runs
FOR SELECT
TO authenticated
USING (
  status IN ('approved'::public.payroll_status, 'paid'::public.payroll_status)
  AND public.payroll_run_includes_me(id)
);

DROP POLICY IF EXISTS "Staff can view their own bank details" ON public.staff_bank_details;
CREATE POLICY "Staff can view their own bank details"
ON public.staff_bank_details
FOR SELECT
TO authenticated
USING (staff_id IN (SELECT public.my_staff_ids()));