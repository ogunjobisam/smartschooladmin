CREATE OR REPLACE FUNCTION public.delete_demo_org(_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _schools uuid[];
  _students uuid[];
  _staffs uuid[];
  _users uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organisation_groups WHERE id = _org_id AND is_demo) THEN
    RAISE EXCEPTION 'Not a demo organisation';
  END IF;

  SELECT array_agg(id) INTO _schools FROM schools WHERE org_id = _org_id;
  _schools := COALESCE(_schools, ARRAY[]::uuid[]);
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _students FROM students WHERE school_id = ANY(_schools);
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _staffs FROM staff WHERE school_id = ANY(_schools);
  SELECT COALESCE(array_agg(DISTINCT user_id), ARRAY[]::uuid[]) INTO _users FROM user_roles WHERE org_id = _org_id;

  DELETE FROM receipts WHERE school_id = ANY(_schools);
  DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE school_id = ANY(_schools));
  DELETE FROM payments WHERE school_id = ANY(_schools);
  DELETE FROM payment_transactions WHERE school_id = ANY(_schools);
  DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE school_id = ANY(_schools));
  DELETE FROM invoices WHERE school_id = ANY(_schools);
  DELETE FROM fee_schedules WHERE school_id = ANY(_schools);
  DELETE FROM fee_categories WHERE org_id = _org_id;
  DELETE FROM payment_gateway_config WHERE org_id = _org_id;

  DELETE FROM student_scores WHERE student_id = ANY(_students);
  DELETE FROM exam_grade_bands WHERE exam_id IN (SELECT id FROM exams WHERE school_id = ANY(_schools));
  DELETE FROM exam_subjects WHERE exam_id IN (SELECT id FROM exams WHERE school_id = ANY(_schools));
  DELETE FROM exams WHERE school_id = ANY(_schools);
  DELETE FROM attendance_records WHERE school_id = ANY(_schools);
  DELETE FROM student_awards WHERE school_id = ANY(_schools);
  DELETE FROM student_transport WHERE student_id = ANY(_students);
  DELETE FROM transport_stops WHERE route_id IN (SELECT id FROM transport_routes WHERE school_id = ANY(_schools));
  DELETE FROM transport_routes WHERE school_id = ANY(_schools);
  DELETE FROM enrolments WHERE student_id = ANY(_students);
  DELETE FROM student_guardians WHERE student_id = ANY(_students);
  DELETE FROM document_files WHERE org_id = _org_id;

  DELETE FROM recognitions WHERE org_id = _org_id;
  DELETE FROM appointments WHERE org_id = _org_id;

  DELETE FROM payroll_run_items WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE school_id = ANY(_schools));
  DELETE FROM payroll_runs WHERE school_id = ANY(_schools);
  DELETE FROM salary_change_requests WHERE school_id = ANY(_schools);
  DELETE FROM payroll_profiles WHERE staff_id = ANY(_staffs);
  DELETE FROM staff_bank_details WHERE staff_id = ANY(_staffs);
  DELETE FROM staff_positions WHERE staff_id = ANY(_staffs);
  DELETE FROM class_teachers WHERE staff_id = ANY(_staffs);
  DELETE FROM staff WHERE school_id = ANY(_schools);

  DELETE FROM applications WHERE school_id = ANY(_schools);
  DELETE FROM application_counters WHERE school_id = ANY(_schools);
  DELETE FROM class_subjects WHERE class_id IN (SELECT id FROM classes WHERE school_id = ANY(_schools));
  DELETE FROM students WHERE school_id = ANY(_schools);
  DELETE FROM guardians WHERE org_id = _org_id;
  DELETE FROM subjects WHERE school_id = ANY(_schools);
  DELETE FROM classes WHERE school_id = ANY(_schools);

  DELETE FROM school_notices WHERE school_id = ANY(_schools);
  DELETE FROM event_rsvps WHERE org_id = _org_id;
  DELETE FROM school_events WHERE org_id = _org_id;
  DELETE FROM school_announcements WHERE org_id = _org_id;
  DELETE FROM notification_templates WHERE org_id = _org_id;
  DELETE FROM outbound_message_queue WHERE org_id = _org_id;
  DELETE FROM notifications WHERE org_id = _org_id;
  DELETE FROM approval_requests WHERE org_id = _org_id;
  DELETE FROM audit_logs WHERE org_id = _org_id;
  DELETE FROM ai_usage_events WHERE org_id = _org_id;

  DELETE FROM school_id_formats WHERE school_id = ANY(_schools);
  DELETE FROM id_counters WHERE school_id = ANY(_schools);

  DELETE FROM notification_preferences WHERE user_id = ANY(_users);
  DELETE FROM notification_settings WHERE user_id = ANY(_users);
  DELETE FROM notifications WHERE user_id = ANY(_users);

  DELETE FROM academic_periods WHERE academic_year_id IN (SELECT id FROM academic_years WHERE org_id = _org_id);
  DELETE FROM academic_years WHERE org_id = _org_id;
  DELETE FROM campuses WHERE school_id = ANY(_schools);
  DELETE FROM user_roles WHERE org_id = _org_id;
  DELETE FROM schools WHERE org_id = _org_id;
  DELETE FROM organisation_groups WHERE id = _org_id;
END $function$;