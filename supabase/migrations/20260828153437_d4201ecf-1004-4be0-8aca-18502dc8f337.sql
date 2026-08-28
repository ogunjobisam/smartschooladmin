ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.students.user_id IS
  'Login account for this student, set when the school invites them to the portal.';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (role = 'super_admin' AND _role NOT IN ('parent'::app_role, 'student'::app_role))
        OR (role = 'school_admin' AND _role IN ('principal'::app_role, 'school_admin'::app_role))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.my_student_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_self_service_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('parent'::app_role, 'student'::app_role)
  )
$$;

DROP POLICY IF EXISTS "Students can view their own record" ON public.students;
CREATE POLICY "Students can view their own record"
ON public.students FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Students can view their own enrolments" ON public.enrolments;
CREATE POLICY "Students can view their own enrolments"
ON public.enrolments FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

DROP POLICY IF EXISTS "Students can view their own attendance" ON public.attendance_records;
CREATE POLICY "Students can view their own attendance"
ON public.attendance_records FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

DROP POLICY IF EXISTS "Students can view their own scores" ON public.student_scores;
CREATE POLICY "Students can view their own scores"
ON public.student_scores FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

DROP POLICY IF EXISTS "Students can view their own invoices" ON public.invoices;
CREATE POLICY "Students can view their own invoices"
ON public.invoices FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

DROP POLICY IF EXISTS "Students can view their own invoice items" ON public.invoice_items;
CREATE POLICY "Students can view their own invoice items"
ON public.invoice_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.student_id = public.my_student_id())
);

DROP POLICY IF EXISTS "Students can view their own payments" ON public.payments;
CREATE POLICY "Students can view their own payments"
ON public.payments FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

DROP POLICY IF EXISTS "Students can view their own receipts" ON public.receipts;
CREATE POLICY "Students can view their own receipts"
ON public.receipts FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

DROP POLICY IF EXISTS "Students can view exams for their scores" ON public.exams;
CREATE POLICY "Students can view exams for their scores"
ON public.exams FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_scores ss
    WHERE ss.exam_id = exams.id AND ss.student_id = public.my_student_id()
  )
);

DROP POLICY IF EXISTS "Staff can view students in their org" ON public.students;
CREATE POLICY "Staff can view students in their org"
ON public.students FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(students.id))
);

DROP POLICY IF EXISTS "Staff can view guardians in their org" ON public.guardians;
CREATE POLICY "Staff can view guardians in their org"
ON public.guardians FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
);

DROP POLICY IF EXISTS "Staff can view staff in their org" ON public.staff;
CREATE POLICY "Staff can view staff in their org"
ON public.staff FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = staff.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can view invoices in their org" ON public.invoices;
CREATE POLICY "Staff can view invoices in their org"
ON public.invoices FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = invoices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can view payments in their org" ON public.payments;
CREATE POLICY "Staff can view payments in their org"
ON public.payments FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = payments.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Staff can view attendance in their org" ON public.attendance_records;
CREATE POLICY "Staff can view attendance in their org"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_class(attendance_records.class_id))
);

DROP POLICY IF EXISTS "Staff can view scores" ON public.student_scores;
CREATE POLICY "Staff can view scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.schools sc ON sc.id = e.school_id
    WHERE e.id = student_scores.exam_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_student(student_scores.student_id))
);

DROP POLICY IF EXISTS "Staff can manage students" ON public.students;
CREATE POLICY "Staff can manage students"
ON public.students FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.is_self_service_role(auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.is_self_service_role(auth.uid())
);

DROP POLICY IF EXISTS "Staff can manage attendance" ON public.attendance_records;
CREATE POLICY "Staff can manage attendance"
ON public.attendance_records FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.is_self_service_role(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_class(attendance_records.class_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.is_self_service_role(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR public.teaches_class(attendance_records.class_id))
);

DROP POLICY IF EXISTS "Staff can insert messages" ON public.outbound_message_queue;
CREATE POLICY "Staff can insert messages"
ON public.outbound_message_queue FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND NOT public.is_self_service_role(auth.uid())
);

DROP POLICY IF EXISTS "Staff can view class teachers in their org" ON public.class_teachers;
CREATE POLICY "Staff can view class teachers in their org"
ON public.class_teachers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = class_teachers.class_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
  AND NOT public.is_self_service_role(auth.uid())
);

DROP POLICY IF EXISTS "Users can view classes in their org" ON public.classes;
CREATE POLICY "Users can view classes in their org"
ON public.classes FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = classes.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    NOT public.is_teacher_only(auth.uid())
    OR public.teaches_class(classes.id)
  )
  AND (
    NOT public.has_role(auth.uid(), 'student')
    OR EXISTS (
      SELECT 1 FROM public.enrolments e
      WHERE e.class_id = classes.id AND e.student_id = public.my_student_id()
    )
  )
);