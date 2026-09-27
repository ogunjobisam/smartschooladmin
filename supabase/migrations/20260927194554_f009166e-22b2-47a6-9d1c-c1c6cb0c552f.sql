-- Close the high-priority holes from the September security audit.
--
-- Safe to run twice: every policy is dropped before it is created, functions
-- use CREATE OR REPLACE, triggers are dropped first, and columns use IF NOT
-- EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Pupils are not staff
-- ---------------------------------------------------------------------------
-- is_org_staff() meant "holds any role but parent", and the policies below
-- meant "is not a parent". Both were written before the student role existed,
-- so a pupil passed every one of them: other families' receipts and invoice
-- lines, staff contracts in document storage, and writes to announcements,
-- awards, subjects, enrolments and guardian links. CLAUDE.md §4 describes the
-- trap. is_self_service_role() is parent-or-pupil, so parents are refused
-- exactly as before and pupils now are too. Pupils' own data still reaches them
-- through the "Students can view their own …" policies.

CREATE OR REPLACE FUNCTION public.is_org_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role NOT IN ('parent'::app_role, 'student'::app_role)
  )
$$;

DROP POLICY IF EXISTS "Staff can manage class subjects" ON public.class_subjects;
CREATE POLICY "Staff can manage class subjects" ON public.class_subjects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (classes c
     JOIN schools s ON ((s.id = c.school_id)))
  WHERE ((c.id = class_subjects.class_id) AND (s.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM (classes c
     JOIN schools s ON ((s.id = c.school_id)))
  WHERE ((c.id = class_subjects.class_id) AND (s.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))));

DROP POLICY IF EXISTS "Staff can manage documents" ON public.document_files;
CREATE POLICY "Staff can manage documents" ON public.document_files
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((org_id = get_user_org_id(auth.uid())) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((org_id = get_user_org_id(auth.uid())) AND (NOT is_self_service_role(auth.uid()))));

DROP POLICY IF EXISTS "Staff can manage enrolments" ON public.enrolments;
CREATE POLICY "Staff can manage enrolments" ON public.enrolments
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (students s
     JOIN schools sc ON ((sc.id = s.school_id)))
  WHERE ((s.id = enrolments.student_id) AND (sc.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM (students s
     JOIN schools sc ON ((sc.id = s.school_id)))
  WHERE ((s.id = enrolments.student_id) AND (sc.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))));

DROP POLICY IF EXISTS "Staff can view enrolments" ON public.enrolments;
CREATE POLICY "Staff can view enrolments" ON public.enrolments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((NOT is_self_service_role(auth.uid())) AND (EXISTS ( SELECT 1
   FROM (students s
     JOIN schools sc ON ((sc.id = s.school_id)))
  WHERE ((s.id = enrolments.student_id) AND (sc.org_id = get_user_org_id(auth.uid()))))) AND ((NOT is_teacher_only(auth.uid())) OR teaches_class(class_id))))
;

DROP POLICY IF EXISTS "Staff can view invoice items" ON public.invoice_items;
CREATE POLICY "Staff can view invoice items" ON public.invoice_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((NOT is_self_service_role(auth.uid())) AND (EXISTS ( SELECT 1
   FROM (invoices i
     JOIN schools sc ON ((sc.id = i.school_id)))
  WHERE ((i.id = invoice_items.invoice_id) AND (sc.org_id = get_user_org_id(auth.uid())))))))
;

DROP POLICY IF EXISTS "Staff can view allocations" ON public.payment_allocations;
CREATE POLICY "Staff can view allocations" ON public.payment_allocations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((NOT is_self_service_role(auth.uid())) AND (EXISTS ( SELECT 1
   FROM (payments p
     JOIN schools sc ON ((sc.id = p.school_id)))
  WHERE ((p.id = payment_allocations.payment_id) AND (sc.org_id = get_user_org_id(auth.uid())))))))
;

DROP POLICY IF EXISTS "Staff can view receipts in their org" ON public.receipts;
CREATE POLICY "Staff can view receipts in their org" ON public.receipts
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((NOT is_self_service_role(auth.uid())) AND (EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = receipts.school_id) AND (schools.org_id = get_user_org_id(auth.uid())))))))
;

DROP POLICY IF EXISTS "Admins can manage announcements" ON public.school_announcements;
CREATE POLICY "Admins can manage announcements" ON public.school_announcements
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((org_id = get_user_org_id(auth.uid())) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((org_id = get_user_org_id(auth.uid())) AND (NOT is_self_service_role(auth.uid()))));

