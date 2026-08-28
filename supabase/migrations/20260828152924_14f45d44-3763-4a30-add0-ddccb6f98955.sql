-- user_roles: remove unscoped/over-permissive client write access.
-- All role writes happen through service-role edge functions, which bypass RLS.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Scoped insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Scoped update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Scoped delete user_roles" ON public.user_roles;

-- Keep read access strictly org-scoped (plus your own row).
DROP POLICY IF EXISTS "Users can view roles in their org" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view roles in their org"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (org_id IS NOT NULL AND org_id = public.get_user_org_id(auth.uid()))
);

-- profiles: ensure updates cannot re-point a profile at another user.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- profiles: restrict visibility to self + same-org members (explicit, org must be known).
DROP POLICY IF EXISTS "Users can view same-org profiles" ON public.profiles;
CREATE POLICY "Users can view same-org profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = profiles.user_id
      AND ur.org_id IS NOT NULL
      AND ur.org_id = public.get_user_org_id(auth.uid())
  )
);