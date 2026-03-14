
-- ============================================================
-- SchoolFlow Core Database Schema — Phase 1
-- ============================================================

-- Enums
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'proprietor', 'group_admin', 'principal',
  'bursar', 'finance_officer', 'hr_admin', 'teacher', 'parent'
);

CREATE TYPE public.invoice_status AS ENUM ('draft', 'pending', 'paid', 'overdue', 'void');
CREATE TYPE public.payment_method AS ENUM ('cash', 'bank_transfer', 'pos', 'online', 'cheque');
CREATE TYPE public.payroll_status AS ENUM ('draft', 'pending', 'approved', 'paid', 'rejected');
CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.approval_type AS ENUM ('fee_waiver', 'salary_change', 'payroll_run', 'arrears_exception', 'discount');
CREATE TYPE public.student_status AS ENUM ('active', 'inactive', 'suspended', 'withdrawn');
CREATE TYPE public.staff_employment_status AS ENUM ('active', 'inactive', 'terminated', 'on_leave');

-- ============================================================
-- Timestamp trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- PROFILES (linked to auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ORGANISATION GROUPS
-- ============================================================
CREATE TABLE public.organisation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'NG',
  currency TEXT NOT NULL DEFAULT 'NGN',
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organisation_groups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_org_groups_updated_at BEFORE UPDATE ON public.organisation_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SCHOOLS
-- ============================================================
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- CAMPUSES
-- ============================================================
CREATE TABLE public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_campuses_updated_at BEFORE UPDATE ON public.campuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- USER ROLES (separate table per security guidelines)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  org_id UUID REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, org_id, school_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'proprietor')
);

-- ============================================================
-- ORG/SCHOOL/CAMPUS RLS (tenant isolation)
-- ============================================================
CREATE POLICY "Users can view their org" ON public.organisation_groups FOR SELECT TO authenticated USING (
  id = public.get_user_org_id(auth.uid())
);
CREATE POLICY "Proprietors can update their org" ON public.organisation_groups FOR UPDATE TO authenticated USING (
  id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'proprietor')
);
CREATE POLICY "Authenticated users can create orgs" ON public.organisation_groups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can view schools in their org" ON public.schools FOR SELECT TO authenticated USING (
  org_id = public.get_user_org_id(auth.uid())
);
CREATE POLICY "Admins can manage schools" ON public.schools FOR ALL TO authenticated USING (
  org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin'))
);

CREATE POLICY "Users can view campuses in their org" ON public.campuses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = campuses.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

-- ============================================================
-- ACADEMIC STRUCTURE
-- ============================================================
CREATE TABLE public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view academic years in their org" ON public.academic_years FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage academic years" ON public.academic_years FOR ALL TO authenticated USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'principal')));

CREATE TABLE public.academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view periods" ON public.academic_periods FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.academic_years WHERE academic_years.id = academic_periods.academic_year_id AND academic_years.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view classes in their org" ON public.classes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = classes.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

-- ============================================================
-- STUDENTS & GUARDIANS
-- ============================================================
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id_number TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  status student_status NOT NULL DEFAULT 'active',
  student_type TEXT DEFAULT 'day',
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view students in their org" ON public.students FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);
CREATE POLICY "Staff can manage students" ON public.students FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.has_role(auth.uid(), 'parent')
);

CREATE TABLE public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_guardians_updated_at BEFORE UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view guardians in their org" ON public.guardians FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.student_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_id UUID NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  relationship TEXT DEFAULT 'parent',
  is_primary BOOLEAN DEFAULT false,
  UNIQUE (student_id, guardian_id)
);

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view student-guardian links" ON public.student_guardians FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.students s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = student_guardians.student_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id),
  academic_period_id UUID NOT NULL REFERENCES public.academic_periods(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view enrolments" ON public.enrolments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.students s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = enrolments.student_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  staff_id_number TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT,
  employment_status staff_employment_status NOT NULL DEFAULT 'active',
  employment_date DATE,
  qualifications TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view staff in their org" ON public.staff FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = staff.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.staff_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view staff positions" ON public.staff_positions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.staff s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = staff_positions.staff_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.staff_bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_bank_details ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_staff_bank_updated_at BEFORE UPDATE ON public.staff_bank_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Restricted to finance roles
CREATE POLICY "Finance can view bank details" ON public.staff_bank_details FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.staff s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = staff_bank_details.staff_id AND sc.org_id = public.get_user_org_id(auth.uid()))
  AND (public.has_role(auth.uid(), 'bursar') OR public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'hr_admin'))
);

