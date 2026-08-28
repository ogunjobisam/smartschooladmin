-- Make a fresh replay end on the same primary_user_role the live database runs.
--
-- The platform's multi-org work redefined primary_user_role() to rank by
-- seniority first (role_rank), so a teacher who is also a parent is gated as
-- staff, not as a parent. Good change — but it was recorded under a timestamp
-- (20260828221259) that sorts BEFORE 20260829120000, which also defines the
-- function. So the two orders disagree:
--
--   live (wall-clock):  20260829120000 ran first, 20260828221259 ran later
--                       → the ranked version is in force
--   fresh replay:       filename order runs 20260828221259 first
--                       → 20260829120000 quietly puts the unranked version back
--
-- This is the same failure shape as the security_invoker view: a fix-up
-- recorded earlier than the thing it fixes, undone on every fresh project.
-- The consequence here is behavioural, not cosmetic — under the unranked
-- definition a teacher-who-is-also-a-parent can resolve as parent, and
-- get_user_org_id/get_user_school_id/get_my_role all read through this
-- function, so the app and 212 policy references would gate them wrong.
--
-- Re-asserting the ranked definition under a timestamp later than both makes
-- every ordering converge. Verbatim the platform's version; idempotent.
CREATE OR REPLACE FUNCTION public.primary_user_role(_user_id uuid)
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY public.role_rank(role), (org_id IS NULL), (school_id IS NULL), created_at DESC, id
  LIMIT 1
$$;
