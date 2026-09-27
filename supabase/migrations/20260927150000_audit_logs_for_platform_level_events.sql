-- Let audit_logs record an event that belongs to no single organisation.
--
-- audit_logs.org_id was NOT NULL, which is right for almost everything it
-- records: fees, payroll, roles inside a school group. But a super_admin is a
-- platform role, not an organisation's — primary_user_role() can legitimately
-- resolve one with a NULL org_id — and the role-audit helper in invite-user
-- returns early when it has no org to attribute an event to.
--
-- With a super admin now able to appoint another super admin, that combination
-- meant the single most consequential grant in the product could be made with
-- no record of it anywhere. Nullable org_id is the honest model: some events
-- are the platform's, not a tenant's.

ALTER TABLE public.audit_logs ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN public.audit_logs.org_id IS
  'The organisation this event belongs to. NULL for platform-level events, such '
  'as granting or revoking super_admin, which belong to no single tenant.';

-- The existing policy is `org_id = get_user_org_id(auth.uid())`, and NULL never
-- equals anything, so org-less rows are invisible to every tenant — which is
-- what we want. They still need to be readable by someone, or the record is
-- write-only and the migration guard rightly complains.
-- DROP first, like every other policy migration here. CREATE POLICY has no
-- IF NOT EXISTS, so without this the file cannot be run twice — which matters
-- when migrations are applied by hand through an editor rather than by
-- `supabase db push`: a half-finished attempt leaves you working out which
-- statements landed. The ALTER TABLE above is already idempotent.
DROP POLICY IF EXISTS "Super admins can view platform audit logs" ON public.audit_logs;
CREATE POLICY "Super admins can view platform audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (org_id IS NULL AND public.has_role(auth.uid(), 'super_admin'));
