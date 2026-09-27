-- Move the class_teachers policy off my_staff_id(), and retire the helper.

DROP POLICY IF EXISTS "Staff can view class teachers in their org" ON public.class_teachers;
CREATE POLICY "Staff can view class teachers in their org"
ON public.class_teachers FOR SELECT
USING (
  NOT is_self_service_role(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schools sc ON sc.id = c.school_id
    WHERE c.id = class_teachers.class_id AND sc.org_id = get_user_org_id(auth.uid())
  )
  AND (
    NOT is_teacher_only(auth.uid())
    OR staff_id IN (SELECT public.my_staff_ids())
  )
);

-- That was the last reference outside its own definition.
DROP FUNCTION IF EXISTS public.my_staff_id();