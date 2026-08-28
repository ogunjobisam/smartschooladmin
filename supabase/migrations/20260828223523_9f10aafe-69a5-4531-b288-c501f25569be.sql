-- Path scheme:
--   <school_id>/students/<student_id>.<ext>
--   <school_id>/staff/<staff_id>.<ext>
--   users/<user_id>/avatar.<ext>
CREATE OR REPLACE FUNCTION public.photo_path_owns_account(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT split_part(_name, '/', 1) = 'users'
     AND split_part(_name, '/', 2) = _user_id::text
$$;

CREATE OR REPLACE FUNCTION public.photo_path_subject_id(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN split_part(split_part(_name, '/', 3), '.', 1)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- A family member may see the photo attached to their own student record.
CREATE OR REPLACE FUNCTION public.can_view_own_family_photo(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT split_part(_name, '/', 2) = 'students'
     AND public.photo_path_subject_id(_name) IS NOT NULL
     AND (
       public.photo_path_subject_id(_name) = public.my_student_id()
       OR public.is_my_child(public.photo_path_subject_id(_name))
     )
$$;

REVOKE ALL ON FUNCTION public.photo_path_owns_account(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.photo_path_subject_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_own_family_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.photo_path_owns_account(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.photo_path_subject_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_own_family_photo(text) TO authenticated, service_role;

CREATE POLICY "Read profile photos in scope"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    public.can_access_school_documents(auth.uid(), name)
    OR public.photo_path_owns_account(auth.uid(), name)
    OR public.can_view_own_family_photo(name)
  )
);

CREATE POLICY "Upload profile photos in scope"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (
    public.can_access_school_documents(auth.uid(), name)
    OR public.photo_path_owns_account(auth.uid(), name)
  )
);

CREATE POLICY "Replace profile photos in scope"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    public.can_access_school_documents(auth.uid(), name)
    OR public.photo_path_owns_account(auth.uid(), name)
  )
);

CREATE POLICY "Delete profile photos in scope"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    public.can_access_school_documents(auth.uid(), name)
    OR public.photo_path_owns_account(auth.uid(), name)
  )
);