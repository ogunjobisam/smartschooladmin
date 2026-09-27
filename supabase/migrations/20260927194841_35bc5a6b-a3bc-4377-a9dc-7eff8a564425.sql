-- Waivers, discounts and scholarships that actually change the bill.
--
-- 'fee_waiver' and 'discount' have been approval types since the approvals
-- queue was built, but nothing created them and approving one touched nothing.
-- This makes them real:
--
--   * request_invoice_adjustment() — finance staff ask for a waiver, discount
--     (an amount, or a percentage of the gross fees) or scholarship on one
--     invoice. It records the adjustment and puts it in the approvals queue in
--     one step. It cannot ask for more than is still owed, counting requests
--     already pending.
--   * decide_invoice_adjustment() — a senior approver (proprietor, group admin,
--     school admin, principal), who must not be the person who asked, approves
--     or rejects. Approval adds a credit line to the invoice and lowers its
--     total, so every balance in the app — arrears, statements, withholding
--     results — follows without being taught about adjustments. A bill waived
--     to nothing is marked paid.
--   * Approving through the approvals table directly is refused for these
--     requests, so an approval can never be recorded without the bill changing.
--
-- Safe to run twice: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.

CREATE TABLE IF NOT EXISTS public.invoice_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('waiver', 'discount', 'scholarship')),
  amount bigint NOT NULL CHECK (amount > 0),
  percent numeric(5,2) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_request_id uuid REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  invoice_item_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice ON public.invoice_adjustments (invoice_id, status);

ALTER TABLE public.invoice_adjustments ENABLE ROW LEVEL SECURITY;

-- Read by the staff who can read invoices. Written only through the two
-- functions below, so there are deliberately no write policies.
DROP POLICY IF EXISTS "Staff can view invoice adjustments" ON public.invoice_adjustments;
CREATE POLICY "Staff can view invoice adjustments"
ON public.invoice_adjustments FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND NOT public.is_teacher_only(auth.uid())
  AND NOT public.is_support_staff_only(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.invoices i JOIN public.schools sc ON sc.id = i.school_id
    WHERE i.id = invoice_adjustments.invoice_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
);

-- Who may approve: the people who run the school, not the people who take
-- its money. A bursar asks; a principal decides.
CREATE OR REPLACE FUNCTION public.can_approve_adjustments(_school_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
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
    )
$$;

