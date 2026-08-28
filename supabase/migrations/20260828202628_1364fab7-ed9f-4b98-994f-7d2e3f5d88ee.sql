-- The app and its security layer could disagree about which organisation you
-- are in, and everything looked linked while nothing worked.
--
-- Three functions each answered "which org/school is this user in", and each
-- answered it differently:
--
--   get_my_role()        ORDER BY ... created_at   -- what AuthContext reads
--   get_user_org_id()    LIMIT 1, no ORDER BY      -- what 212 RLS policies read
--   get_user_school_id() LIMIT 1, no ORDER BY
--
-- For anyone holding a single user_roles row they agree by luck. For anyone
-- holding two — a proprietor who ran onboarding twice, someone invited to a
-- second school — LIMIT 1 with no ORDER BY returns whichever row Postgres
-- happens to reach first. That is physical heap order: it changes after an
-- ordinary UPDATE to a role row, after a VACUUM, or when the planner picks a
-- different path.
--
-- Reproduced against Postgres 16: with two organisations on one account, one
-- UPDATE to the older role row flipped get_user_org_id() to the second
-- organisation while get_my_role() stayed on the first. AuthContext then
-- filters every query by org A while RLS evaluates org B, so every read
-- returns nothing and every write silently matches no rows. PostgREST reports
-- neither as an error — an UPDATE that changes nothing is a success — so the
-- app cheerfully says "School profile updated" and nothing has changed.
--
-- The fix is one definition, and the other three read from it.

-- ---------------------------------------------------------------------------
-- The one definition
-- ---------------------------------------------------------------------------
-- Prefers a row that carries an organisation, then one that carries a school,
-- then the most recently granted. Most recent, not oldest: a role granted
-- today is the one you are meant to be using, and the previous ordering landed
-- someone who had just created a school back in an older, empty one.
--
-- The trailing id keeps it total, so two rows created in the same transaction
-- still resolve the same way on every call.
CREATE OR REPLACE FUNCTION public.primary_user_role(_user_id uuid)
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY (org_id IS NULL), (school_id IS NULL), created_at DESC, id
  LIMIT 1
$$;

COMMENT ON FUNCTION public.primary_user_role(uuid) IS
  'The single answer to "which org and school is this user in". get_my_role, '
  'get_user_org_id and get_user_school_id all delegate here so the app and RLS '
  'can never disagree.';

-- ---------------------------------------------------------------------------
-- The three that used to answer for themselves
-- ---------------------------------------------------------------------------
-- Signatures and return types are unchanged, so all 212 policy references keep
-- working untouched; only the answer becomes consistent.
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.primary_user_role(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.get_user_school_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.primary_user_role(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TABLE(role app_role, org_id uuid, school_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, org_id, school_id FROM public.primary_user_role(auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Make the anomaly visible
-- ---------------------------------------------------------------------------
-- Holding two role rows is not something this product supports: there is a
-- school switcher but no organisation switcher, so the second organisation is
-- unreachable from the interface no matter which one wins above. A unique
-- index would be the real answer, but existing accounts already carry
-- duplicates and a failing migration helps nobody — so record it as a view an
-- operator can check, and let setup-organisation stop new ones being made.
CREATE OR REPLACE VIEW public.users_with_multiple_roles AS
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

-- ---------------------------------------------------------------------------
-- Let a school admin edit their own school's profile
-- ---------------------------------------------------------------------------
-- The settings page offers the school name, email, phone and address to
-- principals and school admins, but the only write policy on schools is
-- "Admins can manage schools", which is proprietor and group_admin. So those
-- two roles got editable boxes and a Save button that could not save — and
-- because a blocked UPDATE is not an error, it said it had worked.
--
-- The interface is right about the intent: whoever runs a school should be
-- able to correct its phone number. This grants exactly that and no more —
-- UPDATE only, on their own school only. Creating and deleting schools stays
-- with the proprietor, under the existing FOR ALL policy.
DROP POLICY IF EXISTS "School leads can update their own school" ON public.schools;
CREATE POLICY "School leads can update their own school"
ON public.schools FOR UPDATE TO authenticated
USING (
  id = public.get_user_school_id(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'school_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
  )
)
WITH CHECK (
  id = public.get_user_school_id(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'school_admin'::app_role)
    OR public.has_role(auth.uid(), 'principal'::app_role)
  )
);