// Starts a real card/bank payment for a school invoice.
//
// The gateway secret keys never leave the server: the browser only ever receives
// the hosted checkout link. Every amount is re-checked against the invoice here,
// so a tampered request cannot under- or over-pay.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Provider = "paystack" | "flutterwave";

function reference() {
  return `PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
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
    const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : null;
    const provider = body.provider === "paystack" || body.provider === "flutterwave"
      ? (body.provider as Provider)
      : null;
    const requested = Number(body.amount);
    const returnUrl = typeof body.return_url === "string" ? body.return_url : null;

    if (!invoiceId || !provider || !Number.isFinite(requested) || requested <= 0) {
      return json({ error: "invoice_id, provider and a positive amount are required" }, 400);
    }

    // Read through the signed-in user's own permissions: if they may not see the
    // invoice, they may not pay it either.
    const { data: invoice } = await userClient
      .from("invoices")
      .select("id, invoice_number, total_amount, amount_paid, student_id, school_id, org_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!invoice) return json({ error: "Invoice not found" }, 404);

    const outstanding = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);
    if (outstanding <= 0) return json({ error: "This invoice is already settled" }, 400);
    const amount = Math.min(Math.round(requested), Math.round(outstanding));

    const service = createClient(SUPABASE_URL, SERVICE_KEY);

    // The school must have switched this gateway on.
    const { data: config } = await service
      .from("payment_gateway_config")
      .select("provider, is_active")
      .eq("org_id", invoice.org_id)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    if (!config) return json({ error: `${provider} is not enabled for this school` }, 400);

    const secret = provider === "paystack"
      ? Deno.env.get("PAYSTACK_SECRET_KEY")
      : Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secret) return json({ error: `${provider} is not configured yet` }, 400);

    const { data: currencyRow } = await service
      .from("schools")
      .select("currency")
      .eq("id", invoice.school_id)
      .maybeSingle();
    const currency = (currencyRow?.currency as string) || "NGN";

    const gatewayReference = reference();
    const email = user.email || "no-reply@example.com";

    const { error: txError } = await service.from("payment_transactions").insert({
      school_id: invoice.school_id,
      student_id: invoice.student_id,
      invoice_id: invoice.id,
      amount,
      gateway: provider,
      gateway_reference: gatewayReference,
      status: "initiated",
      payer_email: email,
      payer_name: (user.user_metadata?.full_name as string) || email,
    });
    if (txError) return json({ error: txError.message }, 400);

    let checkoutUrl: string | null = null;

    if (provider === "paystack") {
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          amount: amount * 100, // Paystack charges in kobo/cents
          currency,
          reference: gatewayReference,
          callback_url: returnUrl,
          metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.data?.authorization_url) {
        await service.from("payment_transactions").update({ status: "failed" }).eq(
          "gateway_reference",
          gatewayReference,
        );
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
          meta: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
          customizations: { title: `Invoice ${invoice.invoice_number}` },
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.data?.link) {
        await service.from("payment_transactions").update({ status: "failed" }).eq(
          "gateway_reference",
          gatewayReference,
        );
        return json({ error: payload?.message || "Flutterwave could not start this payment" }, 400);
      }
      checkoutUrl = payload.data.link;
    }

    await service.from("payment_transactions").update({ status: "pending" }).eq(
      "gateway_reference",
      gatewayReference,
    );

    return json({ checkout_url: checkoutUrl, reference: gatewayReference, amount });
  } catch (error) {
    console.error("initiate-payment failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
