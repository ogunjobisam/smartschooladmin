
-- Fix the permissive INSERT policy on organisation_groups
-- Restrict to only allow insert if the user is creating the org (created_by = auth.uid())
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organisation_groups;
CREATE POLICY "Users can create orgs as themselves" ON public.organisation_groups FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
