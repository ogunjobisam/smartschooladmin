DROP POLICY IF EXISTS "Admins can upload school assets" ON storage.objects;
CREATE POLICY "Admins can upload school assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'school-assets' AND (
  public.has_role(auth.uid(), 'proprietor'::app_role)
  OR public.has_role(auth.uid(), 'group_admin'::app_role)
  OR public.has_role(auth.uid(), 'school_admin'::app_role)
  OR public.has_role(auth.uid(), 'principal'::app_role)
));

DROP POLICY IF EXISTS "Admins can update school assets" ON storage.objects;
CREATE POLICY "Admins can update school assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'school-assets' AND (
  public.has_role(auth.uid(), 'proprietor'::app_role)
  OR public.has_role(auth.uid(), 'group_admin'::app_role)
  OR public.has_role(auth.uid(), 'school_admin'::app_role)
  OR public.has_role(auth.uid(), 'principal'::app_role)
));

DROP POLICY IF EXISTS "Admins can delete school assets" ON storage.objects;
CREATE POLICY "Admins can delete school assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'school-assets' AND (
  public.has_role(auth.uid(), 'proprietor'::app_role)
  OR public.has_role(auth.uid(), 'group_admin'::app_role)
  OR public.has_role(auth.uid(), 'school_admin'::app_role)
  OR public.has_role(auth.uid(), 'principal'::app_role)
));