DROP POLICY IF EXISTS "Staff can manage student awards" ON public.student_awards;
CREATE POLICY "Staff can manage student awards" ON public.student_awards
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = student_awards.school_id) AND (schools.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = student_awards.school_id) AND (schools.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))));

DROP POLICY IF EXISTS "Staff can manage student guardian links" ON public.student_guardians;
CREATE POLICY "Staff can manage student guardian links" ON public.student_guardians
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (students s
     JOIN schools sc ON ((sc.id = s.school_id)))
  WHERE ((s.id = student_guardians.student_id) AND (sc.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM (students s
     JOIN schools sc ON ((sc.id = s.school_id)))
  WHERE ((s.id = student_guardians.student_id) AND (sc.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))));

DROP POLICY IF EXISTS "Staff can view student-guardian links" ON public.student_guardians;
CREATE POLICY "Staff can view student-guardian links" ON public.student_guardians
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((NOT is_self_service_role(auth.uid())) AND (EXISTS ( SELECT 1
   FROM (students s
     JOIN schools sc ON ((sc.id = s.school_id)))
  WHERE ((s.id = student_guardians.student_id) AND (sc.org_id = get_user_org_id(auth.uid())))))))
;

DROP POLICY IF EXISTS "Staff can manage subjects" ON public.subjects;
CREATE POLICY "Staff can manage subjects" ON public.subjects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = subjects.school_id) AND (schools.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = subjects.school_id) AND (schools.org_id = get_user_org_id(auth.uid()))))) AND (NOT is_self_service_role(auth.uid()))));


-- ---------------------------------------------------------------------------
-- 2. Timetables stay inside their organisation
-- ---------------------------------------------------------------------------
-- The manager policies were `is_school_manager()` and nothing else, so a bursar
-- in one organisation could rewrite or delete another's timetable (deleting
-- periods cascades to the entries). The staff read policies compared school_id
-- to COALESCE(get_user_school_id(), school_id), which is always true for anyone
-- with no school of their own, so a proprietor read every organisation's.

-- The school is in the caller's organisation and, for someone tied to one
-- school, is that school.
CREATE OR REPLACE FUNCTION public.school_in_my_scope(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = _school_id
      AND s.org_id = public.get_user_org_id(auth.uid())
      AND (public.get_user_school_id(auth.uid()) IS NULL
           OR s.id = public.get_user_school_id(auth.uid()))
  )
$$;
REVOKE ALL ON FUNCTION public.school_in_my_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_in_my_scope(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Managers manage periods" ON public.timetable_periods;
CREATE POLICY "Managers manage periods" ON public.timetable_periods
  FOR ALL TO authenticated
  USING (public.is_school_manager(auth.uid()) AND public.school_in_my_scope(school_id))
  WITH CHECK (public.is_school_manager(auth.uid()) AND public.school_in_my_scope(school_id));

DROP POLICY IF EXISTS "Managers manage timetable" ON public.timetable_entries;
CREATE POLICY "Managers manage timetable" ON public.timetable_entries
  FOR ALL TO authenticated
  USING (public.is_school_manager(auth.uid()) AND public.school_in_my_scope(school_id))
  WITH CHECK (public.is_school_manager(auth.uid()) AND public.school_in_my_scope(school_id));

DROP POLICY IF EXISTS "Managers manage exceptions" ON public.timetable_exceptions;
CREATE POLICY "Managers manage exceptions" ON public.timetable_exceptions
  FOR ALL TO authenticated
  USING (public.is_school_manager(auth.uid()) AND public.school_in_my_scope(school_id))
  WITH CHECK (public.is_school_manager(auth.uid()) AND public.school_in_my_scope(school_id));

DROP POLICY IF EXISTS "Staff can view school timetable" ON public.timetable_entries;
CREATE POLICY "Staff can view school timetable" ON public.timetable_entries
  FOR SELECT TO authenticated
  USING (public.is_org_staff(auth.uid()) AND public.school_in_my_scope(school_id));

DROP POLICY IF EXISTS "Staff can view exceptions" ON public.timetable_exceptions;
CREATE POLICY "Staff can view exceptions" ON public.timetable_exceptions
  FOR SELECT TO authenticated
  USING (public.is_org_staff(auth.uid()) AND public.school_in_my_scope(school_id));

-- A pupil still reads their own school's periods through the first clause.
DROP POLICY IF EXISTS "School members can view periods" ON public.timetable_periods;
CREATE POLICY "School members can view periods" ON public.timetable_periods
  FOR SELECT TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid())
         OR (public.is_org_staff(auth.uid()) AND public.school_in_my_scope(school_id)));

