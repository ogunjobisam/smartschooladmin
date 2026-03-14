
-- Add INSERT policies for tables that onboarding and app need to write to

-- campuses: admins can insert
CREATE POLICY "Admins can manage campuses" ON public.campuses
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = campuses.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'group_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = campuses.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'group_admin'))
);

-- classes: admins can manage
CREATE POLICY "Admins can manage classes" ON public.classes
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = classes.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'group_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = classes.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'group_admin'))
);

-- academic_periods: admins can manage
CREATE POLICY "Admins can manage periods" ON public.academic_periods
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM academic_years WHERE academic_years.id = academic_periods.academic_year_id AND academic_years.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM academic_years WHERE academic_years.id = academic_periods.academic_year_id AND academic_years.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal'))
);

-- fee_categories: admins can manage
CREATE POLICY "Admins can manage fee categories" ON public.fee_categories
FOR ALL TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
);

-- fee_schedules: finance can manage
CREATE POLICY "Finance can manage fee schedules" ON public.fee_schedules
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = fee_schedules.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = fee_schedules.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
);

-- guardians: staff can manage
CREATE POLICY "Staff can manage guardians" ON public.guardians
FOR ALL TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND NOT has_role(auth.uid(), 'parent')
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND NOT has_role(auth.uid(), 'parent')
);

-- student_guardians: staff can manage
CREATE POLICY "Staff can manage student guardian links" ON public.student_guardians
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.id = student_guardians.student_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND NOT has_role(auth.uid(), 'parent')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.id = student_guardians.student_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND NOT has_role(auth.uid(), 'parent')
);

-- enrolments: staff can manage
CREATE POLICY "Staff can manage enrolments" ON public.enrolments
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.id = enrolments.student_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND NOT has_role(auth.uid(), 'parent')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.id = enrolments.student_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND NOT has_role(auth.uid(), 'parent')
);

-- staff: admins can manage
CREATE POLICY "Admins can manage staff" ON public.staff
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = staff.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = staff.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'hr_admin'))
);

-- staff_positions: admins can manage
CREATE POLICY "Admins can manage staff positions" ON public.staff_positions
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM staff s JOIN schools sc ON sc.id = s.school_id WHERE s.id = staff_positions.staff_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM staff s JOIN schools sc ON sc.id = s.school_id WHERE s.id = staff_positions.staff_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'hr_admin'))
);

-- staff_bank_details: finance/hr can manage
CREATE POLICY "Finance can manage bank details" ON public.staff_bank_details
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM staff s JOIN schools sc ON sc.id = s.school_id WHERE s.id = staff_bank_details.staff_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM staff s JOIN schools sc ON sc.id = s.school_id WHERE s.id = staff_bank_details.staff_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
);

-- invoices: finance can manage
CREATE POLICY "Finance can manage invoices" ON public.invoices
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = invoices.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = invoices.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
);

-- invoice_items: finance can manage
CREATE POLICY "Finance can manage invoice items" ON public.invoice_items
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM invoices i JOIN schools sc ON sc.id = i.school_id WHERE i.id = invoice_items.invoice_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM invoices i JOIN schools sc ON sc.id = i.school_id WHERE i.id = invoice_items.invoice_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
);

-- payments: finance can manage
CREATE POLICY "Finance can manage payments" ON public.payments
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = payments.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = payments.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
);

-- payment_allocations: finance can manage
CREATE POLICY "Finance can manage allocations" ON public.payment_allocations
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM payments p JOIN schools sc ON sc.id = p.school_id WHERE p.id = payment_allocations.payment_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM payments p JOIN schools sc ON sc.id = p.school_id WHERE p.id = payment_allocations.payment_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'finance_officer'))
);

-- payroll_profiles: hr/finance can manage
CREATE POLICY "HR can manage payroll profiles" ON public.payroll_profiles
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM staff s JOIN schools sc ON sc.id = s.school_id WHERE s.id = payroll_profiles.staff_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM staff s JOIN schools sc ON sc.id = s.school_id WHERE s.id = payroll_profiles.staff_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
);

-- payroll_runs: finance can manage
CREATE POLICY "Finance can manage payroll runs" ON public.payroll_runs
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = payroll_runs.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM schools WHERE schools.id = payroll_runs.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
);

-- payroll_run_items: finance can manage
CREATE POLICY "Finance can manage payroll items" ON public.payroll_run_items
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM payroll_runs pr JOIN schools sc ON sc.id = pr.school_id WHERE pr.id = payroll_run_items.payroll_run_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM payroll_runs pr JOIN schools sc ON sc.id = pr.school_id WHERE pr.id = payroll_run_items.payroll_run_id AND sc.org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'bursar') OR has_role(auth.uid(), 'hr_admin'))
);

-- approval_requests: admins can manage
CREATE POLICY "Admins can manage approvals" ON public.approval_requests
FOR ALL TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'bursar'))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'principal') OR has_role(auth.uid(), 'bursar'))
);

-- audit_logs: system can insert (any authenticated user can create logs)
CREATE POLICY "Users can insert audit logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Add trigger for handle_new_user (profile creation on signup)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
