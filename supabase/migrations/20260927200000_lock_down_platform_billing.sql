-- Platform billing is the service role's alone.
--
-- activate_subscription, add_sms_credits and charge_sms are SECURITY DEFINER
-- and check nobody: they trust the subscription webhook to have verified a
-- payment with the gateway first. They were never revoked, so they kept the
-- default EXECUTE for PUBLIC, and the public anon key alone could give any
-- organisation a premium plan or unlimited SMS credits, or drain another
-- organisation's SMS balance. Only the webhook and the queue processor call
-- them, and both use the service role.
--
-- Safe to run twice: REVOKE, GRANT and DROP POLICY IF EXISTS are idempotent.

REVOKE ALL ON FUNCTION public.activate_subscription(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_sms_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_sms(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_sms_credits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_sms(uuid, uuid, text) TO service_role;

-- The subscription webhook reads the platform_payments row to decide what was
-- bought: the price it checks against the gateway, the plan, the credit count.
-- Owners could insert that row themselves, so a one-naira payment reference
-- could be paired with ten million SMS credits. Payments are started by the
-- initiate-subscription-payment edge function, which prices them on the server
-- and inserts with the service role, so clients need no write access at all.
-- Owners keep SELECT, through the policy of that name.
DROP POLICY IF EXISTS "Org owners create a payment" ON public.platform_payments;
REVOKE INSERT, UPDATE, DELETE ON public.platform_payments FROM anon, authenticated;