-- ---------------------------------------------------------------------------
-- 3. What an organisation pays for is not the organisation's to set
-- ---------------------------------------------------------------------------
-- Owners had FOR ALL on org_subscriptions, so they could write themselves an
-- active premium plan. The app never writes it from the browser: the
-- subscription webhook activates plans through activate_subscription() with
-- the service role. Owners keep read access.
DROP POLICY IF EXISTS "Org owners manage their subscription" ON public.org_subscriptions;
DROP POLICY IF EXISTS "Org owners view their subscription" ON public.org_subscriptions;
CREATE POLICY "Org owners view their subscription" ON public.org_subscriptions
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'proprietor')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'group_admin')
      OR public.has_role(auth.uid(), 'school_admin')));
REVOKE INSERT, UPDATE, DELETE ON public.org_subscriptions FROM anon, authenticated;

-- A proprietor may update their organisation row, which is how Settings saves
-- the name, country, currency, logo and the AI add-on switch. But the same
-- policy let them raise ai_monthly_limit, which ai-insights trusts as the
-- allowance, and change the demo flags. Those belong to the platform. A policy
-- cannot compare old and new values, so a trigger does it, for client roles
-- only: edge functions (service_role) and SECURITY DEFINER functions (their
-- owner) are unaffected.
CREATE OR REPLACE FUNCTION public.guard_organisation_platform_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_monthly_limit IS DISTINCT FROM 200
       OR NEW.is_demo IS DISTINCT FROM false
       OR NEW.demo_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'The AI allowance and demo settings are set by the platform'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.ai_monthly_limit IS DISTINCT FROM OLD.ai_monthly_limit
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
     OR NEW.demo_expires_at IS DISTINCT FROM OLD.demo_expires_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'The AI allowance and demo settings are set by the platform'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_organisation_platform_columns ON public.organisation_groups;
CREATE TRIGGER guard_organisation_platform_columns
  BEFORE INSERT OR UPDATE ON public.organisation_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_organisation_platform_columns();

-- ---------------------------------------------------------------------------
-- 4. The message queue sends only what the organisation wrote
-- ---------------------------------------------------------------------------
-- school_id sets the From name, logo and reply-to on the email, and was never
-- tied to the row's organisation, so a message could go out as another
-- organisation's school.
DROP POLICY IF EXISTS "Staff can insert messages" ON public.outbound_message_queue;
CREATE POLICY "Staff can insert messages" ON public.outbound_message_queue
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND (school_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = outbound_message_queue.school_id AND s.org_id = outbound_message_queue.org_id)));

-- The retry policy exists so a manager can requeue a failed message. It also
-- let them rewrite the recipient and body of any row, turning a failed fee
-- reminder into mail to anyone. Clients may change delivery state only.
CREATE OR REPLACE FUNCTION public.guard_outbound_message_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.recipient IS DISTINCT FROM OLD.recipient
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.subject IS DISTINCT FROM OLD.subject
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.reply_to IS DISTINCT FROM OLD.reply_to
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.school_id IS DISTINCT FROM OLD.school_id) THEN
    RAISE EXCEPTION 'A queued message can be retried, not rewritten'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_outbound_message_content ON public.outbound_message_queue;
CREATE TRIGGER guard_outbound_message_content
  BEFORE UPDATE ON public.outbound_message_queue
  FOR EACH ROW EXECUTE FUNCTION public.guard_outbound_message_content();

-- ---------------------------------------------------------------------------
-- 5. A payment is recorded once, however many times it is confirmed
-- ---------------------------------------------------------------------------
-- The webhooks checked "already successful?", then inserted the payment, then
-- marked it successful. Parallel confirmations of one reference all passed the
-- check, so one real payment credited an invoice (or SMS credits) several
-- times. Each webhook now claims the row with a single conditional UPDATE
-- before recording anything; only one request can win it. A claim older than
-- ten minutes can be taken again, so a request that died mid-way does not
-- strand the payment.
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.platform_payments ADD COLUMN IF NOT EXISTS claimed_at timestamptz;