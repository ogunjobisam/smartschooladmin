DROP FUNCTION IF EXISTS public.my_ai_entitlement();

CREATE OR REPLACE FUNCTION public.my_ai_entitlement()
 RETURNS TABLE(enabled boolean, used integer, monthly_limit integer, has_addon boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    true,
    public.ai_usage_this_month(og.id),
    CASE WHEN og.ai_addon_enabled THEN GREATEST(og.ai_monthly_limit, 5) ELSE 5 END,
    og.ai_addon_enabled
  FROM public.organisation_groups og
  WHERE og.id = public.get_user_org_id(auth.uid())
$function$;

REVOKE EXECUTE ON FUNCTION public.my_ai_entitlement() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_ai_entitlement() TO authenticated;