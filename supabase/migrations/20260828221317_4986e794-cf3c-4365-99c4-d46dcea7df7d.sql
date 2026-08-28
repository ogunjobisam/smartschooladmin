-- Trigger helper is never called directly by the app.
REVOKE EXECUTE ON FUNCTION public.enforce_role_compatibility() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.primary_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_role_compatibility() TO service_role;
GRANT EXECUTE ON FUNCTION public.primary_user_role(uuid) TO authenticated, service_role;