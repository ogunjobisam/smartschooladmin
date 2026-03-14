
-- Attendance status enum
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

-- Attendance records table
CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  notes TEXT,
  marked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Teachers and above can manage attendance in their org
CREATE POLICY "Staff can manage attendance"
  ON public.attendance_records FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = attendance_records.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = attendance_records.school_id AND schools.org_id = get_user_org_id(auth.uid()))
    AND NOT has_role(auth.uid(), 'parent')
  );

-- Everyone in the org can view
CREATE POLICY "Users can view attendance in their org"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM schools WHERE schools.id = attendance_records.school_id AND schools.org_id = get_user_org_id(auth.uid()))
  );

-- Index for fast lookups
CREATE INDEX idx_attendance_class_date ON public.attendance_records(class_id, date);
CREATE INDEX idx_attendance_student_date ON public.attendance_records(student_id, date);
