
-- Junction table to link subjects to classes
CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_id, subject_id)
);

ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage class subjects" ON public.class_subjects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes c JOIN schools s ON s.id = c.school_id
      WHERE c.id = class_subjects.class_id AND s.org_id = get_user_org_id(auth.uid())
    ) AND NOT has_role(auth.uid(), 'parent'::app_role)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes c JOIN schools s ON s.id = c.school_id
      WHERE c.id = class_subjects.class_id AND s.org_id = get_user_org_id(auth.uid())
    ) AND NOT has_role(auth.uid(), 'parent'::app_role)
  );

CREATE POLICY "Users can view class subjects" ON public.class_subjects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes c JOIN schools s ON s.id = c.school_id
      WHERE c.id = class_subjects.class_id AND s.org_id = get_user_org_id(auth.uid())
    )
  );
