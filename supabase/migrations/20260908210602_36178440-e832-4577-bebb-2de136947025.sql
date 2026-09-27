CREATE OR REPLACE FUNCTION public.create_demo_org_large(
  _label text DEFAULT 'Demo Group (Large School)',
  _hours integer DEFAULT 24,
  _students integer DEFAULT 400,
  _teachers integer DEFAULT 52
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _org uuid; _school uuid; _year uuid; _term uuid; _prev_term uuid;
  _run uuid; _cat_tuition uuid; _cat_books uuid; _class_count int;
  _support int := 14;
  _first text[] := ARRAY['Adaeze','Chidi','Emeka','Fatima','Grace','Ibrahim','Joy','Kelechi','Lola','Musa','Ngozi','Obi','Peace','Rukayat','Samuel','Tunde','Uche','Victor','Yusuf','Zainab','Bola','Chinedu','Damilola','Esther','Femi','Halima','Ifeoma','Jide','Kemi','Lawal'];
  _last text[] := ARRAY['Okafor','Adeyemi','Bello','Chukwu','Danjuma','Eze','Fashola','Garba','Hassan','Ibe','Jibrin','Kalu','Lawson','Mohammed','Nwosu','Ogunlesi','Peters','Quadri','Rufai','Sanusi','Taiwo','Umeh','Vincent','Wale','Yakubu','Zubair','Akande','Balogun','Coker','Dike'];
  _gfirst text[] := ARRAY['Olumide','Amina','Chukwudi','Folake','Ismail','Ngozi','Segun','Halima','Tobi','Ebere','Yakubu','Bukola','Nnamdi','Zahra','Kunle','Adaobi','Sadiq','Toyin','Chika','Bashir','Yemisi','Uche','Rasheed','Nkechi','Gbenga','Maryam','Obinna','Titi','Danladi','Efe'];
BEGIN
  _students := GREATEST(1, COALESCE(_students, 400));
  _teachers := GREATEST(1, COALESCE(_teachers, 52));

  INSERT INTO organisation_groups (name, country, currency, is_demo, demo_expires_at)
  VALUES (COALESCE(NULLIF(_label, ''), 'Demo Group (Large School)'), 'Nigeria', 'NGN', true,
          now() + make_interval(hours => GREATEST(1, COALESCE(_hours, 24))))
  RETURNING id INTO _org;

  INSERT INTO schools (org_id, name, address, phone, email, tagline, admissions_open,
                       admissions_slug, primary_color, accent_color, admissions_intro)
  VALUES (_org, 'Demo Model College', '5 Herbert Macaulay Way, Yaba, Lagos',
          '+234 803 555 0100', 'info@demomodel.ng', 'Excellence for every child', true,
          'demo-' || substr(replace(_org::text, '-', ''), 1, 12), '#1d4ed8', '#f59e0b',
          'Applications are open for the current session. Complete the form and our admissions team will contact you.')
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

  -- A full ladder, so 400 pupils sit in believable class sizes.
  INSERT INTO classes (school_id, name, level_order, section)
  SELECT _school, v.name, v.lvl, v.sec::school_section
  FROM (VALUES
    ('Nursery 1',1,'nursery'), ('Nursery 2',2,'nursery'),
    ('Primary 1',3,'primary'), ('Primary 2',4,'primary'), ('Primary 3',5,'primary'),
    ('Primary 4',6,'primary'), ('Primary 5',7,'primary'), ('Primary 6',8,'primary'),
    ('JSS 1',9,'secondary'), ('JSS 2',10,'secondary'), ('JSS 3',11,'secondary'),
    ('SSS 1',12,'secondary'), ('SSS 2',13,'secondary'), ('SSS 3',14,'secondary')
  ) AS v(name, lvl, sec);

  SELECT count(*) INTO _class_count FROM classes WHERE school_id = _school;

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
         'DMC/' || to_char(now(), 'YY') || '/' || lpad(i::text, 4, '0'),
         _first[1 + (i % 30)], _last[1 + ((i * 7) % 30)],
         (now() - make_interval(years => 4 + (i % 13), days => (i * 13) % 360))::date,
         CASE WHEN i % 2 = 0 THEN 'female' ELSE 'male' END,
         i || ' Herbert Macaulay Way, Lagos',
         CASE WHEN i % 97 = 0 THEN 'withdrawn' ELSE 'active' END,
         CASE WHEN i % 11 = 0 THEN 'boarding' ELSE 'day' END
  FROM generate_series(1, _students) i;

  -- One guardian household per pupil, with roughly every tenth pair sharing a
  -- parent so sibling links look real.
  INSERT INTO guardians (org_id, first_name, last_name, phone, email, address)
  SELECT _org, _gfirst[1 + (i % 30)], _last[1 + ((i * 7) % 30)],
         '+23480' || lpad((10000000 + i * 137)::text, 8, '0'),
         'parent' || i || '@example.com',
         i || ' Herbert Macaulay Way, Lagos'
  FROM generate_series(1, _students) i;

  INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary)
  SELECT s.id, g.id, 'Parent', true
  FROM (SELECT st.id, row_number() OVER (ORDER BY st.student_id_number) rn FROM students st WHERE st.school_id = _school) s
  JOIN (SELECT gd.id, row_number() OVER (ORDER BY gd.created_at, gd.id) rn FROM guardians gd WHERE gd.org_id = _org) g
    ON g.rn = CASE WHEN s.rn % 10 = 0 THEN s.rn - 1 ELSE s.rn END;

  INSERT INTO enrolments (student_id, class_id, academic_period_id)
  SELECT s.id, c.id, t.id
  FROM (SELECT st.id, row_number() OVER (ORDER BY st.student_id_number) rn FROM students st WHERE st.school_id = _school) s
  JOIN (SELECT cl.id, row_number() OVER (ORDER BY cl.level_order) rn FROM classes cl WHERE cl.school_id = _school) c
    ON c.rn = ((s.rn - 1) % _class_count) + 1
  CROSS JOIN (SELECT _term AS id UNION ALL SELECT _prev_term) t;

  -- Teaching staff first, then the office and support team.
  INSERT INTO staff (school_id, staff_id_number, first_name, last_name, email, phone, gender, employment_status, employment_date)
  SELECT _school, 'DMC/STF/' || lpad(i::text, 3, '0'),
         _gfirst[1 + (i % 30)], _last[1 + ((i * 11) % 30)],
         'staff' || i || '@demomodel.ng',
         '+23480' || lpad((20000000 + i * 313)::text, 8, '0'),
         CASE WHEN i % 2 = 0 THEN 'female' ELSE 'male' END,
         'active'::staff_employment_status,
         (now() - make_interval(years => 1 + (i % 8), days => (i * 17) % 300))::date
  FROM generate_series(1, _teachers + _support) i;

  INSERT INTO staff_positions (staff_id, title, department, is_current)
  SELECT st.id,
         CASE
           WHEN r.rn = _teachers + 1 THEN 'Principal'
           WHEN r.rn = _teachers + 2 THEN 'Vice Principal'
           WHEN r.rn = _teachers + 3 THEN 'Bursar'
           WHEN r.rn = _teachers + 4 THEN 'HR Administrator'
           WHEN r.rn = _teachers + 5 THEN 'School Nurse'
           WHEN r.rn = _teachers + 6 THEN 'Librarian'
           WHEN r.rn = _teachers + 7 THEN 'ICT Officer'
           WHEN r.rn = _teachers + 8 THEN 'Admissions Officer'
           WHEN r.rn > _teachers THEN 'Support Staff'
           ELSE 'Class Teacher'
         END,
         CASE
           WHEN r.rn = _teachers + 3 THEN 'Finance'
           WHEN r.rn = _teachers + 4 THEN 'Administration'
           WHEN r.rn > _teachers THEN 'Operations'
           ELSE 'Academics'
         END,
         true
  FROM (SELECT s.id, row_number() OVER (ORDER BY s.staff_id_number) rn FROM staff s WHERE s.school_id = _school) r
  JOIN staff st ON st.id = r.id;

  -- A form teacher for every class, plus spare teachers doubling up on subjects.
  INSERT INTO class_teachers (class_id, staff_id, is_form_teacher)
  SELECT c.id, t.id, true
  FROM (SELECT cl.id, row_number() OVER (ORDER BY cl.level_order) rn FROM classes cl WHERE cl.school_id = _school) c
  JOIN (SELECT s.id, row_number() OVER (ORDER BY s.staff_id_number) rn FROM staff s WHERE s.school_id = _school) t
    ON t.rn = c.rn
  WHERE c.rn <= _teachers;

  INSERT INTO class_teachers (class_id, staff_id, is_form_teacher)
  SELECT c.id, t.id, false
  FROM (SELECT s.id, row_number() OVER (ORDER BY s.staff_id_number) rn FROM staff s WHERE s.school_id = _school) t
  JOIN (SELECT cl.id, row_number() OVER (ORDER BY cl.level_order) rn FROM classes cl WHERE cl.school_id = _school) c
    ON c.rn = ((t.rn - 1) % _class_count) + 1
  WHERE t.rn > _class_count AND t.rn <= _teachers
  ON CONFLICT DO NOTHING;

  INSERT INTO payroll_profiles (staff_id, basic_salary, housing_allowance, transport_allowance, other_allowances, pension_rate, tax_rate)
  SELECT st.id,
         CASE WHEN r.rn = _teachers + 1 THEN 620000
              WHEN r.rn = _teachers + 2 THEN 480000
              WHEN r.rn = _teachers + 3 THEN 420000
              WHEN r.rn > _teachers THEN 180000
              ELSE 240000 + (r.rn % 6) * 15000 END,
         60000, 30000, 15000, 8.0, 7.5
  FROM (SELECT s.id, row_number() OVER (ORDER BY s.staff_id_number) rn FROM staff s WHERE s.school_id = _school) r
  JOIN staff st ON st.id = r.id;

  INSERT INTO payroll_runs (school_id, period_label, run_date, total_gross, total_deductions, total_net, staff_count, status)
  SELECT _school, to_char(now() - interval '1 month', 'FMMonth YYYY'), (now() - interval '1 month')::date,
         sum(p.basic_salary + p.housing_allowance + p.transport_allowance + p.other_allowances)::bigint,
         sum((p.basic_salary * 15.5) / 100)::bigint,
         sum(p.basic_salary + p.housing_allowance + p.transport_allowance + p.other_allowances - ((p.basic_salary * 15.5) / 100))::bigint,
         count(*), 'paid'
  FROM payroll_profiles p JOIN staff st ON st.id = p.staff_id WHERE st.school_id = _school
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
         (150000 + c.level_order * 12000)::bigint, true
  FROM classes c WHERE c.school_id = _school;

  INSERT INTO invoices (school_id, student_id, invoice_number, academic_period_id, total_amount, amount_paid, status, due_date, issued_at)
  SELECT _school, s.id,
         'INV-' || to_char(now(), 'YYYY') || '-' || lpad(s.rn::text, 5, '0'),
         _term,
         (150000 + (((s.rn - 1) % _class_count) + 1) * 12000)::bigint,
         CASE WHEN s.rn % 6 = 0 THEN 0
              WHEN s.rn % 4 = 0 THEN ((150000 + (((s.rn - 1) % _class_count) + 1) * 12000) / 2)::bigint
              ELSE (150000 + (((s.rn - 1) % _class_count) + 1) * 12000)::bigint END,
         CASE WHEN s.rn % 6 = 0 THEN 'overdue'::invoice_status
              WHEN s.rn % 4 = 0 THEN 'pending'::invoice_status
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

  -- Current and previous term papers for every class, with marks.
  INSERT INTO exams (school_id, academic_period_id, class_id, name, exam_date, max_score, weight, status)
  SELECT _school, _term, c.id, 'Second Term Mid-Term Test', (now() - interval '21 days')::date, 100, 1, 'published'
  FROM classes c WHERE c.school_id = _school;

  INSERT INTO exams (school_id, academic_period_id, class_id, name, exam_date, max_score, weight, status)
  SELECT _school, _prev_term, c.id, 'First Term Examination', (now() - interval '5 months 10 days')::date, 100, 1, 'published'
  FROM classes c WHERE c.school_id = _school;

  INSERT INTO exam_subjects (exam_id, subject_id, max_score, weight)
  SELECT e.id, s.id, 100, 1
  FROM exams e CROSS JOIN subjects s
  WHERE e.school_id = _school AND s.school_id = _school;

  INSERT INTO exam_grade_bands (exam_id, label, min_percent, remark)
  SELECT e.id, b.label, b.min_percent, b.remark
  FROM exams e
  CROSS JOIN (VALUES ('A', 70, 'Excellent'), ('B', 60, 'Very good'), ('C', 50, 'Good'),
                     ('D', 45, 'Pass'), ('E', 40, 'Weak pass'), ('F', 0, 'Fail'))
    AS b(label, min_percent, remark)
  WHERE e.school_id = _school;

  INSERT INTO student_scores (exam_id, student_id, subject_id, score, grade)
  SELECT e.id, en.student_id, sub.id, sc.score,
         CASE WHEN sc.score >= 70 THEN 'A' WHEN sc.score >= 60 THEN 'B' WHEN sc.score >= 50 THEN 'C'
              WHEN sc.score >= 45 THEN 'D' WHEN sc.score >= 40 THEN 'E' ELSE 'F' END
  FROM exams e
  JOIN enrolments en ON en.class_id = e.class_id AND en.academic_period_id = _term
  JOIN subjects sub ON sub.school_id = _school
  CROSS JOIN LATERAL (
    SELECT GREATEST(35, LEAST(98,
      38 + ((hashtext(en.student_id::text || sub.name || e.name) % 55 + 55) % 55)))::numeric AS score
  ) sc
  WHERE e.school_id = _school;

  INSERT INTO attendance_records (school_id, class_id, student_id, date, status)
  SELECT _school, en.class_id, en.student_id, d::date,
         CASE WHEN (hashtext(en.student_id::text || d::text) % 12) = 0 THEN 'absent'::attendance_status
              WHEN (hashtext(en.student_id::text || d::text) % 12) = 1 THEN 'late'::attendance_status
              ELSE 'present'::attendance_status END
  FROM enrolments en
  CROSS JOIN generate_series((now() - interval '21 days')::date, (now() - interval '1 day')::date, interval '1 day') d
  WHERE en.academic_period_id = _term
    AND extract(dow FROM d) BETWEEN 1 AND 5;

  -- Top of each class, published on the achievement wall.
  INSERT INTO recognitions (org_id, school_id, subject_type, student_id, category, title, description,
                            award_date, academic_period_id, class_id, status, published_at)
  SELECT _org, _school, 'student', top.student_id, 'academic',
         'Best in ' || c.name, 'Highest overall average in the Second Term mid-term test.',
         (now() - interval '12 days')::date, _term, c.id, 'published', now() - interval '12 days'
  FROM classes c
  JOIN exams e ON e.class_id = c.id AND e.academic_period_id = _term AND e.school_id = _school
  CROSS JOIN LATERAL (
    SELECT ss.student_id FROM student_scores ss WHERE ss.exam_id = e.id
    GROUP BY ss.student_id ORDER BY avg(ss.score) DESC LIMIT 1
  ) top
  WHERE c.school_id = _school;

  INSERT INTO recognitions (org_id, school_id, subject_type, staff_id, category, title, description,
                            award_date, academic_period_id, status, published_at)
  SELECT _org, _school, 'staff', st.id, 'service', 'Teacher of the Term',
         'Outstanding classroom results and pastoral care.',
         (now() - interval '10 days')::date, _term, 'published', now() - interval '10 days'
  FROM staff st WHERE st.school_id = _school ORDER BY st.staff_id_number LIMIT 1;

  INSERT INTO appointments (org_id, school_id, subject_type, student_id, position_title, portfolio,
                            academic_year_id, start_date, status, published_at)
  SELECT _org, _school, 'student', r.student_id,
         CASE r.rn WHEN 1 THEN 'Head Boy' WHEN 2 THEN 'Head Girl'
              WHEN 3 THEN 'Sports Prefect' WHEN 4 THEN 'Library Prefect'
              WHEN 5 THEN 'Health Prefect' ELSE 'Social Prefect' END,
         'Session duties', _year, (now() - interval '6 months')::date, 'published', now() - interval '6 months'
  FROM (
    SELECT en.student_id, row_number() OVER (ORDER BY en.student_id) rn
    FROM enrolments en
    JOIN classes c ON c.id = en.class_id
    WHERE c.school_id = _school AND en.academic_period_id = _term AND c.level_order >= 12
    LIMIT 6
  ) r;

  INSERT INTO school_announcements (org_id, school_id, title, body, audience, channels, status,
                                    sent_at, display_mode, starts_at, is_active, is_pinned)
  VALUES (_org, _school, 'Second Term resumption', 'School resumes on Monday. Fees are due within the first two weeks of term.',
          'all', ARRAY['in_app'], 'sent', now() - interval '5 days', 'perpetual', now() - interval '5 days', true, true);

  RETURN jsonb_build_object(
    'org_id', _org,
    'school_id', _school,
    'students', _students,
    'teachers', _teachers,
    'support_staff', _support,
    'classes', _class_count,
    'expires_at', now() + make_interval(hours => GREATEST(1, COALESCE(_hours, 24)))
  );
END
$function$;

REVOKE ALL ON FUNCTION public.create_demo_org_large(text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_demo_org_large(text, integer, integer, integer) FROM anon, authenticated;