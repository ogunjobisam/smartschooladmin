REVOKE EXECUTE ON FUNCTION public.next_student_id_number(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.school_id_prefix(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_student_id_number() FROM authenticated, anon, public;