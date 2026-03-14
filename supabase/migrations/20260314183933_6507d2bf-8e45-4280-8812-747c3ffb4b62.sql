
CREATE TABLE public.student_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  award_date date NOT NULL DEFAULT CURRENT_DATE,
  academic_period_id uuid REFERENCES public.academic_periods(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage student awards"
  ON public.student_awards FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = student_awards.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = student_awards.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent'::app_role)
  );

CREATE POLICY "Users can view student awards"
  ON public.student_awards FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = student_awards.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );
