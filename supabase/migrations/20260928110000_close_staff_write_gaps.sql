-- Close the write and read gaps found in the production-readiness audit.
--
-- Every policy here was a denylist that only said "not a parent or pupil", so
-- teachers and support staff inherited it (CLAUDE.md §4). Each was checked by
-- running the exploit as that user against a replayed database; the matching
-- assertions are in supabase/tests/rls.sql under "Staff write gaps".
--
--   1. subjects / class_subjects: any staff member could delete a subject, and
--      student_scores, exam_subjects and CBT tests cascade from it — support
--      staff, who can read no marks at all, could wipe a subject's scores.
--      Now the academic managers who run Settings.
--   2. student_guardians: any staff member could link any parent account to
--      any child, and is_my_child() then showed that parent the child's marks
--      and invoices. The guardian was not even checked against the org. Now
--      school managers only, and the guardian must be in the caller's org.
--   3. enrolments: teachers could move or remove the pupils they teach and
--      support staff any pupil. Now school managers, as for students.
--   4. receipts, invoice_items, payment_allocations: staff reads excluded only
--      parents and pupils, so teachers and support staff read every receipt.
--      Now the same exclusions as invoices. invoice_items and allocations were
--      shielded only because their subquery read a locked table.
--   5. document_files and the school-documents bucket: every staff member could
--      read, replace and delete every student, staff, invoice and payroll-run
--      document. A document is now visible to whoever can see the record it is
--      attached to; teachers and support staff may add documents but not
--      replace or remove them.
--   6. school-assets bucket: a principal in one org could overwrite or delete
--      another org's logo. Writes are now limited to the caller's own schools.
--   7. audit_logs: any member could insert an entry attributed to anyone. The
--      author is now stamped from the session.
--
-- Safe to run twice: every policy is dropped before it is created, functions
-- are CREATE OR REPLACE, and the trigger is dropped first.

