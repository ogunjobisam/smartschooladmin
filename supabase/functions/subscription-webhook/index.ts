// Confirms gateway payments for SmartSchoolAdmin subscriptions and SMS bundles.
//
// Called two ways: by the gateway's webhook (signature checked) and by the app
// when a payer returns from checkout (reference re-verified with the gateway).
// Both paths finish through the same idempotent step, so a duplicate call never
// double-activates a plan or double-tops-up SMS.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const service = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha512(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ask the gateway whether this reference really was paid. */
async function verifyWithGateway(provider: string, reference: string) {
  if (provider === "paystack") {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return null;
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const payload = await res.json();
    if (!res.ok || payload?.data?.status !== "success") return null;
    return { amount: Number(payload.data.amount) / 100 };
  }

  const secret = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  if (!secret) return null;
  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const payload = await res.json();
  if (!res.ok || payload?.data?.status !== "successful") return null;
  return { amount: Number(payload.data.amount) };
}

/** Activate a plan or add SMS credits once. Safe to call repeatedly. */
async function finalisePayment(reference: string, provider: string) {
  const { data: pay } = await service
    .from("platform_payments")
    .select("id, org_id, amount, currency, purpose, plan_code, academic_period_id, sms_credits, status, gateway")
    .eq("gateway_reference", reference)
    .maybeSingle();

  if (!pay) return { ok: false, reason: "unknown_reference" };
  if (pay.status === "successful") return { ok: true, reason: "already_recorded" };

  const verified = await verifyWithGateway(provider || pay.gateway, reference);
  if (!verified) {
    await service.from("platform_payments").update({ status: "failed" }).eq("id", pay.id);
    return { ok: false, reason: "not_paid" };
  }

  // Sanity check: the amount actually paid must match what we asked for.
  if (Math.abs(Number(verified.amount) - Number(pay.amount)) > 0.01) {
    await service.from("platform_payments").update({ status: "failed" }).eq("id", pay.id);
    return { ok: false, reason: "amount_mismatch" };
  }

  if (pay.purpose === "subscription" && pay.plan_code) {
    await service.rpc("activate_subscription", {
      _org_id: pay.org_id,
      _plan_code: pay.plan_code,
      _period_id: pay.academic_period_id,
    });
  } else if (pay.purpose === "sms_bundle" && pay.sms_credits) {
    await service.rpc("add_sms_credits", { _org_id: pay.org_id, _credits: pay.sms_credits });
  } else {
    await service.from("platform_payments").update({ status: "failed" }).eq("id", pay.id);
    return { ok: false, reason: "unknown_purpose" };
  }

  await service.from("platform_payments")
    .update({ status: "successful", updated_at: new Date().toISOString() })
    .eq("id", pay.id);

  return { ok: true, reason: "recorded", amount: Number(pay.amount) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = await req.text();
    const paystackSignature = req.headers.get("x-paystack-signature");
    const flutterwaveHash = req.headers.get("verif-hash");
    const payload = raw ? JSON.parse(raw) : {};

    // 1. Paystack webhook
    if (paystackSignature) {
      const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!secret) return json({ error: "Paystack not configured" }, 400);
      const expected = await hmacSha512(secret, raw);
      if (expected !== paystackSignature) return json({ error: "Invalid signature" }, 401);
      if (payload?.event !== "charge.success") return json({ ignored: true });
      const result = await finalisePayment(payload.data?.reference, "paystack");
      return json(result);
    }

    // 2. Flutterwave webhook
    if (flutterwaveHash) {
      const expected = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
      if (!expected || flutterwaveHash !== expected) return json({ error: "Invalid signature" }, 401);
      const reference = payload?.data?.tx_ref || payload?.txRef;
      if (!reference) return json({ ignored: true });
      const result = await finalisePayment(reference, "flutterwave");
      return json(result);
    }

    // 3. The payer just returned from checkout: confirm with the gateway.
    const reference = typeof payload?.reference === "string" ? payload.reference : null;
    const provider = typeof payload?.provider === "string" ? payload.provider : "";
    if (!reference) return json({ error: "reference is required" }, 400);

    const result = await finalisePayment(reference, provider);
    return json(result, result.ok ? 200 : 400);
  } catch (error) {
    console.error("subscription-webhook failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
