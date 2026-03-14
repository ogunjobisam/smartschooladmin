
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.notification_type AS ENUM (
  'invoice_generated', 'payment_received', 'overdue_reminder',
  'guardian_invite', 'staff_invite', 'payroll_pending', 'approval_result'
);

CREATE TYPE public.payment_gateway AS ENUM ('paystack', 'flutterwave', 'manual');

CREATE TYPE public.transaction_status AS ENUM ('initiated', 'pending', 'successful', 'failed', 'reversed');

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Org members can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_type public.notification_type NOT NULL,
  channel_in_app BOOLEAN NOT NULL DEFAULT true,
  channel_email BOOLEAN NOT NULL DEFAULT false,
  channel_sms BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, notification_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- PAYMENT TRANSACTIONS
-- ============================================================
CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL DEFAULT 0,
  gateway public.payment_gateway NOT NULL DEFAULT 'manual',
  gateway_reference TEXT,
  status public.transaction_status NOT NULL DEFAULT 'initiated',
  payer_name TEXT,
  payer_email TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage payment transactions"
  ON public.payment_transactions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = payment_transactions.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = payment_transactions.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
  );

CREATE POLICY "Users can view payment transactions in their org"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = payment_transactions.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );

-- ============================================================
-- RECEIPTS
-- ============================================================
CREATE TABLE public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by UUID
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage receipts"
  ON public.receipts FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = receipts.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = receipts.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
  );

CREATE POLICY "Users can view receipts in their org"
  ON public.receipts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = receipts.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );

-- ============================================================
-- DOCUMENT FILES
-- ============================================================
CREATE TABLE public.document_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  category TEXT DEFAULT 'general',
  notes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view documents"
  ON public.document_files FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Staff can manage documents"
  ON public.document_files FOR ALL TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND NOT has_role(auth.uid(), 'parent')
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND NOT has_role(auth.uid(), 'parent')
  );

-- ============================================================
-- SALARY CHANGE REQUESTS
-- ============================================================
CREATE TABLE public.salary_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requested_by UUID,
  field_changed TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '0',
  new_value TEXT NOT NULL,
  reason TEXT,
  approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.salary_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR and finance can manage salary change requests"
  ON public.salary_change_requests FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = salary_change_requests.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = salary_change_requests.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
  );

CREATE POLICY "Users can view salary change requests in their org"
  ON public.salary_change_requests FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = salary_change_requests.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );

-- ============================================================
-- PAYMENT GATEWAY CONFIG
-- ============================================================
CREATE TABLE public.payment_gateway_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  provider public.payment_gateway NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  public_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

ALTER TABLE public.payment_gateway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage gateway config"
  ON public.payment_gateway_config FOR ALL TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Org members can view gateway config"
  ON public.payment_gateway_config FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
