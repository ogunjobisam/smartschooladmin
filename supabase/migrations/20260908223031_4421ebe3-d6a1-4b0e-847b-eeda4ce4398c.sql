-- Helper: is this class one of my (or my child's) classes?
CREATE OR REPLACE FUNCTION public.class_is_mine_or_my_childs(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrolments e
    WHERE e.class_id = _class_id
      AND (e.student_id = public.my_student_id() OR public.is_my_child(e.student_id))
  )
$$;

-- 1. Bell schedule -----------------------------------------------------------
CREATE TABLE public.timetable_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_break boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_periods TO authenticated;
GRANT ALL ON public.timetable_periods TO service_role;
ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can view periods"
ON public.timetable_periods FOR SELECT TO authenticated
USING (school_id = public.get_user_school_id(auth.uid()) OR public.is_org_staff(auth.uid()));

CREATE POLICY "Managers manage periods"
ON public.timetable_periods FOR ALL TO authenticated
USING (public.is_school_manager(auth.uid()))
WITH CHECK (public.is_school_manager(auth.uid()));

CREATE TRIGGER update_timetable_periods_updated_at
BEFORE UPDATE ON public.timetable_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Weekly lesson pattern ---------------------------------------------------
CREATE TABLE public.timetable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_period_id uuid NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  timetable_period_id uuid NOT NULL REFERENCES public.timetable_periods(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  room text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, academic_period_id, timetable_period_id, day_of_week)
);

CREATE INDEX idx_timetable_entries_class ON public.timetable_entries (class_id, academic_period_id);
CREATE INDEX idx_timetable_entries_staff ON public.timetable_entries (staff_id, academic_period_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_entries TO authenticated;
GRANT ALL ON public.timetable_entries TO service_role;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view school timetable"
ON public.timetable_entries FOR SELECT TO authenticated
USING (public.is_org_staff(auth.uid()) AND school_id = COALESCE(public.get_user_school_id(auth.uid()), school_id));

CREATE POLICY "Families can view their class timetable"
ON public.timetable_entries FOR SELECT TO authenticated
USING (public.class_is_mine_or_my_childs(class_id));

CREATE POLICY "Managers manage timetable"
ON public.timetable_entries FOR ALL TO authenticated
USING (public.is_school_manager(auth.uid()))
WITH CHECK (public.is_school_manager(auth.uid()));

CREATE POLICY "Teachers manage their class timetable"
ON public.timetable_entries FOR ALL TO authenticated
USING (public.teaches_class(class_id))
WITH CHECK (public.teaches_class(class_id));

CREATE TRIGGER update_timetable_entries_updated_at
BEFORE UPDATE ON public.timetable_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Date exceptions ---------------------------------------------------------
CREATE TABLE public.timetable_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.timetable_entries(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'cancelled' CHECK (status IN ('cancelled', 'moved')),
  new_date date,
  new_timetable_period_id uuid REFERENCES public.timetable_periods(id) ON DELETE SET NULL,
  new_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  new_room text,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, date)
);

CREATE INDEX idx_timetable_exceptions_date ON public.timetable_exceptions (school_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_exceptions TO authenticated;
GRANT ALL ON public.timetable_exceptions TO service_role;
ALTER TABLE public.timetable_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view exceptions"
ON public.timetable_exceptions FOR SELECT TO authenticated
USING (public.is_org_staff(auth.uid()) AND school_id = COALESCE(public.get_user_school_id(auth.uid()), school_id));

CREATE POLICY "Families can view exceptions for their classes"
ON public.timetable_exceptions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.timetable_entries t
  WHERE t.id = timetable_exceptions.entry_id
    AND public.class_is_mine_or_my_childs(t.class_id)
));

CREATE POLICY "Managers manage exceptions"
ON public.timetable_exceptions FOR ALL TO authenticated
USING (public.is_school_manager(auth.uid()))
WITH CHECK (public.is_school_manager(auth.uid()));

CREATE POLICY "Teachers manage exceptions for their classes"
ON public.timetable_exceptions FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.timetable_entries t
  WHERE t.id = timetable_exceptions.entry_id AND public.teaches_class(t.class_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.timetable_entries t
  WHERE t.id = timetable_exceptions.entry_id AND public.teaches_class(t.class_id)
));

CREATE TRIGGER update_timetable_exceptions_updated_at
BEFORE UPDATE ON public.timetable_exceptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();