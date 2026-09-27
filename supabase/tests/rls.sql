-- Row-level security behaviour tests.
--
-- The migration checks prove policies *exist*. These prove they *do the right
-- thing*, by seeding real rows and querying as a real teacher and a real
-- student. Every one of these corresponds to a hole that was actually open:
--
--   * a teacher could read and write every student in the organisation, because
--     a broad FOR ALL policy sat beside the scoped one and permissive policies
--     combine with OR;
--   * a teacher could read the whole school's invoices;
--   * any signed-in member could enumerate user_roles and see who is super_admin;
--   * a student could write their own exam scores, because the write policies
--     were gated on "not a parent" and were never updated when the student role
--     arrived;
--   * reading scores raised `42P17 infinite recursion` because the exams and
--     student_scores policies subqueried each other.
--
-- Runs against the throwaway replay database only. It redefines auth.uid() so a
-- session can pretend to be a given user; never point this at a real project.

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION public.assert(condition boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS NOT TRUE THEN
    RAISE EXCEPTION 'RLS ASSERTION FAILED: %', message;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Fixture: one org, one school, one class, one student, one exam, one invoice.
-- The teacher is deliberately NOT assigned to the class.
-- ---------------------------------------------------------------------------
INSERT INTO organisation_groups (id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'Org');
INSERT INTO schools (id, org_id, name)
  VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Grace Academy');
INSERT INTO academic_years (id, org_id, name, start_date, end_date)
  VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '2026', current_date, current_date + 300);
INSERT INTO academic_periods (id, academic_year_id, name, start_date, end_date, is_current)
  VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Term 1', current_date, current_date + 100, true);
INSERT INTO classes (id, school_id, name)
  VALUES ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'JSS1');
INSERT INTO students (id, school_id, first_name, last_name)
  VALUES ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Ada', 'Obi');
INSERT INTO enrolments (student_id, class_id, academic_period_id)
  VALUES ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444');
INSERT INTO subjects (id, school_id, name)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Maths');
INSERT INTO exams (id, school_id, academic_period_id, name, max_score)
  VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Mid-term', 100);
INSERT INTO student_scores (id, exam_id, student_id, subject_id, score)
  VALUES ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 70);
INSERT INTO guardians (id, org_id, first_name, last_name)
  VALUES ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'Folake', 'Obi');
INSERT INTO invoices (id, school_id, student_id, academic_period_id, invoice_number, total_amount)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'INV-1', 1000);

