
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;
