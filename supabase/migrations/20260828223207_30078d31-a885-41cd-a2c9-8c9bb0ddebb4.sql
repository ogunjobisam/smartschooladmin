DROP FUNCTION IF EXISTS public.create_demo_org(text, integer);

-- Builds a full sample school so a visitor can explore every module immediately.
-- Returns JSON rather than named output columns: output parameters called
-- school_id/student_id shadowed real table columns and made the body ambiguous.
CREATE FUNCTION public.create_demo_org(_label text DEFAULT 'Demo Group', _hours integer DEFAULT 4)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _org uuid; _school uuid; _year uuid; _term uuid; _prev_term uuid;
  _class uuid; _staff uuid; _guardian uuid; _student uuid;
  _exam uuid; _route uuid; _stop uuid; _cat_tuition uuid; _cat_books uuid;
  _run uuid;
  _first text[] := ARRAY['Adaeze','Chidi','Emeka','Fatima','Grace','Ibrahim','Joy','Kelechi','Lola','Musa','Ngozi','Obi','Peace','Rukayat','Samuel','Tunde','Uche','Victor','Yusuf','Zainab','Bola','Chinedu','Damilola','Esther','Femi','Halima','Ifeoma','Jide','Kemi','Lawal'];
  _last text[] := ARRAY['Okafor','Adeyemi','Bello','Chukwu','Danjuma','Eze','Fashola','Garba','Hassan','Ibe','Jibrin','Kalu','Lawson','Mohammed','Nwosu','Ogunlesi','Peters','Quadri','Rufai','Sanusi','Taiwo','Umeh','Vincent','Wale','Yakubu','Zubair','Akande','Balogun','Coker','Dike'];
