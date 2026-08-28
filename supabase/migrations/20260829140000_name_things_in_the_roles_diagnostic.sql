-- Make the duplicate-roles diagnostic legible.
--
-- The first version returned four UUID columns. Faced with an account holding
-- three organisations, it told you that you had a problem and gave you no way
-- to act on it: you cannot tell from a uuid which organisation is the real
-- school and which two are abandoned attempts, so the next step was a manual
-- cross-reference against organisation_groups.
--
-- It now names everything, and says outright which rows to remove.
--
-- Dropped rather than replaced: CREATE OR REPLACE VIEW may only append
-- columns, never rename or reorder the existing ones, so changing the shape of
-- a view means dropping it. That also resets its privileges to the schema
-- defaults, which is why the REVOKE at the bottom has to be repeated here —
-- without it a recreated view is handed back to anon and authenticated.

DROP VIEW IF EXISTS public.users_with_multiple_roles;

CREATE VIEW public.users_with_multiple_roles
WITH (security_invoker = true) AS
WITH held AS (
  SELECT
    ur.user_id,
    count(*) AS role_count,
    string_agg(DISTINCT ur.role::text, ', ' ORDER BY ur.role::text) AS roles,
    array_agg(DISTINCT ur.org_id) FILTER (WHERE ur.org_id IS NOT NULL) AS org_ids
  FROM public.user_roles ur
  GROUP BY ur.user_id
  HAVING count(*) > 1
)
SELECT
  -- Who. Falls back through the profile's name, then its email, then the id,
  -- so an account with an empty profile still identifies itself.
  coalesce(nullif(p.full_name, ''), p.email, h.user_id::text) AS account,
  p.email,
  h.role_count,
  h.roles,

  -- Every organisation this account holds a role in, by name.
  (SELECT string_agg(og.name, ' | ' ORDER BY og.name)
     FROM public.organisation_groups og
    WHERE og.id = ANY (h.org_ids)) AS organisations,

  -- The one they actually land in when they sign in.
  keep_org.name    AS signs_in_to,
  keep_school.name AS signs_in_to_school,

  -- The rest. Unreachable, because the interface has a school switcher and no
  -- organisation switcher — so these are the ones to clear out.
  (SELECT string_agg(og.name, ' | ' ORDER BY og.name)
     FROM public.organisation_groups og
    WHERE og.id = ANY (h.org_ids)
      AND og.id IS DISTINCT FROM pr.org_id) AS unreachable,

  -- Ids last, for the delete itself rather than for reading.
  h.user_id,
  pr.org_id AS keep_org_id,
  (SELECT array_agg(stray)
     FROM unnest(h.org_ids) AS stray
    WHERE stray IS DISTINCT FROM pr.org_id) AS stray_org_ids
FROM held h
LEFT JOIN public.profiles p ON p.user_id = h.user_id
-- LEFT JOIN LATERAL, not CROSS: an account whose rows all carry a null org
-- resolves to nothing, and a CROSS JOIN would silently drop it from the very
-- report meant to surface it.
LEFT JOIN LATERAL public.primary_user_role(h.user_id) pr ON true
LEFT JOIN public.organisation_groups keep_org ON keep_org.id = pr.org_id
LEFT JOIN public.schools keep_school ON keep_school.id = pr.school_id;

COMMENT ON VIEW public.users_with_multiple_roles IS
  'Accounts holding more than one role row. signs_in_to is the organisation '
  'they land in; everything under unreachable / stray_org_ids is abandoned and '
  'safe to remove once checked.';

REVOKE ALL ON public.users_with_multiple_roles FROM anon, authenticated;
