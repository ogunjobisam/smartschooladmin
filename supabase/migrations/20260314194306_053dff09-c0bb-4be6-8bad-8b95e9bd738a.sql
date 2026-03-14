
-- 1. Fix cross-org privilege escalation on user_roles
-- Drop existing INSERT policy if any, and create scoped ones
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;

-- Only allow inserts where org_id matches caller's org
CREATE POLICY "Scoped insert user_roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Only allow updates/deletes within own org and by admin roles
CREATE POLICY "Scoped update user_roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (org_id = get_user_org_id(auth.uid()) AND (
  has_role(auth.uid(), 'proprietor'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
))
WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Scoped delete user_roles"
ON public.user_roles FOR DELETE TO authenticated
USING (org_id = get_user_org_id(auth.uid()) AND (
  has_role(auth.uid(), 'proprietor'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
));

CREATE POLICY "Users can view roles in their org"
ON public.user_roles FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

-- 2. Fix profiles SELECT policy: scope to same-org users
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view same-org profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur1
    WHERE ur1.user_id = profiles.user_id
      AND ur1.org_id = get_user_org_id(auth.uid())
  )
);

-- 3. Fix salary_change_requests: restrict SELECT to HR/finance roles
DROP POLICY IF EXISTS "Users can view salary changes in their org" ON public.salary_change_requests;
DROP POLICY IF EXISTS "Org members can view salary changes" ON public.salary_change_requests;

CREATE POLICY "HR/Finance can view salary changes"
ON public.salary_change_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM schools WHERE schools.id = salary_change_requests.school_id
      AND schools.org_id = get_user_org_id(auth.uid())
  )
  AND (
    has_role(auth.uid(), 'proprietor'::app_role)
    OR has_role(auth.uid(), 'hr_admin'::app_role)
    OR has_role(auth.uid(), 'bursar'::app_role)
    OR has_role(auth.uid(), 'finance_officer'::app_role)
    OR has_role(auth.uid(), 'principal'::app_role)
  )
);

-- 4. Fix audit_logs: restrict SELECT to admin roles only
DROP POLICY IF EXISTS "Users can view audit logs in their org" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (
    has_role(auth.uid(), 'proprietor'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'principal'::app_role)
    OR has_role(auth.uid(), 'school_admin'::app_role)
  )
);

-- 5. Fix outbound_message_queue INSERT: restrict to staff roles only
DROP POLICY IF EXISTS "System can insert messages" ON public.outbound_message_queue;

CREATE POLICY "Staff can insert messages"
ON public.outbound_message_queue FOR INSERT TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND NOT has_role(auth.uid(), 'parent'::app_role)
);

-- 6. Fix payment_transactions SELECT: restrict PII to finance roles
DROP POLICY IF EXISTS "Users can view payment transactions in their org" ON public.payment_transactions;

CREATE POLICY "Finance can view payment transactions"
ON public.payment_transactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM schools
    WHERE schools.id = payment_transactions.school_id
      AND schools.org_id = get_user_org_id(auth.uid())
  )
  AND (
    has_role(auth.uid(), 'proprietor'::app_role)
    OR has_role(auth.uid(), 'bursar'::app_role)
    OR has_role(auth.uid(), 'finance_officer'::app_role)
    OR has_role(auth.uid(), 'principal'::app_role)
  )
);
