CREATE TABLE public.exam_subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  max_score integer NOT NULL DEFAULT 100,
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (exam_id, subject_id)
);

CREATE TABLE public.exam_grade_bands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  label text NOT NULL,
  min_percent numeric NOT NULL,
  remark text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (exam_id, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_subjects TO authenticated;
GRANT ALL ON public.exam_subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_grade_bands TO authenticated;
GRANT ALL ON public.exam_grade_bands TO service_role;

ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_grade_bands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view exam subjects" ON public.exam_subjects
FOR SELECT TO authenticated
USING (NOT public.is_self_service_role(auth.uid()) AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff can manage exam subjects" ON public.exam_subjects
FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.class_id IS NOT NULL AND public.teaches_class(e.class_id)
  ))
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.class_id IS NOT NULL AND public.teaches_class(e.class_id)
  ))
);

CREATE POLICY "Students can view exam subjects for their exams" ON public.exam_subjects
FOR SELECT TO authenticated
USING (public.student_sits_exam(exam_id));

CREATE POLICY "Parents can view exam subjects their child sits" ON public.exam_subjects
FOR SELECT TO authenticated
USING (public.child_sits_exam(exam_id));

CREATE POLICY "Staff can view exam grade bands" ON public.exam_grade_bands
FOR SELECT TO authenticated
USING (NOT public.is_self_service_role(auth.uid()) AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff can manage exam grade bands" ON public.exam_grade_bands
FOR ALL TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.class_id IS NOT NULL AND public.teaches_class(e.class_id)
  ))
)
WITH CHECK (
  NOT public.is_self_service_role(auth.uid())
  AND public.exam_org_id(exam_id) = public.get_user_org_id(auth.uid())
  AND (NOT public.is_teacher_only(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.class_id IS NOT NULL AND public.teaches_class(e.class_id)
  ))
);

CREATE POLICY "Students can view exam grade bands for their exams" ON public.exam_grade_bands
FOR SELECT TO authenticated
USING (public.student_sits_exam(exam_id));

CREATE POLICY "Parents can view exam grade bands their child sits" ON public.exam_grade_bands
FOR SELECT TO authenticated
USING (public.child_sits_exam(exam_id));

CREATE TRIGGER update_exam_subjects_updated_at BEFORE UPDATE ON public.exam_subjects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exam_grade_bands_updated_at BEFORE UPDATE ON public.exam_grade_bands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();