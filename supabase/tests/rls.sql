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

SELECT 'rls behaviour tests passed' AS result;
