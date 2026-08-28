-- School transport: routes, stops, and who rides.
--
-- BLMS advertises a bus service across a named area. For a school that is a real
-- billable line, not just an operational detail, so the fee lives on the
-- assignment and can be picked up by invoicing.

CREATE TABLE IF NOT EXISTS public.transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  driver_name text,
  driver_phone text,
  vehicle_registration text,
  capacity integer,
  /* Default charge per term for riding this route, in whole currency units. */
  fee_per_term bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transport_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  /* Order along the route, so a stop list reads as a journey. */
  stop_order integer NOT NULL DEFAULT 0,
  pickup_time time,
  dropoff_time time,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_transport (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES public.transport_stops(id) ON DELETE SET NULL,
  academic_period_id uuid REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  /* Overrides the route's fee for this student when set — siblings, staff
     children and part-week riders all end up needing this. */
  fee_override bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_period_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_routes_school ON public.transport_routes(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_stops_route ON public.transport_stops(route_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_student_transport_route ON public.student_transport(route_id);

CREATE TRIGGER update_transport_routes_updated_at
  BEFORE UPDATE ON public.transport_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_transport ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Routes and stops: staff read, admins and finance manage
-- ---------------------------------------------------------------------------
CREATE POLICY "Staff can view transport routes"
ON public.transport_routes FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = transport_routes.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND NOT public.is_self_service_role(auth.uid())
);

CREATE POLICY "Admins can manage transport routes"
ON public.transport_routes FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = transport_routes.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools WHERE schools.id = transport_routes.school_id AND schools.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
);

CREATE POLICY "Staff can view transport stops"
ON public.transport_stops FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.transport_routes r JOIN public.schools s ON s.id = r.school_id
    WHERE r.id = transport_stops.route_id AND s.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "Admins can manage transport stops"
ON public.transport_stops FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.transport_routes r JOIN public.schools s ON s.id = r.school_id
    WHERE r.id = transport_stops.route_id AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transport_routes r JOIN public.schools s ON s.id = r.school_id
    WHERE r.id = transport_stops.route_id AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
);

-- ---------------------------------------------------------------------------
-- Assignments: staff manage; the family concerned can see their own
-- ---------------------------------------------------------------------------
CREATE POLICY "Staff can view student transport"
ON public.student_transport FOR SELECT TO authenticated
USING (
  NOT public.is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.students st JOIN public.schools s ON s.id = st.school_id
    WHERE st.id = student_transport.student_id AND s.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "Admins can manage student transport"
ON public.student_transport FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students st JOIN public.schools s ON s.id = st.school_id
    WHERE st.id = student_transport.student_id AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students st JOIN public.schools s ON s.id = st.school_id
    WHERE st.id = student_transport.student_id AND s.org_id = public.get_user_org_id(auth.uid())
  )
  AND (
    public.has_role(auth.uid(), 'proprietor') OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin') OR public.has_role(auth.uid(), 'principal')
    OR public.has_role(auth.uid(), 'bursar')
  )
);

CREATE POLICY "Parents can view their children's transport"
ON public.student_transport FOR SELECT TO authenticated
USING (public.is_my_child(student_transport.student_id));

CREATE POLICY "Students can view their own transport"
ON public.student_transport FOR SELECT TO authenticated
USING (student_id = public.my_student_id());

-- A rider needs to see which route and stop they are on.
CREATE POLICY "Riders can view their route"
ON public.transport_routes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_transport t
    WHERE t.route_id = transport_routes.id
      AND (public.is_my_child(t.student_id) OR t.student_id = public.my_student_id())
  )
);

CREATE POLICY "Riders can view their stop"
ON public.transport_stops FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_transport t
    WHERE t.route_id = transport_stops.route_id
      AND (public.is_my_child(t.student_id) OR t.student_id = public.my_student_id())
  )
);
