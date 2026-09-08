-- Teachers may view guardians whose children they teach (all other staff access unchanged)
DROP POLICY IF EXISTS "Staff can view guardians in their org" ON public.guardians;
CREATE POLICY "Staff can view guardians in their org"
ON public.guardians FOR SELECT TO authenticated
USING (
  (
    NOT public.is_self_service_role(auth.uid())
    AND NOT public.is_teacher_only(auth.uid())
    AND org_id = public.get_user_org_id(auth.uid())
  )
  OR (
    public.is_teacher_only(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.student_guardians sg
      WHERE sg.guardian_id = guardians.id
        AND public.teaches_student(sg.student_id)
    )
  )
);

-- Names of the teachers of a class, only for people linked to that class:
-- its teacher, an enrolled student, a parent of an enrolled child, or school staff.
CREATE OR REPLACE FUNCTION public.class_teacher_names(_class_id uuid)
RETURNS TABLE(full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.first_name || ' ' || s.last_name
  FROM public.class_teachers ct
  JOIN public.staff s ON s.id = ct.staff_id
  WHERE ct.class_id = _class_id
    AND (
      public.teaches_class(_class_id)
      OR EXISTS (
        SELECT 1 FROM public.enrolments e
        WHERE e.class_id = _class_id
          AND (e.student_id = public.my_student_id() OR public.is_my_child(e.student_id))
      )
      OR (NOT public.is_self_service_role(auth.uid()) AND EXISTS (
        SELECT 1 FROM public.classes c
        JOIN public.schools sc ON sc.id = c.school_id
        WHERE c.id = _class_id AND sc.org_id = public.get_user_org_id(auth.uid())
      ))
    )
  ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.class_teacher_names(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.class_teacher_names(uuid) TO authenticated;