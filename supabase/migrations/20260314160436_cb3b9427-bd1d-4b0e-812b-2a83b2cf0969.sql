
-- Add branding columns to schools table
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#1e293b',
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS tagline text;

-- Create storage bucket for school assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Anyone authenticated in the same org can view school assets
CREATE POLICY "Users can view school assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'school-assets');

-- RLS: Admins can upload school assets
CREATE POLICY "Admins can upload school assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'school-assets'
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'group_admin'))
);

-- RLS: Admins can update school assets
CREATE POLICY "Admins can update school assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'school-assets'
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'group_admin'))
);

-- RLS: Admins can delete school assets
CREATE POLICY "Admins can delete school assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'school-assets'
  AND (has_role(auth.uid(), 'proprietor') OR has_role(auth.uid(), 'group_admin'))
);