-- ============================================================
-- FEE MANAGEMENT
-- ============================================================
CREATE TABLE public.fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view fee categories" ON public.fee_categories FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id),
  academic_period_id UUID REFERENCES public.academic_periods(id),
  name TEXT NOT NULL,
  total_amount BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_schedules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_fee_schedules_updated_at BEFORE UPDATE ON public.fee_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view fee schedules" ON public.fee_schedules FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = fee_schedules.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

-- ============================================================
-- INVOICES & PAYMENTS
-- ============================================================
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  invoice_number TEXT NOT NULL,
  academic_period_id UUID REFERENCES public.academic_periods(id),
  total_amount BIGINT NOT NULL DEFAULT 0,
  amount_paid BIGINT NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view invoices in their org" ON public.invoices FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = invoices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  fee_category_id UUID REFERENCES public.fee_categories(id),
  description TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view invoice items" ON public.invoice_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i JOIN public.schools sc ON sc.id = i.school_id WHERE i.id = invoice_items.invoice_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id),
  amount BIGINT NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'cash',
  reference_number TEXT,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view payments in their org" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = payments.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view allocations" ON public.payment_allocations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.payments p JOIN public.schools sc ON sc.id = p.school_id WHERE p.id = payment_allocations.payment_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);

-- ============================================================
-- PAYROLL
-- ============================================================
CREATE TABLE public.payroll_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  basic_salary BIGINT NOT NULL DEFAULT 0,
  housing_allowance BIGINT DEFAULT 0,
  transport_allowance BIGINT DEFAULT 0,
  other_allowances BIGINT DEFAULT 0,
  pension_rate NUMERIC(5,2) DEFAULT 7.00,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_payroll_profiles_updated_at BEFORE UPDATE ON public.payroll_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Finance can view payroll profiles" ON public.payroll_profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.staff s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = payroll_profiles.staff_id AND sc.org_id = public.get_user_org_id(auth.uid()))
  AND (public.has_role(auth.uid(), 'bursar') OR public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'hr_admin'))
);

CREATE TABLE public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_gross BIGINT NOT NULL DEFAULT 0,
  total_deductions BIGINT NOT NULL DEFAULT 0,
  total_net BIGINT NOT NULL DEFAULT 0,
  staff_count INT NOT NULL DEFAULT 0,
  status payroll_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Finance can view payroll runs" ON public.payroll_runs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = payroll_runs.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (public.has_role(auth.uid(), 'bursar') OR public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'hr_admin'))
);

CREATE TABLE public.payroll_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  basic BIGINT NOT NULL DEFAULT 0,
  allowances BIGINT NOT NULL DEFAULT 0,
  deductions BIGINT NOT NULL DEFAULT 0,
  net_pay BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance can view payroll items" ON public.payroll_run_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.payroll_runs pr JOIN public.schools sc ON sc.id = pr.school_id WHERE pr.id = payroll_run_items.payroll_run_id AND sc.org_id = public.get_user_org_id(auth.uid()))
  AND (public.has_role(auth.uid(), 'bursar') OR public.has_role(auth.uid(), 'finance_officer') OR public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'hr_admin'))
);

-- ============================================================
-- APPROVALS & AUDIT
-- ============================================================
CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  type approval_type NOT NULL,
  description TEXT NOT NULL,
  amount BIGINT DEFAULT 0,
  status approval_status NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  reference_id UUID,
  reference_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view approvals in their org" ON public.approval_requests FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view audit logs in their org" ON public.audit_logs FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()));
