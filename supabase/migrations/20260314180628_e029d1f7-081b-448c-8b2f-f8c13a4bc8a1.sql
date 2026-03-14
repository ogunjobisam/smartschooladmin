
-- ============================================================
-- SUBJECTS
-- ============================================================
CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, name)
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage subjects"
  ON public.subjects FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = subjects.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = subjects.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent')
  );

CREATE POLICY "Users can view subjects"
  ON public.subjects FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = subjects.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );

-- ============================================================
-- EXAMS
-- ============================================================
CREATE TABLE public.exams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  exam_date DATE,
  max_score INTEGER NOT NULL DEFAULT 100,
  weight NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage exams"
  ON public.exams FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = exams.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = exams.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent')
  );

CREATE POLICY "Users can view exams"
  ON public.exams FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = exams.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );

-- ============================================================
-- STUDENT SCORES
-- ============================================================
CREATE TABLE public.student_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  score NUMERIC(6,2),
  grade TEXT,
  remarks TEXT,
  entered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id, subject_id)
);

ALTER TABLE public.student_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage scores"
  ON public.student_scores FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      JOIN schools sc ON sc.id = e.school_id
      WHERE e.id = student_scores.exam_id AND sc.org_id = get_user_org_id(auth.uid())
    )
    AND NOT has_role(auth.uid(), 'parent')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exams e
      JOIN schools sc ON sc.id = e.school_id
      WHERE e.id = student_scores.exam_id AND sc.org_id = get_user_org_id(auth.uid())
    )
    AND NOT has_role(auth.uid(), 'parent')
  );

CREATE POLICY "Users can view scores"
  ON public.student_scores FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      JOIN schools sc ON sc.id = e.school_id
      WHERE e.id = student_scores.exam_id AND sc.org_id = get_user_org_id(auth.uid())
    )
  );

-- Indexes
CREATE INDEX idx_scores_exam_student ON public.student_scores(exam_id, student_id);
CREATE INDEX idx_exams_school_period ON public.exams(school_id, academic_period_id);
