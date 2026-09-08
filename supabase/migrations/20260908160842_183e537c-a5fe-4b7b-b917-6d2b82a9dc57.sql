CREATE OR REPLACE FUNCTION public.school_admin_contacts(_school_id uuid)
RETURNS TABLE(user_id uuid, email text, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ur.user_id, p.email, p.full_name
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE public.is_org_staff(auth.uid())
    AND ur.org_id = public.get_user_org_id(auth.uid())
    AND ur.role IN ('school_admin'::app_role, 'principal'::app_role, 'proprietor'::app_role, 'group_admin'::app_role)
    AND (ur.school_id IS NULL OR ur.school_id = _school_id)
    AND EXISTS (
      SELECT 1 FROM public.schools s
      WHERE s.id = _school_id AND s.org_id = public.get_user_org_id(auth.uid())
    )
$$;

REVOKE ALL ON FUNCTION public.school_admin_contacts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.school_admin_contacts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.school_admin_contacts(uuid) TO authenticated;

-- Demo sandboxes were seeded with kobo-sized numbers while the app displays
-- whole naira, so a termly fee read as 18,000,000. Rescale the seeded amounts
-- inside create_demo_org without otherwise touching its logic.
DO $do$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_demo_org';

  def := replace(def, '207000000', '2070000');
  def := replace(def, '174915000', '1749150');
  def := replace(def, '32085000', '320850');
  def := replace(def, '45000000', '450000');
  def := replace(def, '32000000', '320000');
  def := replace(def, '24000000', '240000');
  def := replace(def, '18000000', '180000');
  def := replace(def, '6000000', '60000');
  def := replace(def, '4500000', '45000');
  def := replace(def, '3000000', '30000');
  def := replace(def, '1500000', '15000');

  EXECUTE def;
END
$do$;