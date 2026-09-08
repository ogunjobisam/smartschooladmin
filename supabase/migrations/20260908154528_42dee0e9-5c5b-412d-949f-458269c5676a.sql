DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;
CREATE POLICY "Admins can manage classes"
ON public.classes FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.schools s WHERE s.id = classes.school_id AND s.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
    OR (public.has_role(auth.uid(), 'school_admin'::app_role) AND classes.school_id = public.get_user_school_id(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.schools s WHERE s.id = classes.school_id AND s.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
    OR (public.has_role(auth.uid(), 'school_admin'::app_role) AND classes.school_id = public.get_user_school_id(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Admins can manage academic years" ON public.academic_years;
CREATE POLICY "Admins can manage academic years"
ON public.academic_years FOR ALL TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
    OR public.has_role(auth.uid(), 'school_admin'::app_role)
  )
)
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
    OR public.has_role(auth.uid(), 'school_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins can manage periods" ON public.academic_periods;
CREATE POLICY "Admins can manage periods"
ON public.academic_periods FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.academic_years y WHERE y.id = academic_periods.academic_year_id AND y.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
    OR public.has_role(auth.uid(), 'school_admin'::app_role)
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.academic_years y WHERE y.id = academic_periods.academic_year_id AND y.org_id = public.get_user_org_id(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'proprietor'::app_role)
    OR public.has_role(auth.uid(), 'group_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
    OR public.has_role(auth.uid(), 'school_admin'::app_role)
  )
);