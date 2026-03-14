-- Fix has_role: super_admin should only auto-pass for non-parent role checks
-- For 'parent' specifically, only return true if user actually IS a parent
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (role = 'super_admin' AND _role <> 'parent')
      )
  )
$$;