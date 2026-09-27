-- Give support_staff its seniority.
--
-- role_rank() is the single definition of who outranks whom: primary_user_role()
-- orders by it, get_user_org_id() and get_user_school_id() read that, and the
-- invite-user edge function mirrors it. Adding a role without ranking it lands
-- the holder in the ELSE 99 bucket, junior to a pupil, which is not a boundary
-- anybody chose.
--
-- support_staff sits below hr_admin and above teacher: they hold no budget and
-- no personnel authority, so they are junior to every named admin function; but
-- their reach is the whole school's people and timetable rather than one
-- teacher's own classes, so they are senior to a teacher. Everything from
-- teacher down shifts by one.

CREATE OR REPLACE FUNCTION public.role_rank(_role app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN 0
    WHEN 'proprietor' THEN 1
    WHEN 'group_admin' THEN 2
    WHEN 'school_admin' THEN 3
    WHEN 'principal' THEN 4
    WHEN 'bursar' THEN 5
    WHEN 'finance_officer' THEN 6
    WHEN 'hr_admin' THEN 7
    WHEN 'support_staff' THEN 8
    WHEN 'teacher' THEN 9
    WHEN 'parent' THEN 10
    WHEN 'student' THEN 11
    ELSE 99
  END
$$;