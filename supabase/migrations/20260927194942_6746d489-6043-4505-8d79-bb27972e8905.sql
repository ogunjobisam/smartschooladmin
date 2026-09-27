-- The SMS delivery pipeline, ready for a provider.
--
-- process-message-queue can now plan and send an SMS end to end through an
-- SmsProvider (supabase/functions/_shared/sms.ts). No real provider is wired
-- yet: SMS_PROVIDER=sandbox records sends as 'simulated' without delivering or
-- charging, and anything else leaves SMS queued as before. This migration is
-- the database half.
--
--   * Credits are charged per part. A 200-character text is two texts to the
--     carrier and must cost two credits; charge_sms() charged one per message.
--   * The queue reserves credits before a send and refund_sms() returns them if
--     the provider then fails, so a school can never send beyond its balance.
--   * charge_sms() was executable by PUBLIC: anyone, signed in or not, could
--     spend any organisation's prepaid credits by calling it with its id. It and
--     refund_sms() are now for the service role only — the queue is their one
--     caller.
--   * The queue row and the usage log record the provider, its message id and
--     the parts charged, so a school can reconcile against the provider's bill.
--
-- Safe to run twice: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.

ALTER TABLE public.outbound_message_queue
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS sms_parts integer;

COMMENT ON COLUMN public.outbound_message_queue.provider IS
  'Who carried the message: sandbox (simulated, never delivered), or a real provider.';
COMMENT ON COLUMN public.outbound_message_queue.sms_parts IS
  'Parts the SMS is billed as — the credits it cost, or would have cost in the sandbox.';

ALTER TABLE public.sms_usage_log
  ADD COLUMN IF NOT EXISTS parts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

-- The three-argument version is replaced, not overloaded: with both present a
-- three-argument call would be ambiguous.
DROP FUNCTION IF EXISTS public.charge_sms(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.charge_sms(
  _org_id uuid,
  _queue_id uuid,
  _recipient text,
  _parts integer DEFAULT 1,
  _provider text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  charged boolean;
BEGIN
  IF _parts IS NULL OR _parts < 1 THEN
    RAISE EXCEPTION 'An SMS costs at least one part';
  END IF;

  -- One statement, so two queue drains cannot both spend the last credits.
  UPDATE public.sms_credit_balances
    SET balance = balance - _parts, updated_at = now()
    WHERE org_id = _org_id AND balance >= _parts
    RETURNING true INTO charged;

  IF charged THEN
    INSERT INTO public.sms_usage_log (org_id, queue_id, recipient, parts, provider)
      VALUES (_org_id, _queue_id, _recipient, _parts, _provider);
  END IF;
  RETURN coalesce(charged, false);
END;
$$;

-- Gives back what a queue row was charged, when the provider did not take the
-- message. Deleting the log rows is what makes a second refund a no-op.
CREATE OR REPLACE FUNCTION public.refund_sms(_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  refunded integer := 0;
  r record;
BEGIN
  FOR r IN
    DELETE FROM public.sms_usage_log WHERE queue_id = _queue_id RETURNING org_id, parts
  LOOP
    UPDATE public.sms_credit_balances
      SET balance = balance + r.parts, updated_at = now()
      WHERE org_id = r.org_id;
    refunded := refunded + r.parts;
  END LOOP;
  RETURN refunded;
END;
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default, so revoking from PUBLIC alone would not be enough.
REVOKE ALL ON FUNCTION public.charge_sms(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_sms(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_sms(uuid, uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_sms(uuid) TO service_role;