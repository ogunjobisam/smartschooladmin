CREATE OR REPLACE FUNCTION public.wall_recipient_names(_school_id uuid)
RETURNS TABLE (subject_type text, person_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'student'::text, s.id, s.first_name || ' ' || s.last_name
  FROM students s
  WHERE s.school_id = _school_id
    AND EXISTS (
      SELECT 1 FROM schools sc
      WHERE sc.id = _school_id AND sc.org_id = public.get_user_org_id(auth.uid())
    )
    AND (
      EXISTS (SELECT 1 FROM recognitions r WHERE r.student_id = s.id AND r.status = 'published')
      OR EXISTS (SELECT 1 FROM appointments a WHERE a.student_id = s.id AND a.status = 'published')
    )
  UNION ALL
  SELECT 'staff'::text, st.id, st.first_name || ' ' || st.last_name
  FROM staff st
  WHERE st.school_id = _school_id
    AND EXISTS (
      SELECT 1 FROM schools sc
      WHERE sc.id = _school_id AND sc.org_id = public.get_user_org_id(auth.uid())
    )
    AND (
      EXISTS (SELECT 1 FROM recognitions r WHERE r.staff_id = st.id AND r.status = 'published')
      OR EXISTS (SELECT 1 FROM appointments a WHERE a.staff_id = st.id AND a.status = 'published')
    );
$$;

REVOKE ALL ON FUNCTION public.wall_recipient_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wall_recipient_names(uuid) TO authenticated;