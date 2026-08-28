CREATE TYPE public.recognition_status AS ENUM ('draft', 'submitted', 'published', 'archived');
CREATE TYPE public.recognition_subject AS ENUM ('student', 'staff');

CREATE TABLE public.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_type public.recognition_subject NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  description text,
  award_date date NOT NULL DEFAULT CURRENT_DATE,
  academic_period_id uuid REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  status public.recognition_status NOT NULL DEFAULT 'draft',
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recognitions_subject_target CHECK (
    (subject_type = 'student' AND student_id IS NOT NULL AND staff_id IS NULL)
    OR (subject_type = 'staff' AND staff_id IS NOT NULL AND student_id IS NULL)
  )
);

CREATE INDEX recognitions_school_status_idx ON public.recognitions (school_id, status, award_date DESC);
CREATE INDEX recognitions_student_idx ON public.recognitions (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX recognitions_staff_idx ON public.recognitions (staff_id) WHERE staff_id IS NOT NULL;

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_type public.recognition_subject NOT NULL DEFAULT 'student',
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  position_title text NOT NULL,
  portfolio text,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status public.recognition_status NOT NULL DEFAULT 'draft',
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_subject_target CHECK (
    (subject_type = 'student' AND student_id IS NOT NULL AND staff_id IS NULL)
    OR (subject_type = 'staff' AND staff_id IS NOT NULL AND student_id IS NULL)
  ),
  CONSTRAINT appointments_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX appointments_school_status_idx ON public.appointments (school_id, status, start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recognitions TO authenticated;
GRANT ALL ON public.recognitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Anyone inside the organisation may read published records for their schools.
CREATE POLICY "Org members view published recognitions"
  ON public.recognitions FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = recognitions.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

-- School staff (not parents/students) may see the pipeline for their organisation.
CREATE POLICY "Org staff view all recognitions"
  ON public.recognitions FOR SELECT TO authenticated
  USING (
    public.is_org_staff(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = recognitions.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Org staff draft recognitions"
  ON public.recognitions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_staff(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = recognitions.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
        AND s.org_id = recognitions.org_id
    )
    AND (status <> 'published' OR public.is_school_manager(auth.uid()))
  );

CREATE POLICY "Publishers manage recognitions"
  ON public.recognitions FOR UPDATE TO authenticated
  USING (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = recognitions.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = recognitions.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Authors edit unpublished recognitions"
  ON public.recognitions FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND status <> 'published'
    AND NOT public.is_self_service_role(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status <> 'published'
  );

CREATE POLICY "Publishers delete recognitions"
  ON public.recognitions FOR DELETE TO authenticated
  USING (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = recognitions.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

-- Appointments mirror the same rules.
CREATE POLICY "Org members view published appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = appointments.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Org staff view all appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (
    public.is_org_staff(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = appointments.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Org staff draft appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_staff(auth.uid())
    AND NOT public.is_self_service_role(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = appointments.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
        AND s.org_id = appointments.org_id
    )
    AND (status <> 'published' OR public.is_school_manager(auth.uid()))
  );

CREATE POLICY "Publishers manage appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = appointments.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = appointments.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Authors edit unpublished appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND status <> 'published'
    AND NOT public.is_self_service_role(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status <> 'published'
  );

CREATE POLICY "Publishers delete appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING (
    public.is_school_manager(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = appointments.school_id
        AND s.org_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE TRIGGER update_recognitions_updated_at
  BEFORE UPDATE ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stamp the publisher, and refuse a publish from anyone without the authority.
CREATE OR REPLACE FUNCTION public.stamp_recognition_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT public.is_school_manager(auth.uid()) THEN
      RAISE EXCEPTION 'Only a school manager can publish a recognition'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.published_by := auth.uid();
    NEW.published_at := now();
  ELSIF NEW.status <> 'published' THEN
    NEW.published_by := NULL;
    NEW.published_at := NULL;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_recognition_publish() FROM anon, authenticated;

CREATE TRIGGER stamp_recognitions_publish
  BEFORE INSERT OR UPDATE ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_recognition_publish();

CREATE TRIGGER stamp_appointments_publish
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_recognition_publish();