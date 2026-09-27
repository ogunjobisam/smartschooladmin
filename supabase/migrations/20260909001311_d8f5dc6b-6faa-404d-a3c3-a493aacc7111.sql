-- Subscription billing: per-student per-term plans with a prepaid SMS add-on.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  price_per_student_term numeric(14,2) NOT NULL DEFAULT 0,
  student_limit integer,
  ai_enabled boolean NOT NULL DEFAULT false,
  payroll_enabled boolean NOT NULL DEFAULT false,
  multi_school boolean NOT NULL DEFAULT false,
  storage_limit_mb integer NOT NULL DEFAULT 1024,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  org_id uuid PRIMARY KEY REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.subscription_plans(code) DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  current_period_id uuid,
  renews_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_credit_balances (
  org_id uuid PRIMARY KEY REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  queue_id uuid,
  recipient text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  gateway text NOT NULL,
  gateway_reference text UNIQUE NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  purpose text NOT NULL,
  plan_code text,
  academic_period_id uuid,
  sms_credits integer,
  status text NOT NULL DEFAULT 'initiated',
  payer_email text,
  payer_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_usage_org_created
  ON public.sms_usage_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_payments_org_created
  ON public.platform_payments(org_id, created_at DESC);

GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_subscriptions TO authenticated;
GRANT ALL ON public.org_subscriptions TO service_role;

GRANT SELECT ON public.sms_credit_balances TO authenticated;
GRANT ALL ON public.sms_credit_balances TO service_role;

GRANT SELECT ON public.sms_usage_log TO authenticated;
GRANT ALL ON public.sms_usage_log TO service_role;

GRANT SELECT, INSERT ON public.platform_payments TO authenticated;
GRANT ALL ON public.platform_payments TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;

-- The plan catalogue is public to signed-in users.
CREATE POLICY "Authenticated can view plans"
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (true);

-- Org owners manage their own subscription. The activate_subscription function
-- (service role) is what actually changes a plan after a verified payment, so the
-- UPDATE here only lets an owner upgrade between plans they choose themselves.
CREATE POLICY "Org owners manage their subscription"
  ON public.org_subscriptions FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')));

CREATE POLICY "Org owners view their SMS balance"
  ON public.sms_credit_balances FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')));

CREATE POLICY "Org owners view their SMS usage"
  ON public.sms_usage_log FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')));

-- Owners can start a payment (INSERT) and view their payments (SELECT). The
-- confirmation that marks a payment successful is done by the webhook edge
-- function using the service role, so there is no UPDATE policy here.
CREATE POLICY "Org owners start and view their payments"
  ON public.platform_payments FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')));

CREATE POLICY "Org owners create a payment"
  ON public.platform_payments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')));

-- Billable student count: distinct students enrolled in the org's current term.
CREATE OR REPLACE FUNCTION public.org_current_student_count(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT e.student_id)::integer
  FROM public.enrolments e
  JOIN public.academic_periods ap ON ap.id = e.academic_period_id
  JOIN public.academic_years ay ON ay.id = ap.academic_year_id
  WHERE ay.org_id = _org_id
    AND ap.is_current = true
$$;

-- One-call entitlement for the signed-in user's organisation.
CREATE OR REPLACE FUNCTION public.my_subscription()
RETURNS TABLE(
  plan_code text,
  plan_name text,
  price_per_student_term numeric,
  student_limit integer,
  ai_enabled boolean,
  payroll_enabled boolean,
  multi_school boolean,
  storage_limit_mb integer,
  status text,
  sms_balance integer,
  student_count integer,
  current_period_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.code, p.name, p.price_per_student_term, p.student_limit,
    p.ai_enabled, p.payroll_enabled, p.multi_school, p.storage_limit_mb,
    COALESCE(s.status, 'active'),
    COALESCE(b.balance, 0),
    public.org_current_student_count(og.id),
    s.current_period_id
  FROM public.organisation_groups og
  LEFT JOIN public.org_subscriptions s ON s.org_id = og.id
  LEFT JOIN public.subscription_plans p ON p.code = COALESCE(s.plan_code, 'free')
  LEFT JOIN public.sms_credit_balances b ON b.org_id = og.id
  WHERE og.id = public.get_user_org_id(auth.uid())
$$;

-- Set a plan after a confirmed payment (called by the webhook, service role).
CREATE OR REPLACE FUNCTION public.activate_subscription(_org_id uuid, _plan_code text, _period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_subscriptions (org_id, plan_code, status, current_period_id, updated_at)
  VALUES (_org_id, _plan_code, 'active', _period_id, now())
  ON CONFLICT (org_id) DO UPDATE
    SET plan_code = EXCLUDED.plan_code,
        status = 'active',
        current_period_id = EXCLUDED.current_period_id,
        updated_at = now();
END;
$$;

-- Top up an organisation's SMS balance after a confirmed bundle purchase.
CREATE OR REPLACE FUNCTION public.add_sms_credits(_org_id uuid, _credits integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.sms_credit_balances (org_id, balance, updated_at)
  VALUES (_org_id, _credits, now())
  ON CONFLICT (org_id) DO UPDATE
    SET balance = public.sms_credit_balances.balance + EXCLUDED.balance,
        updated_at = now()
$$;

-- Deduct one credit when an SMS is actually sent. Returns false if there is no
-- balance, so the queue processor can leave the message queued rather than
-- silently dropping it.
CREATE OR REPLACE FUNCTION public.charge_sms(_org_id uuid, _queue_id uuid, _recipient text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  charged boolean;
BEGIN
  UPDATE public.sms_credit_balances
    SET balance = balance - 1, updated_at = now()
    WHERE org_id = _org_id AND balance > 0
    RETURNING true INTO charged;
  IF charged THEN
    INSERT INTO public.sms_usage_log (org_id, queue_id, recipient)
      VALUES (_org_id, _queue_id, _recipient);
  END IF;
  RETURN COALESCE(charged, false);
END;
$$;

-- Seed the three plans.
INSERT INTO public.subscription_plans (code, name, price_per_student_term, student_limit, ai_enabled, payroll_enabled, multi_school, storage_limit_mb, sort_order)
VALUES
  ('free', 'Free', 0.00, 50, false, false, false, 512, 0),
  ('standard', 'Standard', 300.00, NULL, false, true, true, 10240, 1),
  ('premium', 'Premium', 450.00, NULL, true, true, true, 51200, 2)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price_per_student_term = EXCLUDED.price_per_student_term,
  student_limit = EXCLUDED.student_limit,
  ai_enabled = EXCLUDED.ai_enabled,
  payroll_enabled = EXCLUDED.payroll_enabled,
  multi_school = EXCLUDED.multi_school,
  storage_limit_mb = EXCLUDED.storage_limit_mb,
  sort_order = EXCLUDED.sort_order;

-- Existing organisations start on Standard so current features keep working.
INSERT INTO public.org_subscriptions (org_id, plan_code, status)
SELECT id, 'standard', 'active' FROM public.organisation_groups
WHERE NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.org_id = public.organisation_groups.id)
ON CONFLICT DO NOTHING;

-- Every organisation starts with zero SMS credit.
INSERT INTO public.sms_credit_balances (org_id, balance)
SELECT id, 0 FROM public.organisation_groups g
WHERE NOT EXISTS (SELECT 1 FROM public.sms_credit_balances b WHERE b.org_id = g.id)
ON CONFLICT DO NOTHING;