-- ---------------------------------------------------------------------------
-- 1. Subjects and class subjects
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can manage subjects" ON public.subjects;
CREATE POLICY "Staff can manage subjects" ON public.subjects
  FOR ALL TO authenticated
  USING (
    public.is_academic_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools
      WHERE schools.id = subjects.school_id
        AND schools.org_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_academic_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools
      WHERE schools.id = subjects.school_id
        AND schools.org_id = public.get_user_org_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can manage class subjects" ON public.class_subjects;
CREATE POLICY "Staff can manage class subjects" ON public.class_subjects
  FOR ALL TO authenticated
  USING (
    public.is_academic_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.schools s ON s.id = c.school_id
      WHERE c.id = class_subjects.class_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_academic_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.schools s ON s.id = c.school_id
      WHERE c.id = class_subjects.class_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Student–guardian links
-- ---------------------------------------------------------------------------
-- The guardian's organisation is checked through a SECURITY DEFINER helper: a
-- plain subquery on guardians would run guardians' own policies, and the
-- teacher branch of those reads student_guardians — 42P17 recursion.
CREATE OR REPLACE FUNCTION public.guardian_in_my_org(_guardian_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guardians
    WHERE id = _guardian_id
      AND org_id = public.get_user_org_id(auth.uid())
  )
$$;

REVOKE ALL ON FUNCTION public.guardian_in_my_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_in_my_org(uuid) TO authenticated;

DROP POLICY IF EXISTS "Staff can manage student guardian links" ON public.student_guardians;
CREATE POLICY "Staff can manage student guardian links" ON public.student_guardians
  FOR ALL TO authenticated
  USING (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.schools sc ON sc.id = s.school_id
      WHERE s.id = student_guardians.student_id
        AND sc.org_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.schools sc ON sc.id = s.school_id
      WHERE s.id = student_guardians.student_id
        AND sc.org_id = public.get_user_org_id(auth.uid())
    )
    AND public.guardian_in_my_org(guardian_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Enrolments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can manage enrolments" ON public.enrolments;
CREATE POLICY "Staff can manage enrolments" ON public.enrolments
  FOR ALL TO authenticated
  USING (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.schools sc ON sc.id = s.school_id
      WHERE s.id = enrolments.student_id
        AND sc.org_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.schools sc ON sc.id = s.school_id
      WHERE s.id = enrolments.student_id
        AND sc.org_id = public.get_user_org_id(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Receipts, invoice items and payment allocations: the invoices exclusions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view receipts in their org" ON public.receipts;
CREATE POLICY "Staff can view receipts in their org" ON public.receipts
  FOR SELECT TO authenticated
  USING (
    NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools
      WHERE schools.id = receipts.school_id
        AND schools.org_id = public.get_user_org_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can view invoice items" ON public.invoice_items;
CREATE POLICY "Staff can view invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.schools sc ON sc.id = i.school_id
      WHERE i.id = invoice_items.invoice_id
        AND sc.org_id = public.get_user_org_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can view allocations" ON public.payment_allocations;
CREATE POLICY "Staff can view allocations" ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.payments p
      JOIN public.schools sc ON sc.id = p.school_id
      WHERE p.id = payment_allocations.payment_id
        AND sc.org_id = public.get_user_org_id(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Documents
--
-- SECURITY INVOKER on purpose: the lookups run under the caller's own
-- row-level security, so "can see the record" means exactly what the record's
-- policies say — a teacher sees the pupils they teach, only finance sees an
-- invoice. Payroll runs and staff records are readable more widely than their
-- documents should be (a payslip holder sees the run; the office sees every
-- staff row), so those two also require the role that manages them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_document_entity(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE _entity_type
    WHEN 'student' THEN EXISTS (SELECT 1 FROM public.students WHERE id = _entity_id)
    WHEN 'guardian' THEN EXISTS (SELECT 1 FROM public.guardians WHERE id = _entity_id)
    WHEN 'invoice' THEN EXISTS (SELECT 1 FROM public.invoices WHERE id = _entity_id)
    WHEN 'payroll_run' THEN
      EXISTS (SELECT 1 FROM public.payroll_runs WHERE id = _entity_id)
      AND (
        public.has_role(auth.uid(), 'proprietor'::app_role)
        OR public.has_role(auth.uid(), 'bursar'::app_role)
        OR public.has_role(auth.uid(), 'finance_officer'::app_role)
        OR public.has_role(auth.uid(), 'hr_admin'::app_role)
      )
    WHEN 'staff' THEN
      EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = _entity_id
          AND (
            s.user_id = auth.uid()
            OR public.has_role(auth.uid(), 'proprietor'::app_role)
            OR public.has_role(auth.uid(), 'group_admin'::app_role)
            OR public.has_role(auth.uid(), 'school_admin'::app_role)
            OR public.has_role(auth.uid(), 'principal'::app_role)
            OR public.has_role(auth.uid(), 'hr_admin'::app_role)
          )
      )
    ELSE public.is_academic_manager(auth.uid())
  END
$$;

-- Storage paths are <school>/documents/<entity_type>/<entity_id>/<file>. Anything
-- else in the bucket is left to the academic managers.
CREATE OR REPLACE FUNCTION public.can_see_document_path(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _entity_id uuid;
BEGIN
  IF split_part(_name, '/', 2) <> 'documents' THEN
    RETURN public.is_academic_manager(auth.uid());
  END IF;
  BEGIN
    _entity_id := split_part(_name, '/', 4)::uuid;
  EXCEPTION WHEN others THEN
    RETURN public.is_academic_manager(auth.uid());
  END;
  RETURN public.can_see_document_entity(split_part(_name, '/', 3), _entity_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_see_document_entity(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_see_document_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_document_entity(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_document_path(text) TO authenticated;

DROP POLICY IF EXISTS "Staff can manage documents" ON public.document_files;
DROP POLICY IF EXISTS "Org members can view documents" ON public.document_files;
DROP POLICY IF EXISTS "Staff can add documents" ON public.document_files;
DROP POLICY IF EXISTS "Managers can change documents" ON public.document_files;
DROP POLICY IF EXISTS "Managers can delete documents" ON public.document_files;

CREATE POLICY "Org members can view documents" ON public.document_files
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (
      (public.is_org_staff(auth.uid()) AND public.can_see_document_entity(entity_type, entity_id))
      OR (entity_type = 'student' AND (entity_id = public.my_student_id() OR public.is_my_child(entity_id)))
    )
  );

CREATE POLICY "Staff can add documents" ON public.document_files
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND public.is_org_staff(auth.uid())
    AND public.can_see_document_entity(entity_type, entity_id)
  );

CREATE POLICY "Managers can change documents" ON public.document_files
  FOR UPDATE TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND public.can_see_document_entity(entity_type, entity_id)
  )
  WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND public.can_see_document_entity(entity_type, entity_id)
  );

CREATE POLICY "Managers can delete documents" ON public.document_files
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org_id(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND public.can_see_document_entity(entity_type, entity_id)
  );

DROP POLICY IF EXISTS "Staff can read school documents" ON storage.objects;
CREATE POLICY "Staff can read school documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-documents'
    AND public.can_access_school_documents(auth.uid(), name)
    AND public.can_see_document_path(name)
  );

DROP POLICY IF EXISTS "Staff can upload school documents" ON storage.objects;
CREATE POLICY "Staff can upload school documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-documents'
    AND public.can_access_school_documents(auth.uid(), name)
    AND public.can_see_document_path(name)
  );

DROP POLICY IF EXISTS "Staff can update school documents" ON storage.objects;
CREATE POLICY "Staff can update school documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-documents'
    AND public.can_access_school_documents(auth.uid(), name)
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND public.can_see_document_path(name)
  )
  WITH CHECK (
    bucket_id = 'school-documents'
    AND public.can_access_school_documents(auth.uid(), name)
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND public.can_see_document_path(name)
  );

DROP POLICY IF EXISTS "Staff can delete school documents" ON storage.objects;
CREATE POLICY "Staff can delete school documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'school-documents'
    AND public.can_access_school_documents(auth.uid(), name)
    AND NOT public.is_teacher_only(auth.uid())
    AND NOT public.is_support_staff_only(auth.uid())
    AND public.can_see_document_path(name)
  );

-- ---------------------------------------------------------------------------
-- 6. School logos: writes limited to the caller's own organisation's schools.
-- Logos live at <school_id>/logo.<ext>; reads stay public (the bucket is).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_asset_in_my_org(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schools
    WHERE schools.id = public.storage_path_school_id(_name)
      AND schools.org_id = public.get_user_org_id(auth.uid())
  )
$$;

REVOKE ALL ON FUNCTION public.school_asset_in_my_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_asset_in_my_org(text) TO authenticated;

DROP POLICY IF EXISTS "Admins can upload school assets" ON storage.objects;
CREATE POLICY "Admins can upload school assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND public.is_academic_manager(auth.uid())
    AND public.school_asset_in_my_org(name)
  );

DROP POLICY IF EXISTS "Admins can update school assets" ON storage.objects;
CREATE POLICY "Admins can update school assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND public.is_academic_manager(auth.uid())
    AND public.school_asset_in_my_org(name)
  )
  WITH CHECK (
    bucket_id = 'school-assets'
    AND public.is_academic_manager(auth.uid())
    AND public.school_asset_in_my_org(name)
  );

DROP POLICY IF EXISTS "Admins can delete school assets" ON storage.objects;
CREATE POLICY "Admins can delete school assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND public.is_academic_manager(auth.uid())
    AND public.school_asset_in_my_org(name)
  );

-- ---------------------------------------------------------------------------
-- 7. Audit log author comes from the session, not the payload.
-- Service-role writes (edge functions acting for someone) have no auth.uid()
-- and keep the user_id they supply.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_audit_log_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_audit_log_author ON public.audit_logs;
CREATE TRIGGER stamp_audit_log_author
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_log_author();
