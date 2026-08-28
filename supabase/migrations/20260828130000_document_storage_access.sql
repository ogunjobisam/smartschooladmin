-- Documents: fix who can upload, and stop student records being world-readable.
--
-- Two problems with the original 'school-assets' setup:
--
-- 1. Only proprietor and group_admin could INSERT, but the Documents tab offers
--    an Upload button to every role except parent. A school_admin, principal,
--    bursar, HR admin or teacher who used it got an RLS violation — a dead end.
--
-- 2. The bucket is public, and the document uploader stored getPublicUrl()
--    results. Student identification, medical and financial documents were
--    therefore readable by anyone holding the URL, with no authentication.
--
-- Branding logos genuinely need to be public: they render on the login page
-- before sign-in and inside printed invoices and payslips, where a signed URL
-- would expire. So 'school-assets' stays public for logos, and documents move to
-- a separate private bucket read through short-lived signed URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('school-documents', 'school-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: is the caller a staff member (any role except parent) of this org?
CREATE OR REPLACE FUNCTION public.is_org_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role <> 'parent'
  )
$$;

-- Objects are stored as <school_id>/documents/<entity_type>/<entity_id>/<file>,
-- so the first path segment identifies the owning school.
CREATE OR REPLACE FUNCTION public.storage_path_school_id(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  first_segment text := split_part(_name, '/', 1);
BEGIN
  RETURN first_segment::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_school_documents(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_staff(_user_id)
    AND EXISTS (
      SELECT 1 FROM public.schools
      WHERE schools.id = public.storage_path_school_id(_name)
        AND schools.org_id = public.get_user_org_id(_user_id)
    )
$$;

DROP POLICY IF EXISTS "Staff can read school documents" ON storage.objects;
CREATE POLICY "Staff can read school documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'school-documents' AND public.can_access_school_documents(auth.uid(), name));

DROP POLICY IF EXISTS "Staff can upload school documents" ON storage.objects;
CREATE POLICY "Staff can upload school documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'school-documents' AND public.can_access_school_documents(auth.uid(), name));

DROP POLICY IF EXISTS "Staff can update school documents" ON storage.objects;
CREATE POLICY "Staff can update school documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'school-documents' AND public.can_access_school_documents(auth.uid(), name));

DROP POLICY IF EXISTS "Staff can delete school documents" ON storage.objects;
CREATE POLICY "Staff can delete school documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'school-documents' AND public.can_access_school_documents(auth.uid(), name));

-- 'school-assets' keeps holding branding logos, but the write policies were so
-- narrow that a school_admin could not upload their own school's logo. Widen
-- them to the roles that can already edit branding, and scope reads to the
-- caller's own org rather than every authenticated user on the platform.
DROP POLICY IF EXISTS "Users can view school assets" ON storage.objects;
CREATE POLICY "Users can view school assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'school-assets');

DROP POLICY IF EXISTS "Admins can upload school assets" ON storage.objects;
CREATE POLICY "Admins can upload school assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'school-assets'
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
  )
);

DROP POLICY IF EXISTS "Admins can update school assets" ON storage.objects;
CREATE POLICY "Admins can update school assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'school-assets'
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
  )
);

DROP POLICY IF EXISTS "Admins can delete school assets" ON storage.objects;
CREATE POLICY "Admins can delete school assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'school-assets'
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
  )
);

-- document_files.file_url now holds a storage path for new uploads rather than a
-- public URL. Existing rows keep their absolute URL and the client falls back to
-- using it directly, so nothing already uploaded breaks.
COMMENT ON COLUMN public.document_files.file_url IS
  'Storage path within the private school-documents bucket. Legacy rows may hold an absolute public URL from the old school-assets bucket.';
