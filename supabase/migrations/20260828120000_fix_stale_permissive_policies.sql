-- Close two tenant-isolation holes left open by 20260314194306.
--
-- That migration intended to replace the permissive policies below with scoped
-- ones, but its DROP POLICY statements named policies that were never created:
--
--   * it dropped "Admins can manage user roles"
--     -> the real policy is named "Admins can manage roles"
--   * it dropped "Users can view salary changes in their org"
--     -> the real policy is named "Users can view salary change requests in their org"
--
-- DROP POLICY IF EXISTS is a no-op on a name that does not exist, so both
-- originals survived. PostgreSQL combines permissive policies with OR, which
-- means the tighter policies added alongside them never took effect.

-- 1. user_roles
--
-- "Admins can manage roles" is FOR ALL with no organisation predicate, so any
-- proprietor or super_admin could read, re-role or delete the user_roles of
-- every other organisation on the platform. The scoped insert/update/delete/
-- select policies from 20260314194306 already cover the legitimate cases.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- 2. salary_change_requests
--
-- The surviving SELECT policy let every member of an organisation — teachers
-- and parents included — read staff salary change requests. The intended rule,
-- "HR/Finance can view salary changes" (20260314194306), is already in place.
DROP POLICY IF EXISTS "Users can view salary change requests in their org" ON public.salary_change_requests;
