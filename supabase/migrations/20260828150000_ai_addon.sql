-- AI analysis add-on: per-organisation entitlement and usage metering.
--
-- The add-on is sold separately, so an organisation has to be switched on
-- explicitly and every call is recorded against a monthly allowance. Metering
-- lives here rather than in the app so it cannot be bypassed by calling the
-- edge function directly.

ALTER TABLE public.organisation_groups
  ADD COLUMN IF NOT EXISTS ai_addon_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_monthly_limit integer NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.organisation_groups.ai_addon_enabled IS
  'Whether the paid AI analysis add-on is active for this organisation.';
COMMENT ON COLUMN public.organisation_groups.ai_monthly_limit IS
  'Maximum AI analyses this organisation may run per calendar month.';

-- One row per AI analysis attempt, successful or not.
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisation_groups(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  analysis_type text NOT NULL,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'succeeded',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created
  ON public.ai_usage_events(org_id, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Readable by the people who would be billed for it. Writes come from the edge
-- function using the service role key, so there is deliberately no INSERT policy.
CREATE POLICY "Admins can view their org's AI usage"
ON public.ai_usage_events FOR SELECT TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'proprietor')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'group_admin')
    OR public.has_role(auth.uid(), 'school_admin')
  )
);

-- Analyses used in the current calendar month, for the usage meter in the UI.
CREATE OR REPLACE FUNCTION public.ai_usage_this_month(_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.ai_usage_events
  WHERE org_id = _org_id
    AND status = 'succeeded'
    AND created_at >= date_trunc('month', now())
$$;

-- Entitlement plus remaining allowance in one call, so the UI does not have to
-- reason about the limit itself.
CREATE OR REPLACE FUNCTION public.my_ai_entitlement()
RETURNS TABLE(enabled boolean, used integer, monthly_limit integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    og.ai_addon_enabled,
    public.ai_usage_this_month(og.id),
    og.ai_monthly_limit
  FROM public.organisation_groups og
  WHERE og.id = public.get_user_org_id(auth.uid())
$$;
