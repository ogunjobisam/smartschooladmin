REVOKE ALL ON FUNCTION public.is_support_staff_only(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_staff_only(uuid) TO authenticated;