INSERT INTO auth.users (id, email) VALUES
  ('daaaaaaa-0000-0000-0000-00000000000a', 'teacher@example.test'),
  ('dbbbbbbb-0000-0000-0000-00000000000b', 'student@example.test');
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('daaaaaaa-0000-0000-0000-00000000000a', 'teacher', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('dbbbbbbb-0000-0000-0000-00000000000b', 'student', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
UPDATE students SET user_id = 'dbbbbbbb-0000-0000-0000-00000000000b'
  WHERE id = '66666666-6666-6666-6666-666666666666';

-- ---------------------------------------------------------------------------
-- A teacher who is not assigned to the class
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'daaaaaaa-0000-0000-0000-00000000000a';

SELECT public.assert((SELECT count(*) FROM students) = 0,
  'a teacher assigned to no class can see students');

UPDATE students SET address = 'should not be written'
  WHERE id = '66666666-6666-6666-6666-666666666666';
SELECT public.assert((SELECT count(*) FROM public.students WHERE address = 'should not be written') = 0,
  'a teacher can edit a student record');

SELECT public.assert((SELECT count(*) FROM invoices) = 0,
  'a teacher can read school invoices');
SELECT public.assert((SELECT count(*) FROM guardians) = 0,
  'a teacher can read guardian records');
SELECT public.assert((SELECT count(*) FROM user_roles) = 1,
  'a teacher can enumerate roles beyond their own');
COMMIT;

-- The teacher UPDATE above is filtered by RLS rather than rejected, so confirm
-- from outside the session that nothing was actually written.
SELECT public.assert((SELECT count(*) FROM public.students WHERE address = 'should not be written') = 0,
  'a teacher edit reached the students table');

-- ---------------------------------------------------------------------------
-- A student
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'dbbbbbbb-0000-0000-0000-00000000000b';

-- Reading these at all used to raise 42P17: the exams and student_scores
-- policies subqueried each other.
SELECT public.assert((SELECT count(*) FROM student_scores) = 1,
  'a student cannot read their own scores');
SELECT public.assert((SELECT count(*) FROM exams) = 1,
  'a student cannot read the exam behind their own score');

UPDATE student_scores SET score = 100
  WHERE id = '88888888-8888-8888-8888-888888888888';

SELECT public.assert((SELECT count(*) FROM guardians) = 0,
  'a student can read guardian records');
SELECT public.assert((SELECT count(*) FROM user_roles) = 1,
  'a student can enumerate roles beyond their own');
COMMIT;

SELECT public.assert((SELECT score FROM public.student_scores WHERE id = '88888888-8888-8888-8888-888888888888') = 70,
  'a student changed their own exam score');

-- ---------------------------------------------------------------------------
-- get_my_role must be deterministic
-- ---------------------------------------------------------------------------
-- A second role row with no organisation used to be able to win the LIMIT 1,
-- which made AuthContext treat the user as not onboarded and sent every fresh
-- sign-in to the org-creation wizard.
INSERT INTO user_roles (user_id, role, org_id, school_id)
  VALUES ('daaaaaaa-0000-0000-0000-00000000000a', 'teacher', NULL, NULL);

DO $$
DECLARE resolved uuid;
BEGIN
  PERFORM set_config('test.uid', 'daaaaaaa-0000-0000-0000-00000000000a', true);
  FOR i IN 1..5 LOOP
    SELECT org_id INTO resolved FROM public.get_my_role();
    PERFORM public.assert(resolved IS NOT NULL,
      'get_my_role returned a row with no organisation, which sends the user to onboarding');
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- The app and RLS must never disagree about which organisation you are in
-- ---------------------------------------------------------------------------
-- get_my_role feeds AuthContext; get_user_org_id and get_user_school_id are
-- what 212 policy references evaluate. They used to be three separate answers,
-- two of them a LIMIT 1 with no ORDER BY. For anyone holding two role rows
-- that returns whichever row Postgres reaches first, which changes after an
-- ordinary UPDATE — so the app would filter by one organisation while RLS
-- evaluated another, and every read came back empty while every write matched
-- no rows and reported success.
INSERT INTO organisation_groups (id, name, country, currency)
  VALUES ('cccccccc-0000-0000-0000-00000000000c', 'Second Org', 'NG', 'NGN');
INSERT INTO schools (id, org_id, name)
  VALUES ('cccccccc-0000-0000-0000-00000000000d', 'cccccccc-0000-0000-0000-00000000000c', 'Second School');
INSERT INTO user_roles (user_id, role, org_id, school_id)
  VALUES ('daaaaaaa-0000-0000-0000-00000000000a', 'proprietor',
          'cccccccc-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000d');

DO $$
DECLARE app_org uuid; rls_org uuid; app_school uuid; rls_school uuid;
BEGIN
  PERFORM set_config('test.uid', 'daaaaaaa-0000-0000-0000-00000000000a', true);
  FOR i IN 1..6 LOOP
    -- Rewriting a role row moves it in the heap, which is exactly what used to
    -- flip the answer underneath the app.
    UPDATE user_roles SET role = role
      WHERE user_id = 'daaaaaaa-0000-0000-0000-00000000000a'
        AND (i % 2 = 0 OR org_id IS NOT NULL);

    SELECT org_id, school_id INTO app_org, app_school FROM public.get_my_role();
    rls_org := public.get_user_org_id('daaaaaaa-0000-0000-0000-00000000000a');
    rls_school := public.get_user_school_id('daaaaaaa-0000-0000-0000-00000000000a');

    PERFORM public.assert(app_org IS NOT DISTINCT FROM rls_org,
      'AuthContext and RLS resolved different organisations for the same user');
    PERFORM public.assert(app_school IS NOT DISTINCT FROM rls_school,
      'AuthContext and RLS resolved different schools for the same user');
    PERFORM public.assert(app_org IS NOT NULL,
      'org resolution returned a row with no organisation');
  END LOOP;
END $$;

-- The most recently granted role wins, so someone who has just created a
-- school lands in it rather than in an older, empty one.
DO $$
DECLARE resolved uuid;
BEGIN
  PERFORM set_config('test.uid', 'daaaaaaa-0000-0000-0000-00000000000a', true);
  SELECT school_id INTO resolved FROM public.get_my_role();
  PERFORM public.assert(resolved = 'cccccccc-0000-0000-0000-00000000000d',
    'the most recently granted role did not win, so a new school is unreachable');
END $$;

-- ---------------------------------------------------------------------------
-- Seniority must beat recency in role resolution
-- ---------------------------------------------------------------------------
-- The ranked and unranked definitions of primary_user_role agree on most
-- accounts, which is exactly why the divergence between replay order and
-- wall-clock order went unnoticed. They disagree on one shape: a senior role
-- granted BEFORE a junior one in the same organisation. Ranked resolves to the
-- senior role; unranked resolves to the newest row — so a proprietor later
-- given a teacher role would be gated as a teacher everywhere.
INSERT INTO auth.users (id, email)
  VALUES ('eaaaaaaa-0000-0000-0000-00000000000e', 'ranked@example.test');
INSERT INTO user_roles (user_id, role, org_id, school_id, created_at) VALUES
  ('eaaaaaaa-0000-0000-0000-00000000000e', 'proprietor',
   'cccccccc-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000d',
   now() - interval '2 days'),
  ('eaaaaaaa-0000-0000-0000-00000000000e', 'teacher',
   'cccccccc-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000d',
   now());

DO $$
DECLARE resolved app_role;
BEGIN
  SELECT role INTO resolved
    FROM public.primary_user_role('eaaaaaaa-0000-0000-0000-00000000000e');
  PERFORM public.assert(resolved = 'proprietor',
    'a senior role granted earlier lost to a junior role granted later — '
    'primary_user_role is not ranking by seniority, so replay has diverged '
    'from the live definition');
END $$;

-- ---------------------------------------------------------------------------
-- A staff member may read their own pay, and nobody else's
-- ---------------------------------------------------------------------------
-- Payroll was role-gated with no notion of "this row is about me", so a teacher
-- could not see their own payslip. Opening that up is the one change here that
-- could leak money data, so each way it could go wrong is asserted separately.
INSERT INTO staff (id, school_id, user_id, first_name, last_name)
  VALUES ('f1111111-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
          'daaaaaaa-0000-0000-0000-00000000000a', 'Tayo', 'Adeyemi');
-- A colleague, with no login of their own attached.
INSERT INTO staff (id, school_id, first_name, last_name)
  VALUES ('f1111111-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
          'Chidi', 'Nwosu');

INSERT INTO payroll_runs (id, school_id, period_label, status) VALUES
  ('f2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'March 2026', 'approved'),
  ('f2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'April 2026', 'draft');

INSERT INTO payroll_run_items (id, payroll_run_id, staff_id, basic, allowances, pension, tax, deductions, net_pay) VALUES
  -- theirs, on an approved run: the one row they should see
  ('f3333333-0000-0000-0000-000000000001', 'f2222222-0000-0000-0000-000000000001',
   'f1111111-0000-0000-0000-000000000001', 180000, 45000, 14400, 22500, 36900, 188100),
  -- theirs, but the run is still a draft
  ('f3333333-0000-0000-0000-000000000002', 'f2222222-0000-0000-0000-000000000002',
   'f1111111-0000-0000-0000-000000000001', 180000, 45000, 14400, 22500, 36900, 188100),
  -- a colleague's, on the same approved run
  ('f3333333-0000-0000-0000-000000000003', 'f2222222-0000-0000-0000-000000000001',
   'f1111111-0000-0000-0000-000000000002', 300000, 60000, 24000, 36000, 60000, 300000);

INSERT INTO payroll_profiles (staff_id, basic_salary, pension_rate, tax_rate)
  VALUES ('f1111111-0000-0000-0000-000000000001', 180000, 8, 10);
INSERT INTO staff_bank_details (staff_id, bank_name, account_number, account_name) VALUES
  ('f1111111-0000-0000-0000-000000000001', 'First Bank', '0123456789', 'Tayo Adeyemi'),
  ('f1111111-0000-0000-0000-000000000002', 'Zenith', '9876543210', 'Chidi Nwosu');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'daaaaaaa-0000-0000-0000-00000000000a';

SELECT public.assert((SELECT count(*) FROM payroll_run_items) = 1,
  'a teacher sees a payroll item that is not their own, or on an unapproved run');
SELECT public.assert(
  (SELECT count(*) FROM payroll_run_items
   WHERE id = 'f3333333-0000-0000-0000-000000000001') = 1,
  'a teacher cannot read their own payslip from an approved run');
SELECT public.assert(
  (SELECT count(*) FROM payroll_run_items
   WHERE id = 'f3333333-0000-0000-0000-000000000002') = 0,
  'a teacher can read their own pay from a DRAFT run, before it is approved');
SELECT public.assert(
  (SELECT count(*) FROM payroll_run_items
   WHERE id = 'f3333333-0000-0000-0000-000000000003') = 0,
  'a teacher can read a colleague''s payslip');

-- Only the run they were actually paid in, and only once approved.
SELECT public.assert((SELECT count(*) FROM payroll_runs) = 1,
  'a teacher sees a payroll run they were not in, or one still in draft');

-- Their own account number, and no one else's.
SELECT public.assert((SELECT count(*) FROM staff_bank_details) = 1,
  'a teacher can read bank details other than their own');

-- Salary and rates stay shut: the payslip reads the run item, so self-service
-- never needed payroll_profiles and it was deliberately not opened.
SELECT public.assert((SELECT count(*) FROM payroll_profiles) = 0,
  'a teacher can read salary profiles, which self-service never needed');

-- Read-only. A permissive SELECT policy must not become a way to edit pay.
UPDATE payroll_run_items SET net_pay = 999999
  WHERE id = 'f3333333-0000-0000-0000-000000000001';
COMMIT;

SELECT public.assert(
  (SELECT net_pay FROM public.payroll_run_items
   WHERE id = 'f3333333-0000-0000-0000-000000000001') = 188100,
  'a staff member rewrote their own net pay');

-- The policy must close, not open, when the link is missing. Anyone added
-- without an invite has staff.user_id NULL, and NULL = NULL is not true.
UPDATE staff SET user_id = NULL WHERE id = 'f1111111-0000-0000-0000-000000000001';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'daaaaaaa-0000-0000-0000-00000000000a';
SELECT public.assert((SELECT count(*) FROM payroll_run_items) = 0,
  'an unlinked staff record still matched a payslip — the policy opens on NULL');
COMMIT;
UPDATE staff SET user_id = 'daaaaaaa-0000-0000-0000-00000000000a'
  WHERE id = 'f1111111-0000-0000-0000-000000000001';

-- Someone with no staff record at all must see nothing rather than everything.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'dbbbbbbb-0000-0000-0000-00000000000b';
SELECT public.assert((SELECT count(*) FROM payroll_run_items) = 0,
  'a student can read payroll items');
SELECT public.assert((SELECT count(*) FROM staff_bank_details) = 0,
  'a student can read staff bank details');
COMMIT;

-- ---------------------------------------------------------------------------
-- is_teacher_only() must mean what it says, and tolerate a NULL school
-- ---------------------------------------------------------------------------
-- 20260908162058 started gating schools, exams, subjects, class_subjects and
-- exam_subjects on `NOT is_teacher_only(auth.uid()) OR <col> = get_user_school_id(...)`.
-- Two ways that locked people out of the whole app rather than one school:
--
--   * is_teacher_only() is `EXISTS (… role = 'teacher')` — it has no "only" in
--     it. An admin who also teaches a class, which invite-user explicitly
--     permits, read as a teacher;
--   * `id = NULL` is NULL, not true, so anyone whose winning role row carries a
--     NULL school_id saw ZERO schools. invite-user writes `school_id || null`
--     for an org-level invite, and primary_user_role() ranks by seniority
--     first, so a senior row's NULL beats a teacher row's real school.
--
-- AuthContext loads the school list from `schools`, so an empty list is a blank
-- app with no error anywhere — the failure nobody reports.

-- A second school, so "their org's schools" is a number larger than one.
INSERT INTO schools (id, org_id, name)
  VALUES ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Grace Annexe');
INSERT INTO classes (id, school_id, name)
  VALUES ('55555555-5555-5555-5555-555555555556', '22222222-2222-2222-2222-222222222223', 'JSS1 Annexe');
INSERT INTO subjects (id, school_id, name)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc', '22222222-2222-2222-2222-222222222223', 'English');
INSERT INTO exams (id, school_id, academic_period_id, name, max_score)
  VALUES ('77777777-7777-7777-7777-777777777778', '22222222-2222-2222-2222-222222222223',
          '44444444-4444-4444-4444-444444444444', 'Annexe mid-term', 100);

INSERT INTO auth.users (id, email) VALUES
  ('dccccccc-0000-0000-0000-00000000000c', 'admin.who.teaches@example.test'),
  ('dddddddd-0000-0000-0000-00000000000d', 'org.level.teacher@example.test'),
  ('deeeeeee-0000-0000-0000-00000000000e', 'school.scoped.teacher@example.test'),
  ('dfffffff-0000-0000-0000-00000000000f', 'teacher.at.two.schools@example.test');

-- An administrator who also teaches. The school_admin row carries no school —
-- an org-level invite — which is exactly the combination that went blank.
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('dccccccc-0000-0000-0000-00000000000c', 'school_admin', '11111111-1111-1111-1111-111111111111', NULL),
  ('dccccccc-0000-0000-0000-00000000000c', 'teacher', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
-- A plain teacher invited at org level, with no school of their own.
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('dddddddd-0000-0000-0000-00000000000d', 'teacher', '11111111-1111-1111-1111-111111111111', NULL);
-- A plain teacher who does have a school. Deliberately NOT the teacher from the
-- top of this file: a later section gives that one a proprietor role in a second
-- organisation, so reusing it here would quietly test a proprietor instead.
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('deeeeeee-0000-0000-0000-00000000000e', 'teacher', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
-- Employed across the group rather than at one school, so no single school_id —
-- which is the only way the staff_id clause below is ever reached. A teacher
-- pinned to one school cannot see the other school's classes anyway, so a test
-- built on one would go green for the wrong reason.
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('dfffffff-0000-0000-0000-00000000000f', 'teacher', '11111111-1111-1111-1111-111111111111', NULL);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'dccccccc-0000-0000-0000-00000000000c';
SELECT public.assert((SELECT count(*) FROM schools) = 2,
  'an admin who also teaches cannot see their org''s schools');
SELECT public.assert((SELECT count(*) FROM exams) = 2,
  'an admin who also teaches cannot see their org''s exams');
SELECT public.assert((SELECT count(*) FROM subjects) = 2,
  'an admin who also teaches cannot see their org''s subjects');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'dddddddd-0000-0000-0000-00000000000d';
SELECT public.assert((SELECT count(*) FROM schools) = 2,
  'a teacher with no school of their own sees nothing rather than their org');
COMMIT;

-- The restriction itself must survive: a teacher scoped to one school still
-- sees only that one. Fixing the lockout must not open the gate.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'deeeeeee-0000-0000-0000-00000000000e';
SELECT public.assert(public.is_teacher_only(auth.uid()),
  'the fixture user is not teacher-only, so this proves nothing');
SELECT public.assert((SELECT count(*) FROM schools) = 1,
  'a school-scoped teacher can see other schools in the org');

-- And it survives transitively, which is the part worth pinning down. Each of
-- these policies tests `EXISTS (SELECT 1 FROM schools WHERE … org_id = …)`, and
-- that subquery runs under the caller's own row-level security — so a teacher
-- who cannot see the second school cannot see its exams or subjects either,
-- even though the FOR ALL "Staff can manage …" policies beside them are scoped
-- to the org rather than the school. Read as a policy listing it looks like the
-- restriction is defeated by a broader policy; it is not, and this says so.
SELECT public.assert((SELECT count(*) FROM exams) = 1,
  'a school-scoped teacher can see another school''s exams');
SELECT public.assert((SELECT count(*) FROM subjects) = 1,
  'a school-scoped teacher can see another school''s subjects');
COMMIT;

-- ---------------------------------------------------------------------------
-- A teacher employed at two schools in one group sees both sets of classes
-- ---------------------------------------------------------------------------
-- 20260908162058 gated class_teachers on `staff_id = my_staff_id()`, whose body
-- is `SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1` — a LIMIT 1 with
-- no ORDER BY, so physical heap order. 20260902090000 had already added
-- my_staff_ids() precisely because someone can hold two staff rows in a group.
-- The singular helper returns an arbitrary one, so half this teacher's classes
-- vanish, and which half changes after any UPDATE to staff.
INSERT INTO staff (id, school_id, user_id, first_name, last_name) VALUES
  ('f1111111-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   'dfffffff-0000-0000-0000-00000000000f', 'Ngozi', 'Eze'),
  ('f1111111-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222223',
   'dfffffff-0000-0000-0000-00000000000f', 'Ngozi', 'Eze');
INSERT INTO class_teachers (class_id, staff_id) VALUES
  ('55555555-5555-5555-5555-555555555555', 'f1111111-0000-0000-0000-000000000004'),
  ('55555555-5555-5555-5555-555555555556', 'f1111111-0000-0000-0000-000000000005');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'dfffffff-0000-0000-0000-00000000000f';
-- Without this the assertion below passes for the wrong reason: a user who is
-- not teacher-only skips the staff_id clause entirely.
SELECT public.assert(public.is_teacher_only(auth.uid()),
  'the fixture user is not teacher-only, so the staff_id clause is never reached');
SELECT public.assert((SELECT count(*) FROM classes) = 2,
  'the fixture user cannot see both classes, so this tests school scoping, not staff_id');
SELECT public.assert((SELECT count(*) FROM class_teachers) = 2,
  'a teacher employed at two schools loses one school''s class assignments');
COMMIT;


-- ---------------------------------------------------------------------------
-- Support staff see the school's people, and none of its money or marks
-- ---------------------------------------------------------------------------
-- The staff read policies on invoices, payments, fee schedules, exams and scores
-- are denylists: "not a parent or pupil, and not teacher-only, therefore
-- allowed". That shape admits every role the enum ever gains, silently, the
-- moment it exists — so support_staff arrived able to read the whole
-- organisation's cash book and mark book. The nav map hides those pages, but
-- src/lib/access.ts says in its own header that it is not the boundary.
--
-- Two users, because "only" is the whole point of is_support_staff_only():
-- someone who is *also* a bursar must keep the bursar's reach.
-- An exam_subjects row, so the support-staff assertion below measures row-level
-- security rather than an empty table. Without it the count is 0 either way and
-- the assertion proves nothing.
INSERT INTO exam_subjects (exam_id, subject_id, max_score, weight) VALUES
  ('77777777-7777-7777-7777-777777777777', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 1);
INSERT INTO auth.users (id, email) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'office@example.test'),
  ('e0000000-0000-0000-0000-00000000000b', 'office-and-bursar@example.test');
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'support_staff',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('e0000000-0000-0000-0000-00000000000b', 'support_staff',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('e0000000-0000-0000-0000-00000000000b', 'bursar',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'e0000000-0000-0000-0000-00000000000a';

-- Without this the assertions below pass for the wrong reason: a user the helper
-- does not consider support-staff-only never reaches the new clause at all.
SELECT public.assert(public.is_support_staff_only(auth.uid()),
  'the fixture user is not support-staff-only, so the new clause is never reached');

-- The office does need the people and the day.
SELECT public.assert((SELECT count(*) FROM students) = 1,
  'support staff cannot see the school''s students');
SELECT public.assert((SELECT count(*) FROM staff) >= 1,
  'support staff cannot see the school''s staff directory');
SELECT public.assert((SELECT count(*) FROM classes) >= 1,
  'support staff cannot see the school''s classes');

-- And none of the money.
SELECT public.assert((SELECT count(*) FROM invoices) = 0,
  'support staff can read the school''s invoices');
SELECT public.assert((SELECT count(*) FROM payments) = 0,
  'support staff can read the school''s payments');
SELECT public.assert((SELECT count(*) FROM fee_schedules) = 0,
  'support staff can read the school''s fee schedules');

-- Nor the marks. A teacher-only user is narrowed to their own pupils here, so
-- leaving support staff in the denylist would have given them more than a
-- teacher gets, org-wide.
SELECT public.assert((SELECT count(*) FROM exams) = 0,
  'support staff can read the school''s exams');
SELECT public.assert((SELECT count(*) FROM student_scores) = 0,
  'support staff can read pupils'' scores');
-- exam_subjects has its own FOR ALL policy beside the SELECT one, and it was
-- missed the first time. Permissive policies combine with OR, so one untightened
-- policy grants through everything the other denies — asserting only exams and
-- scores left that hole open and invisible.
SELECT public.assert((SELECT count(*) FROM exam_subjects) = 0,
  'support staff can read the exam subject list');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'e0000000-0000-0000-0000-00000000000b';
-- Holding a more senior role must win: the helper is "most senior role held",
-- not "holds this role", which is the bug is_teacher_only() shipped with.
SELECT public.assert(NOT public.is_support_staff_only(auth.uid()),
  'a support_staff who is also a bursar is being treated as support-staff-only');
SELECT public.assert((SELECT count(*) FROM invoices) = 1,
  'a support_staff who is also a bursar lost the bursar''s sight of invoices');
-- The other half of the exam_subjects assertion: somebody must be able to see
-- the row, or "support staff see none" is just an empty table.
SELECT public.assert((SELECT count(*) FROM exam_subjects) = 1,
  'nobody can see the exam_subjects fixture, so the support-staff assertion is vacuous');
COMMIT;

-- ---------------------------------------------------------------------------
-- A subject teacher marks their own subject, and nobody else's
-- ---------------------------------------------------------------------------
-- Mark entry used to be scoped to the class: anyone in class_teachers could
-- write every subject's score for every pupil in it. subject_teachers narrows
-- that. Once a subject has a teacher in a class, only that teacher writes its
-- marks there; a subject nobody has been given stays with the class's teachers,
-- so a school that has not assigned anything yet keeps working as before.
--
-- Fresh users, because two of the teachers above are promoted or spread across
-- schools later in this file, and either would measure the wrong thing.
INSERT INTO subjects (id, school_id, name)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', '22222222-2222-2222-2222-222222222222', 'English');
INSERT INTO student_scores (id, exam_id, student_id, subject_id, score)
  VALUES ('88888888-8888-8888-8888-888888888889', '77777777-7777-7777-7777-777777777777',
          '66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', 60);
INSERT INTO exams (id, school_id, academic_period_id, name, max_score)
  VALUES ('77777777-7777-7777-7777-777777777779', '22222222-2222-2222-2222-222222222222',
          '44444444-4444-4444-4444-444444444444', 'End of term', 100);

INSERT INTO auth.users (id, email) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'maths.teacher@example.test'),
  ('d1000000-0000-0000-0000-000000000002', 'form.teacher@example.test');
INSERT INTO user_roles (user_id, role, org_id, school_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'teacher', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('d1000000-0000-0000-0000-000000000002', 'teacher', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
INSERT INTO staff (id, school_id, user_id, first_name, last_name) VALUES
  ('f1111111-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222',
   'd1000000-0000-0000-0000-000000000001', 'Bola', 'Maths'),
  ('f1111111-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222',
   'd1000000-0000-0000-0000-000000000002', 'Funmi', 'Form');
-- The form teacher holds the class; the maths teacher holds only Maths in it,
-- with no class_teachers row, which is how a subject specialist is set up.
INSERT INTO class_teachers (class_id, staff_id, is_form_teacher)
  VALUES ('55555555-5555-5555-5555-555555555555', 'f1111111-0000-0000-0000-000000000007', true);
INSERT INTO subject_teachers (class_id, subject_id, staff_id)
  VALUES ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f1111111-0000-0000-0000-000000000006');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'd1000000-0000-0000-0000-000000000001';
SELECT public.assert(public.is_teacher_only(auth.uid()),
  'the maths teacher fixture is not teacher-only, so the narrowed clause is never reached');
-- Teaching one subject in a class is teaching the class: they need the register.
SELECT public.assert((SELECT count(*) FROM students) = 1,
  'a subject teacher cannot see the pupils of a class they teach a subject in');
SELECT public.assert((SELECT count(*) FROM classes WHERE id = '55555555-5555-5555-5555-555555555555') = 1,
  'a subject teacher cannot see a class they teach a subject in');
UPDATE student_scores SET score = 75 WHERE id = '88888888-8888-8888-8888-888888888888';
UPDATE student_scores SET score = 99 WHERE id = '88888888-8888-8888-8888-888888888889';
INSERT INTO student_scores (exam_id, student_id, subject_id, score)
  VALUES ('77777777-7777-7777-7777-777777777779', '66666666-6666-6666-6666-666666666666',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 81);
SELECT public.assert(
  public.markable_subjects('55555555-5555-5555-5555-555555555555',
    ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd']::uuid[])
  = ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[],
  'markable_subjects does not give the maths teacher exactly Maths, so the screen and RLS disagree');
COMMIT;

SELECT public.assert((SELECT score FROM public.student_scores WHERE id = '88888888-8888-8888-8888-888888888888') = 75,
  'a subject teacher cannot correct a mark in their own subject');
SELECT public.assert((SELECT score FROM public.student_scores WHERE id = '88888888-8888-8888-8888-888888888889') = 60,
  'a subject teacher changed a mark in a subject they do not teach');
SELECT public.assert(
  (SELECT count(*) FROM public.student_scores
   WHERE exam_id = '77777777-7777-7777-7777-777777777779' AND score = 81) = 1,
  'a subject teacher cannot enter a new mark in their own subject');

-- A new mark in someone else's subject is refused outright, not filtered.
DO $$
BEGIN
  PERFORM set_config('test.uid', 'd1000000-0000-0000-0000-000000000001', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO student_scores (exam_id, student_id, subject_id, score)
      VALUES ('77777777-7777-7777-7777-777777777779', '66666666-6666-6666-6666-666666666666',
              'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd', 12);
    RAISE EXCEPTION 'RLS ASSERTION FAILED: a subject teacher entered a new mark in a subject they do not teach';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'd1000000-0000-0000-0000-000000000002';
SELECT public.assert(public.is_teacher_only(auth.uid()),
  'the form teacher fixture is not teacher-only, so the narrowed clause is never reached');
-- Maths has its own teacher now, so the form teacher loses it...
UPDATE student_scores SET score = 10 WHERE id = '88888888-8888-8888-8888-888888888888';
-- ...but keeps English, which nobody has been given.
UPDATE student_scores SET score = 64 WHERE id = '88888888-8888-8888-8888-888888888889';
-- Compiling the report card needs every subject, so reading stays class-wide.
SELECT public.assert((SELECT count(*) FROM student_scores WHERE student_id = '66666666-6666-6666-6666-666666666666') = 3,
  'a form teacher cannot read every subject''s marks for their own class');
SELECT public.assert(
  public.markable_subjects('55555555-5555-5555-5555-555555555555',
    ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd']::uuid[])
  = ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd']::uuid[],
  'markable_subjects does not give the form teacher exactly the unassigned subject');
-- A teacher must not be able to hand themselves a subject.
UPDATE subject_teachers SET staff_id = 'f1111111-0000-0000-0000-000000000007';
COMMIT;

SELECT public.assert((SELECT score FROM public.student_scores WHERE id = '88888888-8888-8888-8888-888888888888') = 75,
  'a form teacher overwrote a mark in a subject that has its own teacher');
SELECT public.assert((SELECT score FROM public.student_scores WHERE id = '88888888-8888-8888-8888-888888888889') = 64,
  'a form teacher lost a subject nobody has been assigned — schools without assignments would stop working');
SELECT public.assert(
  (SELECT staff_id FROM public.subject_teachers
   WHERE class_id = '55555555-5555-5555-5555-555555555555') = 'f1111111-0000-0000-0000-000000000006',
  'a teacher reassigned a subject to themselves');

DO $$
BEGIN
  PERFORM set_config('test.uid', 'd1000000-0000-0000-0000-000000000002', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO subject_teachers (class_id, subject_id, staff_id)
      VALUES ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd',
              'f1111111-0000-0000-0000-000000000007');
    RAISE EXCEPTION 'RLS ASSERTION FAILED: a teacher assigned themselves a subject';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;

-- Someone above teacher still writes every subject: the narrowing is for
-- teachers only. The admin-who-teaches from earlier holds a teacher row too.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL test.uid = 'dccccccc-0000-0000-0000-00000000000c';
SELECT public.assert(NOT public.is_teacher_only(auth.uid()),
  'the admin fixture is teacher-only, so this proves nothing');
UPDATE student_scores SET score = 76 WHERE id = '88888888-8888-8888-8888-888888888888';
COMMIT;
SELECT public.assert((SELECT score FROM public.student_scores WHERE id = '88888888-8888-8888-8888-888888888888') = 76,
  'an administrator lost the ability to correct a subject teacher''s mark');

-- ---------------------------------------------------------------------------
-- Arms are a field, not part of the name
-- ---------------------------------------------------------------------------
-- Ranking by class across arms groups on level_name; ranking by arm groups on
-- the class row. Anything that inserts a class without saying which is which —
-- onboarding, the demo seeder, an old screen — gets both split from the name.
SELECT public.assert((SELECT level_name FROM public.split_class_arm('JSS1A')) = 'JSS1'
                 AND (SELECT arm FROM public.split_class_arm('JSS1A')) = 'A',
  'JSS1A did not split into JSS1 / A');
SELECT public.assert((SELECT level_name FROM public.split_class_arm('Primary 4 b')) = 'Primary 4'
                 AND (SELECT arm FROM public.split_class_arm('Primary 4 b')) = 'B',
  'Primary 4 b did not split into Primary 4 / B');
SELECT public.assert((SELECT level_name FROM public.split_class_arm('SS2-C')) = 'SS2'
                 AND (SELECT arm FROM public.split_class_arm('SS2-C')) = 'C',
  'SS2-C did not split into SS2 / C');
SELECT public.assert((SELECT level_name FROM public.split_class_arm('Nursery 1')) = 'Nursery 1'
                 AND (SELECT arm FROM public.split_class_arm('Nursery 1')) IS NULL,
  'a class with no arm was given one');
SELECT public.assert((SELECT arm FROM public.split_class_arm('JSS1 Annexe')) IS NULL,
  'a word after the level was mistaken for an arm');

INSERT INTO classes (id, school_id, name) VALUES
  ('55555555-5555-5555-5555-555555555557', '22222222-2222-2222-2222-222222222222', 'JSS2B');
INSERT INTO classes (id, school_id, name, level_name, arm) VALUES
  ('55555555-5555-5555-5555-555555555558', '22222222-2222-2222-2222-222222222222', 'JSS2 Gold', 'JSS2', 'Gold');
SELECT public.assert(
  (SELECT level_name = 'JSS2' AND arm = 'B' FROM public.classes WHERE id = '55555555-5555-5555-5555-555555555557'),
  'a class inserted by name alone did not get its level and arm filled in');
SELECT public.assert(
  (SELECT level_name = 'JSS2' AND arm = 'Gold' FROM public.classes WHERE id = '55555555-5555-5555-5555-555555555558'),
  'an explicit level and arm were overwritten by the name split');
SELECT public.assert(
  (SELECT level_name FROM public.classes WHERE id = '55555555-5555-5555-5555-555555555555') = 'JSS1',
  'a class with no arm has no level, so it drops out of class-wide ranking');

SELECT 'rls behaviour tests passed' AS result;
