-- Move the class_teachers policy off my_staff_id(), and retire the helper.
--
-- 20260908162058 scoped class_teachers with `staff_id = my_staff_id()`, whose
-- body is:
--
--   SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1
--
-- A LIMIT 1 with no ORDER BY returns rows in physical heap order, which changes
-- after any UPDATE to the table or a VACUUM. Someone employed at two schools in
-- one group has two staff rows, so the policy picks an arbitrary one and half
-- their class assignments disappear from StaffPortal and Timetable — with no
-- error, and with the half that disappears changing for reasons nobody can
-- reproduce.
--
-- 20260902090000 had already added my_staff_ids() for exactly this, returning a
-- set, with a comment spelling out why the singular form is wrong. That
-- migration sorts earlier, so this policy took a fresh dependency on the
-- deprecated helper five days after the replacement landed. Dropping it is what
-- stops that happening a third time.
--
-- Only reachable for a teacher with no single school — one pinned to a school
-- cannot see the other school's classes at all, because the EXISTS below runs
-- under the caller's own row-level security. That is the group-wide teacher an
-- org-level invite creates.

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