-- ---------------------------------------------------------------------------
-- Asking
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_invoice_adjustment(
  _invoice_id uuid,
  _kind text,
  _amount bigint,
  _percent numeric,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  gross bigint;
  pending bigint;
  owed bigint;
  value bigint;
  adjustment_id uuid;
  request_id uuid;
BEGIN
  SELECT i.*, sc.org_id INTO inv
  FROM public.invoices i JOIN public.schools sc ON sc.id = i.school_id
  WHERE i.id = _invoice_id;

  -- The same people who may release withheld results: those who run the
  -- school or its money.
  IF inv.id IS NULL OR NOT public.can_release_results(inv.school_id) THEN
    RAISE EXCEPTION 'You cannot request adjustments on this invoice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF inv.status IN ('void', 'draft') THEN
    RAISE EXCEPTION 'This invoice is %; there is nothing to adjust', inv.status USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF _kind NOT IN ('waiver', 'discount', 'scholarship') THEN
    RAISE EXCEPTION 'Unknown adjustment %', _kind USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A percentage is of the fees billed, not of what is left, so "10% sibling
  -- discount" means the same whether or not the family has paid anything yet.
  IF _percent IS NOT NULL THEN
    IF _percent <= 0 OR _percent > 100 THEN
      RAISE EXCEPTION 'A percentage must be above 0 and at most 100' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT coalesce(sum(amount), 0) INTO gross FROM public.invoice_items WHERE invoice_id = _invoice_id AND amount > 0;
    IF gross = 0 THEN gross := inv.total_amount; END IF;
    value := round(gross * _percent / 100);
  ELSE
    value := _amount;
  END IF;

  IF value IS NULL OR value <= 0 THEN
    RAISE EXCEPTION 'An adjustment must be more than zero' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO pending
  FROM public.invoice_adjustments WHERE invoice_id = _invoice_id AND status = 'pending';
  owed := inv.total_amount - coalesce(inv.amount_paid, 0) - pending;
  IF value > owed THEN
    RAISE EXCEPTION 'That is more than the % still owed on this invoice once pending requests are counted', greatest(owed, 0)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.invoice_adjustments (invoice_id, kind, amount, percent, reason, requested_by)
    VALUES (_invoice_id, _kind, value, _percent, btrim(_reason), auth.uid())
    RETURNING id INTO adjustment_id;

  INSERT INTO public.approval_requests (org_id, type, description, amount, requested_by, reference_type, reference_id)
    VALUES (
      inv.org_id,
      (CASE WHEN _kind = 'waiver' THEN 'fee_waiver' ELSE 'discount' END)::approval_type,
      initcap(_kind) || ' on invoice ' || inv.invoice_number || ': ' || btrim(_reason),
      value,
      auth.uid(),
      'invoice_adjustment',
      adjustment_id
    )
    RETURNING id INTO request_id;

  UPDATE public.invoice_adjustments SET approval_request_id = request_id WHERE id = adjustment_id;
  RETURN adjustment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_invoice_adjustment(_adjustment_id uuid, _approve boolean, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  adj record;
  inv record;
  item_id uuid;
  label text;
BEGIN
  SELECT * INTO adj FROM public.invoice_adjustments WHERE id = _adjustment_id FOR UPDATE;
  IF adj.id IS NULL THEN
    RAISE EXCEPTION 'No such adjustment' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = adj.invoice_id FOR UPDATE;

  IF NOT public.can_approve_adjustments(inv.school_id) THEN
    RAISE EXCEPTION 'Only a proprietor, school admin or principal can decide this' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Maker-checker: whoever asked for money to be written off cannot be the one
  -- who writes it off.
  IF adj.requested_by IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You asked for this adjustment, so someone else has to decide it' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF adj.status <> 'pending' THEN
    RAISE EXCEPTION 'This adjustment has already been %', adj.status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF _approve THEN
    -- The balance may have moved since the request (a payment came in).
    IF adj.amount > inv.total_amount - coalesce(inv.amount_paid, 0) THEN
      RAISE EXCEPTION 'The invoice now has less owing than this adjustment; reject it and ask again' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    label := initcap(adj.kind) || ': ' || adj.reason
      || CASE WHEN adj.percent IS NOT NULL THEN ' (' || trim(to_char(adj.percent, 'FM990.##')) || '%)' ELSE '' END;
    INSERT INTO public.invoice_items (invoice_id, description, amount)
      VALUES (adj.invoice_id, label, -adj.amount)
      RETURNING id INTO item_id;

    UPDATE public.invoices
      SET total_amount = total_amount - adj.amount,
          status = CASE
            WHEN total_amount - adj.amount <= coalesce(amount_paid, 0) THEN 'paid'::invoice_status
            ELSE status
          END
      WHERE id = adj.invoice_id;
  END IF;

  UPDATE public.invoice_adjustments
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_notes = nullif(btrim(coalesce(_notes, '')), ''),
        invoice_item_id = item_id
    WHERE id = _adjustment_id;

  -- The approvals queue says the same thing. The guard below lets this one
  -- update through and no other.
  PERFORM set_config('app.deciding_adjustment', 'on', true);
  UPDATE public.approval_requests
    SET status = (CASE WHEN _approve THEN 'approved' ELSE 'rejected' END)::approval_status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = nullif(btrim(coalesce(_notes, '')), '')
    WHERE id = adj.approval_request_id;
  PERFORM set_config('app.deciding_adjustment', 'off', true);
END;
$$;

-- An adjustment's approval row changes only through decide_invoice_adjustment,
-- or the queue could say "approved" while the bill stayed the same.
CREATE OR REPLACE FUNCTION public.guard_adjustment_approvals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.reference_type = 'invoice_adjustment'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.deciding_adjustment', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Decide waivers and discounts from the Approvals page, which also changes the invoice'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_requests_guard_adjustments ON public.approval_requests;
CREATE TRIGGER approval_requests_guard_adjustments
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_adjustment_approvals();

REVOKE ALL ON FUNCTION public.request_invoice_adjustment(uuid, text, bigint, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_invoice_adjustment(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_approve_adjustments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_invoice_adjustment(uuid, text, bigint, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_invoice_adjustment(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_adjustments(uuid) TO authenticated;