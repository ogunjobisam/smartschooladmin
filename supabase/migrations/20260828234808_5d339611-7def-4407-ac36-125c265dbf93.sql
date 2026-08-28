ALTER TABLE public.recognitions ADD COLUMN IF NOT EXISTS photo_path text;

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'recognition_published';

-- Recognition photos are filed as <school_id>/recognitions/<recognition_id>/<file>
CREATE OR REPLACE FUNCTION public.can_view_own_recognition_photo(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rec_id uuid;
BEGIN
  IF split_part(_name, '/', 2) <> 'recognitions' THEN
    RETURN false;
  END IF;
  BEGIN
    _rec_id := split_part(_name, '/', 3)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.recognitions r
    LEFT JOIN public.staff s ON s.id = r.staff_id
    WHERE r.id = _rec_id
      AND r.status = 'published'
      AND (
        (r.student_id IS NOT NULL AND (r.student_id = public.my_student_id() OR public.is_my_child(r.student_id)))
        OR (s.user_id IS NOT NULL AND s.user_id = auth.uid())
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_own_recognition_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_own_recognition_photo(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Read own recognition photos" ON storage.objects;
CREATE POLICY "Read own recognition photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.can_view_own_recognition_photo(name)
);