BEGIN
  INSERT INTO organisation_groups (name, country, currency, is_demo, demo_expires_at)
  VALUES (COALESCE(NULLIF(_label, ''), 'Demo Group'), 'Nigeria', 'NGN', true,
          now() + make_interval(hours => GREATEST(1, COALESCE(_hours, 4))))
  RETURNING id INTO _org;

  INSERT INTO schools (org_id, name, address, phone, email, tagline, admissions_open,
                       admissions_slug, primary_color, accent_color, admissions_intro)
  VALUES (_org, 'Demo International School', '12 Awolowo Road, Ikoyi, Lagos',
          '+234 801 234 5678', 'info@demoschool.ng', 'Learning without limits', true,
          'demo-' || substr(replace(_org::text, '-', ''), 1, 12), '#0f766e', '#f59e0b',
          'We welcome applications for the current session. Complete the form below and our admissions team will be in touch.')
  RETURNING id INTO _school;

  INSERT INTO academic_years (org_id, name, start_date, end_date, is_current)
  VALUES (_org, '2025/2026', (now() - interval '8 months')::date, (now() + interval '4 months')::date, true)
  RETURNING id INTO _year;

  INSERT INTO academic_periods (academic_year_id, name, start_date, end_date, is_current)
  VALUES (_year, 'First Term', (now() - interval '8 months')::date, (now() - interval '5 months')::date, false)
  RETURNING id INTO _prev_term;

  INSERT INTO academic_periods (academic_year_id, name, start_date, end_date, is_current)
  VALUES (_year, 'Second Term', (now() - interval '2 months')::date, (now() + interval '1 month')::date, true)
  RETURNING id INTO _term;

  INSERT INTO classes (school_id, name, level_order, section) VALUES
    (_school, 'Nursery 1', 1, 'nursery'),
    (_school, 'Primary 3', 4, 'primary'),
    (_school, 'Primary 6', 7, 'primary'),
    (_school, 'JSS 1', 8, 'secondary'),
    (_school, 'JSS 2', 9, 'secondary');

  SELECT c.id INTO _class FROM classes c WHERE c.school_id = _school AND c.name = 'Primary 6';

  INSERT INTO subjects (school_id, name, short_code) VALUES
    (_school, 'Mathematics', 'MTH'),
    (_school, 'English Language', 'ENG'),
    (_school, 'Basic Science', 'BSC'),
    (_school, 'Social Studies', 'SOS'),
    (_school, 'Computer Studies', 'CMP');

  INSERT INTO class_subjects (class_id, subject_id)
  SELECT c.id, s.id FROM classes c CROSS JOIN subjects s
  WHERE c.school_id = _school AND s.school_id = _school;

  INSERT INTO students (school_id, student_id_number, first_name, last_name, date_of_birth, gender, address, status, student_type)
  SELECT _school,
         'DMS/' || to_char(now(), 'YY') || '/' || lpad(i::text, 3, '0'),
         _first[i], _last[i],
         (now() - make_interval(years => 6 + (i % 8), days => i * 11))::date,
         CASE WHEN i % 2 = 0 THEN 'female' ELSE 'male' END,
         i || ' Marina Close, Lagos',
         'active', 'day'
  FROM generate_series(1, 30) i;

  INSERT INTO guardians (org_id, first_name, last_name, phone, email, address)
  SELECT _org, 'Mr/Mrs ' || _first[i], _last[i],
         '+23480' || lpad((10000000 + i * 137)::text, 8, '0'),
         lower(_last[i]) || i || '@example.com',
         i || ' Marina Close, Lagos'
  FROM generate_series(1, 30) i;

  INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary)
  SELECT s.id, g.id, 'Parent', true
  FROM (SELECT st.id, row_number() OVER (ORDER BY st.student_id_number) rn FROM students st WHERE st.school_id = _school) s
  JOIN (SELECT gd.id, row_number() OVER (ORDER BY gd.created_at, gd.id) rn FROM guardians gd WHERE gd.org_id = _org) g
    ON g.rn = s.rn;

  INSERT INTO enrolments (student_id, class_id, academic_period_id)
  SELECT s.id, c.id, t.id
  FROM (SELECT st.id, row_number() OVER (ORDER BY st.student_id_number) rn FROM students st WHERE st.school_id = _school) s
  JOIN (SELECT cl.id, row_number() OVER (ORDER BY cl.level_order) rn FROM classes cl WHERE cl.school_id = _school) c
    ON c.rn = ((s.rn - 1) % 5) + 1
  CROSS JOIN (SELECT _term AS id UNION ALL SELECT _prev_term) t;

  INSERT INTO staff (school_id, staff_id_number, first_name, last_name, email, phone, gender, employment_status, employment_date)
  VALUES
    (_school, 'STF/001', 'Adebayo', 'Ogundele', 'principal@demoschool.ng', '+234 802 111 2222', 'male', 'active', (now() - interval '5 years')::date),
    (_school, 'STF/002', 'Chioma', 'Nwachukwu', 'bursar@demoschool.ng', '+234 802 111 3333', 'female', 'active', (now() - interval '3 years')::date),
    (_school, 'STF/003', 'Suleiman', 'Abdullahi', 'teacher1@demoschool.ng', '+234 802 111 4444', 'male', 'active', (now() - interval '2 years')::date),
    (_school, 'STF/004', 'Bisi', 'Adewale', 'teacher2@demoschool.ng', '+234 802 111 5555', 'female', 'active', (now() - interval '4 years')::date),
    (_school, 'STF/005', 'Ngozi', 'Okonkwo', 'teacher3@demoschool.ng', '+234 802 111 6666', 'female', 'active', (now() - interval '1 year')::date),
    (_school, 'STF/006', 'Hauwa', 'Sani', 'hr@demoschool.ng', '+234 802 111 7777', 'female', 'active', (now() - interval '2 years')::date);

  INSERT INTO staff_positions (staff_id, title, department, is_current)
  SELECT st.id,
         CASE st.staff_id_number WHEN 'STF/001' THEN 'Principal' WHEN 'STF/002' THEN 'Bursar'
              WHEN 'STF/006' THEN 'HR Administrator' ELSE 'Class Teacher' END,
         CASE st.staff_id_number WHEN 'STF/002' THEN 'Finance' WHEN 'STF/006' THEN 'Administration' ELSE 'Academics' END,
         true
  FROM staff st WHERE st.school_id = _school;

  SELECT st.id INTO _staff FROM staff st WHERE st.school_id = _school AND st.staff_id_number = 'STF/003';

  INSERT INTO class_teachers (class_id, staff_id, is_form_teacher) VALUES (_class, _staff, true);
  INSERT INTO class_teachers (class_id, staff_id, is_form_teacher)
  SELECT c.id, _staff, false FROM classes c WHERE c.school_id = _school AND c.name IN ('JSS 1', 'Primary 3');

  INSERT INTO payroll_profiles (staff_id, basic_salary, housing_allowance, transport_allowance, other_allowances, pension_rate, tax_rate)
  SELECT st.id,
         CASE st.staff_id_number WHEN 'STF/001' THEN 45000000 WHEN 'STF/002' THEN 32000000 ELSE 24000000 END,
         6000000, 3000000, 1500000, 8.0, 7.5
  FROM staff st WHERE st.school_id = _school;

  INSERT INTO payroll_runs (school_id, period_label, run_date, total_gross, total_deductions, total_net, staff_count, status)
  VALUES (_school, to_char(now() - interval '1 month', 'FMMonth YYYY'), (now() - interval '1 month')::date,
          207000000, 32085000, 174915000, 6, 'paid')
  RETURNING id INTO _run;

  INSERT INTO payroll_run_items (payroll_run_id, staff_id, basic, allowances, deductions, net_pay)
  SELECT _run, p.staff_id, p.basic_salary,
         p.housing_allowance + p.transport_allowance + p.other_allowances,
         ((p.basic_salary * 15.5) / 100)::bigint,
         (p.basic_salary + p.housing_allowance + p.transport_allowance + p.other_allowances - ((p.basic_salary * 15.5) / 100))::bigint
  FROM payroll_profiles p JOIN staff st ON st.id = p.staff_id WHERE st.school_id = _school;

  INSERT INTO fee_categories (org_id, name, description) VALUES (_org, 'Tuition', 'Termly tuition fee') RETURNING id INTO _cat_tuition;
  INSERT INTO fee_categories (org_id, name, description) VALUES (_org, 'Books & Materials', 'Textbooks and stationery') RETURNING id INTO _cat_books;

  INSERT INTO fee_schedules (school_id, class_id, academic_period_id, name, total_amount, is_active)
  SELECT _school, c.id, _term, c.name || ' - Second Term Fees',
         (18000000 + c.level_order * 1500000)::bigint, true
  FROM classes c WHERE c.school_id = _school;

  INSERT INTO invoices (school_id, student_id, invoice_number, academic_period_id, total_amount, amount_paid, status, due_date, issued_at)
  SELECT _school, s.id,
         'INV-' || to_char(now(), 'YYYY') || '-' || lpad(s.rn::text, 4, '0'),
         _term,
         (18000000 + (s.rn % 5) * 1500000)::bigint,
         CASE WHEN s.rn % 5 = 0 THEN 0
              WHEN s.rn % 3 = 0 THEN ((18000000 + (s.rn % 5) * 1500000) / 2)::bigint
              ELSE (18000000 + (s.rn % 5) * 1500000)::bigint END,
         CASE WHEN s.rn % 5 = 0 THEN 'overdue'::invoice_status
              WHEN s.rn % 3 = 0 THEN 'pending'::invoice_status
              ELSE 'paid'::invoice_status END,
         (now() - interval '10 days')::date,
         now() - interval '45 days'
  FROM (SELECT st.id, row_number() OVER (ORDER BY st.student_id_number) rn FROM students st WHERE st.school_id = _school) s;

  INSERT INTO invoice_items (invoice_id, fee_category_id, description, amount)
  SELECT i.id, _cat_tuition, 'Termly tuition', (i.total_amount * 0.85)::bigint FROM invoices i WHERE i.school_id = _school;
  INSERT INTO invoice_items (invoice_id, fee_category_id, description, amount)
  SELECT i.id, _cat_books, 'Books and materials', (i.total_amount * 0.15)::bigint FROM invoices i WHERE i.school_id = _school;

  INSERT INTO payments (school_id, student_id, amount, payment_method, reference_number, payment_date, notes)
  SELECT _school, i.student_id, i.amount_paid,
         CASE WHEN (row_number() OVER (ORDER BY i.invoice_number)) % 3 = 0 THEN 'bank_transfer'::payment_method
              WHEN (row_number() OVER (ORDER BY i.invoice_number)) % 3 = 1 THEN 'pos'::payment_method
              ELSE 'cash'::payment_method END,
         'PAY-' || substr(replace(i.id::text, '-', ''), 1, 8),
         now() - interval '20 days', 'Demo payment'
  FROM invoices i WHERE i.school_id = _school AND i.amount_paid > 0;

  INSERT INTO payment_allocations (payment_id, invoice_id, amount)
  SELECT p.id, i.id, p.amount
  FROM payments p JOIN invoices i ON i.student_id = p.student_id AND i.school_id = _school
  WHERE p.school_id = _school;

  INSERT INTO receipts (school_id, payment_id, receipt_number, student_id, amount)
  SELECT _school, p.id, 'RCP-' || substr(replace(p.id::text, '-', ''), 1, 8), p.student_id, p.amount
  FROM payments p WHERE p.school_id = _school;

  INSERT INTO exams (school_id, academic_period_id, class_id, name, exam_date, max_score, weight, status)
  VALUES (_school, _term, _class, 'Second Term Mid-Term Test', (now() - interval '21 days')::date, 100, 1, 'published')
  RETURNING id INTO _exam;

  INSERT INTO exam_subjects (exam_id, subject_id, max_score, weight)
  SELECT _exam, s.id, 100, 1 FROM subjects s WHERE s.school_id = _school;

  INSERT INTO exam_grade_bands (exam_id, label, min_percent, remark) VALUES
    (_exam, 'A', 70, 'Excellent'), (_exam, 'B', 60, 'Very good'),
    (_exam, 'C', 50, 'Good'), (_exam, 'D', 45, 'Pass'),
    (_exam, 'E', 40, 'Weak pass'), (_exam, 'F', 0, 'Fail');

  INSERT INTO student_scores (exam_id, student_id, subject_id, score, grade)
  SELECT _exam, e.student_id, sub.id, sc.score,
         CASE WHEN sc.score >= 70 THEN 'A' WHEN sc.score >= 60 THEN 'B' WHEN sc.score >= 50 THEN 'C'
              WHEN sc.score >= 45 THEN 'D' WHEN sc.score >= 40 THEN 'E' ELSE 'F' END
  FROM enrolments e
  JOIN subjects sub ON sub.school_id = _school
  CROSS JOIN LATERAL (SELECT (38 + ((hashtext(e.student_id::text || sub.name) % 55 + 55) % 55))::numeric AS score) sc
  WHERE e.class_id = _class AND e.academic_period_id = _term;

  INSERT INTO attendance_records (school_id, class_id, student_id, date, status)
  SELECT _school, _class, e.student_id, d::date,
         CASE WHEN (hashtext(e.student_id::text || d::text) % 12) = 0 THEN 'absent'::attendance_status
              WHEN (hashtext(e.student_id::text || d::text) % 12) = 1 THEN 'late'::attendance_status
              ELSE 'present'::attendance_status END
  FROM enrolments e
  CROSS JOIN generate_series((now() - interval '14 days')::date, (now() - interval '1 day')::date, interval '1 day') d
  WHERE e.class_id = _class AND e.academic_period_id = _term
    AND extract(dow FROM d) BETWEEN 1 AND 5;

  SELECT e.student_id INTO _student FROM enrolments e
  WHERE e.class_id = _class AND e.academic_period_id = _term LIMIT 1;

  SELECT sg.guardian_id INTO _guardian FROM student_guardians sg WHERE sg.student_id = _student LIMIT 1;

  INSERT INTO student_awards (student_id, school_id, title, description, award_date, academic_period_id)
  VALUES (_student, _school, 'Best in Mathematics', 'Top score in the mid-term test', (now() - interval '15 days')::date, _term),
         (_student, _school, 'Punctuality Award', 'Perfect attendance record', (now() - interval '40 days')::date, _prev_term);

  INSERT INTO transport_routes (school_id, name, description, driver_name, driver_phone, vehicle_registration, capacity, fee_per_term, is_active)
  VALUES (_school, 'Ikoyi - Lekki Route', 'Morning and afternoon runs', 'Sunday Eze', '+234 803 555 1212', 'LAG-482-XY', 18, 4500000, true)
  RETURNING id INTO _route;

  INSERT INTO transport_stops (route_id, name, stop_order, pickup_time, dropoff_time)
  VALUES (_route, 'Awolowo Road Junction', 1, '06:45', '15:45')
  RETURNING id INTO _stop;
  INSERT INTO transport_stops (route_id, name, stop_order, pickup_time, dropoff_time)
  VALUES (_route, 'Lekki Phase 1 Gate', 2, '07:10', '16:15');

  INSERT INTO student_transport (student_id, route_id, stop_id, academic_period_id)
  VALUES (_student, _route, _stop, _term);

  INSERT INTO school_notices (school_id, title, body, is_published, starts_on, ends_on, display_order) VALUES
    (_school, 'Second term fees are due', 'Kindly settle outstanding fees before the mid-term break.', true, (now() - interval '7 days')::date, (now() + interval '21 days')::date, 1),
    (_school, 'Admissions are open', 'We are accepting applications for the next session.', true, (now() - interval '30 days')::date, (now() + interval '60 days')::date, 2);

  INSERT INTO school_events (org_id, school_id, title, description, location, starts_at, ends_at, all_day, audience) VALUES
    (_org, _school, 'Parent-Teacher Meeting', 'Termly review of pupil progress.', 'School Hall', now() + interval '6 days', now() + interval '6 days 3 hours', false, 'parents'),
    (_org, _school, 'Inter-House Sports', 'Annual sports festival.', 'Main Field', now() + interval '20 days', now() + interval '20 days', true, 'all'),
    (_org, _school, 'Staff Briefing', 'Weekly academic staff briefing.', 'Staff Room', now() + interval '2 days', now() + interval '2 days 1 hour', false, 'staff');

  INSERT INTO applications (school_id, status, applicant_first_name, applicant_last_name, date_of_birth, gender, section, desired_class_id, guardian_name, guardian_email, guardian_phone, source, message)
  VALUES
    (_school, 'new', 'Tobi', 'Adegoke', (now() - interval '11 years')::date, 'male', 'primary', _class, 'Mrs Adegoke', 'adegoke@example.com', '+234 805 111 0001', 'website', 'Enquiring about a mid-term transfer.'),
    (_school, 'reviewing', 'Aisha', 'Bakare', (now() - interval '12 years')::date, 'female', 'secondary', (SELECT c.id FROM classes c WHERE c.school_id = _school AND c.name = 'JSS 1'), 'Mr Bakare', 'bakare@example.com', '+234 805 111 0002', 'referral', 'Relocating from Abuja.'),
    (_school, 'offered', 'Chuka', 'Nnamdi', (now() - interval '5 years')::date, 'male', 'nursery', (SELECT c.id FROM classes c WHERE c.school_id = _school AND c.name = 'Nursery 1'), 'Mrs Nnamdi', 'nnamdi@example.com', '+234 805 111 0003', 'walk-in', NULL);

  RETURN jsonb_build_object(
    'org_id', _org, 'school_id', _school, 'class_id', _class,
    'staff_id', _staff, 'guardian_id', _guardian, 'student_id', _student
  );
END $fn$;

REVOKE ALL ON FUNCTION public.create_demo_org(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_org(text, integer) TO service_role;