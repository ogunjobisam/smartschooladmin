// Starts a real payment for a SmartSchoolAdmin subscription term or an SMS
// bundle. The gateway secret keys never leave the server: the browser only
// receives the hosted checkout link. Every amount is re-computed server-side
// from the plan price and the org's actual student count, so a tampered
// request cannot under- or over-pay.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Provider = "paystack" | "flutterwave";

// SMS bundles priced in NGN. Re-validated here so the client cannot change the price.
const SMS_BUNDLES: Record<number, number> = {
  400: 2000,
  2000: 8000,
  5000: 18000,
};

// Plan prices in NGN, per student per term. Mirror of the seeded rows.
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  standard: 300,
  premium: 450,
};

function reference() {
  return `SUB-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const body = await req.json().catch(() => ({}));
    const purpose = body.purpose === "subscription" || body.purpose === "sms_bundle" ? body.purpose : null;
    const provider = body.provider === "paystack" || body.provider === "flutterwave" ? (body.provider as Provider) : null;
    const returnUrl = typeof body.return_url === "string" ? body.return_url : null;

    if (!purpose || !provider || !returnUrl) {
      return json({ error: "purpose, provider and return_url are required" }, 400);
    }

    const service = createClient(SUPABASE_URL, SERVICE_KEY);

    // The org id belongs to the signed-in user; read it through their own RLS.
    const { data: myRoles } = await userClient.rpc("get_my_roles");
    const rows = (Array.isArray(myRoles) ? myRoles : myRoles ? [myRoles] : []) as { org_id: string | null }[];
    const orgId = rows.find((r) => r.org_id)?.org_id;
    if (!orgId) return json({ error: "No organisation found for this account" }, 400);

    // The org must have switched this gateway on for online payments.
    const { data: config } = await service
      .from("payment_gateway_config")
      .select("provider, is_active")
      .eq("org_id", orgId)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    if (!config) return json({ error: `${provider} is not enabled for your school` }, 400);

    const secret = provider === "paystack"
      ? Deno.env.get("PAYSTACK_SECRET_KEY")
      : Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secret) return json({ error: `${provider} is not configured yet` }, 400);

    const { data: org } = await service
      .from("organisation_groups")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    // Platform billing is always priced in NGN (₦300/₦450 per student), so the
    // charge is NGN regardless of the org's own invoice currency — Paystack would
    // reject GBP anyway.
    const currency = "NGN";
    const orgName = org?.name || "School";

    // Billable student count for the org's current term, via the SECURITY DEFINER fn.
    const { data: countRows } = await service.rpc("org_current_student_count", { _org_id: orgId });
    const studentCount = (Array.isArray(countRows) ? countRows[0] : countRows) ?? 0;

    // The current academic period for this org.
    const { data: period } = await service
      .from("academic_periods")
      .select("id, academic_years!inner(org_id)")
      .eq("academic_years.org_id", orgId)
      .eq("is_current", true)
      .maybeSingle();
    const periodId = period?.id ?? null;

    let amount = 0;
    let planCode: string | null = null;
    let smsCredits: number | null = null;

    if (purpose === "subscription") {
      planCode = typeof body.plan_code === "string" ? body.plan_code : null;
      if (!planCode || !(planCode in PLAN_PRICES)) return json({ error: "Unknown plan" }, 400);
      if (planCode === "free") return json({ error: "The Free plan has no charge" }, 400);
      amount = PLAN_PRICES[planCode] * Math.max(0, Number(studentCount) || 0);
      if (amount <= 0) return json({ error: "You have no enrolled students this term" }, 400);
    } else {
      smsCredits = Number(body.sms_credits);
      const bundlePrice = SMS_BUNDLES[smsCredits];
      if (!bundlePrice) return json({ error: "Pick a valid SMS bundle (400, 2000 or 5000)" }, 400);
      amount = bundlePrice;
    }

    const gatewayReference = reference();
    const email = user.email || "no-reply@example.com";

    const { error: payError } = await service.from("platform_payments").insert({
      org_id: orgId,
      gateway: provider,
      gateway_reference: gatewayReference,
      amount,
      currency,
      purpose,
      plan_code: planCode,
      academic_period_id: periodId,
      sms_credits: smsCredits,
      status: "initiated",
      payer_email: email,
      payer_name: (user.user_metadata?.full_name as string) || email,
    });
    if (payError) return json({ error: payError.message }, 400);

    let checkoutUrl: string | null = null;
    const metadata: Record<string, unknown> = { purpose, org_id: orgId };
    if (planCode) metadata.plan_code = planCode;
    if (smsCredits) metadata.sms_credits = smsCredits;

    if (provider === "paystack") {
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amount: amount * 100, // kobo
          currency,
          reference: gatewayReference,
          callback_url: returnUrl,
          metadata,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.data?.authorization_url) {
        await service.from("platform_payments").update({ status: "failed" }).eq("gateway_reference", gatewayReference);
        return json({ error: payload?.message || "Paystack could not start this payment" }, 400);
      }
      checkoutUrl = payload.data.authorization_url;
    } else {
      const res = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_ref: gatewayReference,
          amount,
          currency,
          redirect_url: returnUrl,
          customer: { email },
          meta: metadata,
          customizations: { title: `${orgName} — ${purpose === "subscription" ? "Plan" : "SMS bundle"}` },
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.data?.link) {
        await service.from("platform_payments").update({ status: "failed" }).eq("gateway_reference", gatewayReference);
        return json({ error: payload?.message || "Flutterwave could not start this payment" }, 400);
      }
      checkoutUrl = payload.data.link;
    }

    await service.from("platform_payments").update({ status: "pending" }).eq("gateway_reference", gatewayReference);

    return json({ checkout_url: checkoutUrl, reference: gatewayReference, amount });
  } catch (error) {
    console.error("initiate-subscription-payment failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
