CREATE OR REPLACE FUNCTION public.my_guardian_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.guardians WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_my_child(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_guardians sg
    JOIN public.guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = _student_id
      AND g.user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "Users can view students in their org" ON public.students;
DROP POLICY IF EXISTS "Staff can view students in their org" ON public.students;
CREATE POLICY "Staff can view students in their org"
ON public.students FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = students.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their own children" ON public.students;
CREATE POLICY "Parents can view their own children"
ON public.students FOR SELECT TO authenticated
USING (public.is_my_child(students.id));

DROP POLICY IF EXISTS "Users can view guardians in their org" ON public.guardians;
DROP POLICY IF EXISTS "Staff can view guardians in their org" ON public.guardians;
CREATE POLICY "Staff can view guardians in their org"
ON public.guardians FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND org_id = public.get_user_org_id(auth.uid())
);
DROP POLICY IF EXISTS "Parents can view their own guardian record" ON public.guardians;
CREATE POLICY "Parents can view their own guardian record"
ON public.guardians FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view student-guardian links" ON public.student_guardians;
DROP POLICY IF EXISTS "Staff can view student-guardian links" ON public.student_guardians;
CREATE POLICY "Staff can view student-guardian links"
ON public.student_guardians FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.students s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = student_guardians.student_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their own links" ON public.student_guardians;
CREATE POLICY "Parents can view their own links"
ON public.student_guardians FOR SELECT TO authenticated
USING (guardian_id = public.my_guardian_id());

DROP POLICY IF EXISTS "Users can view enrolments" ON public.enrolments;
DROP POLICY IF EXISTS "Staff can view enrolments" ON public.enrolments;
CREATE POLICY "Staff can view enrolments"
ON public.enrolments FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.students s JOIN public.schools sc ON sc.id = s.school_id WHERE s.id = enrolments.student_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their children's enrolments" ON public.enrolments;
CREATE POLICY "Parents can view their children's enrolments"
ON public.enrolments FOR SELECT TO authenticated
USING (public.is_my_child(enrolments.student_id));

DROP POLICY IF EXISTS "Users can view invoices in their org" ON public.invoices;
DROP POLICY IF EXISTS "Staff can view invoices in their org" ON public.invoices;
CREATE POLICY "Staff can view invoices in their org"
ON public.invoices FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = invoices.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their children's invoices" ON public.invoices;
CREATE POLICY "Parents can view their children's invoices"
ON public.invoices FOR SELECT TO authenticated
USING (public.is_my_child(invoices.student_id));

DROP POLICY IF EXISTS "Users can view invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Staff can view invoice items" ON public.invoice_items;
CREATE POLICY "Staff can view invoice items"
ON public.invoice_items FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.invoices i JOIN public.schools sc ON sc.id = i.school_id WHERE i.id = invoice_items.invoice_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their children's invoice items" ON public.invoice_items;
CREATE POLICY "Parents can view their children's invoice items"
ON public.invoice_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_my_child(i.student_id))
);

DROP POLICY IF EXISTS "Users can view payments in their org" ON public.payments;
DROP POLICY IF EXISTS "Staff can view payments in their org" ON public.payments;
CREATE POLICY "Staff can view payments in their org"
ON public.payments FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = payments.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view payments for their children" ON public.payments;
CREATE POLICY "Parents can view payments for their children"
ON public.payments FOR SELECT TO authenticated
USING (public.is_my_child(payments.student_id));

DROP POLICY IF EXISTS "Users can view allocations" ON public.payment_allocations;
DROP POLICY IF EXISTS "Staff can view allocations" ON public.payment_allocations;
CREATE POLICY "Staff can view allocations"
ON public.payment_allocations FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.payments p JOIN public.schools sc ON sc.id = p.school_id WHERE p.id = payment_allocations.payment_id AND sc.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view allocations for their children" ON public.payment_allocations;
CREATE POLICY "Parents can view allocations for their children"
ON public.payment_allocations FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = payment_allocations.invoice_id AND public.is_my_child(i.student_id))
);

DROP POLICY IF EXISTS "Users can view receipts in their org" ON public.receipts;
DROP POLICY IF EXISTS "Staff can view receipts in their org" ON public.receipts;
CREATE POLICY "Staff can view receipts in their org"
ON public.receipts FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = receipts.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their children's receipts" ON public.receipts;
CREATE POLICY "Parents can view their children's receipts"
ON public.receipts FOR SELECT TO authenticated
USING (public.is_my_child(receipts.student_id));

DROP POLICY IF EXISTS "Users can view staff in their org" ON public.staff;
DROP POLICY IF EXISTS "Staff can view staff in their org" ON public.staff;
CREATE POLICY "Staff can view staff in their org"
ON public.staff FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = staff.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users can view attendance in their org" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can view attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Staff can view attendance in their org" ON public.attendance_records;
CREATE POLICY "Staff can view attendance in their org"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (SELECT 1 FROM public.schools WHERE schools.id = attendance_records.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
);
DROP POLICY IF EXISTS "Parents can view their children's attendance" ON public.attendance_records;
CREATE POLICY "Parents can view their children's attendance"
ON public.attendance_records FOR SELECT TO authenticated
USING (public.is_my_child(attendance_records.student_id));

DROP POLICY IF EXISTS "Users can view scores" ON public.student_scores;
DROP POLICY IF EXISTS "Staff can view scores" ON public.student_scores;
CREATE POLICY "Staff can view scores"
ON public.student_scores FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent')
  AND EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.schools sc ON sc.id = e.school_id
    WHERE e.id = student_scores.exam_id AND sc.org_id = public.get_user_org_id(auth.uid())
  )
);
DROP POLICY IF EXISTS "Parents can view their children's scores" ON public.student_scores;
CREATE POLICY "Parents can view their children's scores"
ON public.student_scores FOR SELECT TO authenticated
USING (public.is_my_child(student_scores.student_id));