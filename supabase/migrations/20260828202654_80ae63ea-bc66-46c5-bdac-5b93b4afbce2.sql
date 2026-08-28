-- The previous migration created users_with_multiple_roles as a plain VIEW.
-- Postgres executes plain views with the view owner's privileges by default,
-- which the linter flags as a SECURITY DEFINER view. Recreate it with
-- security_invoker so it evaluates under the caller's RLS policies while the
-- primary_user_role() helper it calls remains SECURITY DEFINER.
CREATE OR REPLACE VIEW public.users_with_multiple_roles
WITH (security_invoker = true)
AS
  SELECT
    user_id,
    count(*) AS role_count,
    array_agg(DISTINCT org_id) FILTER (WHERE org_id IS NOT NULL) AS org_ids,
    (SELECT org_id FROM public.primary_user_role(ur.user_id)) AS resolves_to
  FROM public.user_roles ur
  GROUP BY user_id
  HAVING count(*) > 1;

COMMENT ON VIEW public.users_with_multiple_roles IS
  'Accounts holding more than one role row. resolves_to is the organisation '
  'they will actually land in; the others are unreachable from the interface.';