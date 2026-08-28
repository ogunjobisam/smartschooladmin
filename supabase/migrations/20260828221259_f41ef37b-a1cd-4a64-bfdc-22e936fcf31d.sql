-- Rank helper so "most senior role" is expressed in one place.
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
    WHEN 'teacher' THEN 8
    WHEN 'parent' THEN 9
    WHEN 'student' THEN 10
    ELSE 99
  END
$$;

-- With multiple roles allowed, the "primary" role must be the most senior one,
-- otherwise a teacher who is also a parent could be gated as a parent.
CREATE OR REPLACE FUNCTION public.primary_user_role(_user_id uuid)
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY public.role_rank(role), (org_id IS NULL), (school_id IS NULL), created_at DESC, id
  LIMIT 1
$$;

-- Full role list for the signed-in user.
CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY public.role_rank(role)
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated, service_role;

-- Is a role allowed to sit alongside another one on the same person?
-- A pupil must never also be staff; parent is the one overlap that happens in
-- real schools (an adult student whose child also attends).
CREATE OR REPLACE FUNCTION public.roles_compatible(_a app_role, _b app_role)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _a = _b THEN true
    WHEN _a = 'student' THEN _b = 'parent'
    WHEN _b = 'student' THEN _a = 'parent'
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION public.enforce_role_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicting app_role;
BEGIN
  SELECT ur.role INTO conflicting
  FROM public.user_roles ur
  WHERE ur.user_id = NEW.user_id
    AND ur.id <> NEW.id
    AND NOT public.roles_compatible(ur.role, NEW.role)
  LIMIT 1;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION 'The % role cannot be combined with the % role for the same user', NEW.role, conflicting
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_compatibility ON public.user_roles;
CREATE TRIGGER enforce_role_compatibility
BEFORE INSERT OR UPDATE OF role, user_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_role_compatibility();