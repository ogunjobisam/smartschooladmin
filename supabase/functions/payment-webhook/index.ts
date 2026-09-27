// Confirms gateway payments and turns them into a payment, an allocation and a
// receipt — the same records the office creates by hand.
//
// Called two ways: by the gateway's webhook (signature checked) and by the app
// when a payer returns from checkout (reference re-verified with the gateway).
// Both paths finish through the same idempotent step, so a duplicate call never
// double-credits an invoice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { timingSafeEqual } from "../_shared/abuse.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const service = createClient(SUPABASE_URL, SERVICE_KEY);

/** How long a claim on a payment holds before another request may retake it. */
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

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

/** Ask the gateway itself whether this reference really was paid. */
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

/** Queue receipt emails to the pupil's guardians. */
async function emailReceipt(params: {
  orgId: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  amount: number;
  currency: string;
  receiptNumber: string;
  invoiceNumber: string;
  balance: number;
}) {
  const { data: links } = await service
    .from("student_guardians")
    .select("guardians(email, first_name, last_name)")
    .eq("student_id", params.studentId);

  const money = (value: number) =>
    `${params.currency} ${value.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const rows = (links || [])
    .map((l) => l.guardians as { email: string | null; first_name: string; last_name: string } | null)
    .filter((g): g is { email: string; first_name: string; last_name: string } => !!g?.email)
    .map((g) => ({
      org_id: params.orgId,
      school_id: params.schoolId,
      channel: "email",
      recipient: g.email,
      subject: `Payment received — receipt ${params.receiptNumber}`,
      body:
        `Dear ${g.first_name} ${g.last_name},\n\nWe have received ${money(params.amount)} towards ` +
        `${params.studentName}'s fees for invoice ${params.invoiceNumber}.\n\n` +
        `Receipt number: ${params.receiptNumber}\nRemaining balance: ${money(params.balance)}\n\n` +
        `Thank you. Your receipt can also be downloaded from the parent portal.`,
      status: "queued",
      entity_type: "payment",
    }));

  if (rows.length > 0) await service.from("outbound_message_queue").insert(rows);
}

/**
 * Records a confirmed payment once. Safe to call repeatedly: a transaction that
 * is already marked successful is left alone.
 */
async function finalisePayment(reference: string, provider: string) {
  const { data: tx } = await service
    .from("payment_transactions")
    .select("id, school_id, student_id, invoice_id, amount, status, gateway")
    .eq("gateway_reference", reference)
    .maybeSingle();

  if (!tx) return { ok: false, reason: "unknown_reference" };
  if (tx.status === "successful") return { ok: true, reason: "already_recorded" };

  const verified = await verifyWithGateway(provider || tx.gateway, reference);
  if (!verified) {
    await service.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id);
    return { ok: false, reason: "not_paid" };
  }

  // Claim the transaction before recording anything. The status check above is
  // not enough on its own: the gateway's webhook and the parent's return page
  // (or a parent replaying it) can arrive together, all see "not successful",
  // and each credit the invoice. This UPDATE is a single statement, so only one
  // request can move claimed_at off null; the others back off. Claiming only
  // after the gateway confirms payment means an early "not paid yet" does not
  // block the webhook that follows, and a stale claim can be retaken so a
  // request that died mid-way does not strand the payment.
  const staleClaim = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();
  const { data: claimed } = await service
    .from("payment_transactions")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", tx.id)
    .neq("status", "successful")
    .or(`claimed_at.is.null,claimed_at.lt.${staleClaim}`)
    .select("id");
  if (!claimed?.length) return { ok: true, reason: "already_recorded" };
  const releaseClaim = () =>
    service.from("payment_transactions").update({ claimed_at: null }).eq("id", tx.id);

  const amount = Math.min(Number(tx.amount), verified.amount);

  const { data: invoice } = await service
    .from("invoices")
    .select("id, invoice_number, total_amount, amount_paid, school_id, student_id")
    .eq("id", tx.invoice_id!)
    .maybeSingle();
  if (!invoice) {
    await releaseClaim();
    return { ok: false, reason: "invoice_missing" };
  }

  const { data: payment } = await service
    .from("payments")
    .insert({
      school_id: tx.school_id,
      student_id: tx.student_id,
      amount,
      payment_method: "online",
      reference_number: reference,
      notes: `Online payment via ${provider || tx.gateway} — ${invoice.invoice_number}`,
    })
    .select("id")
    .single();

  if (!payment) {
    await releaseClaim();
    return { ok: false, reason: "payment_insert_failed" };
  }

  await service.from("payment_allocations").insert({
    payment_id: payment.id,
    invoice_id: invoice.id,
    amount,
  });

  const newPaid = Number(invoice.amount_paid || 0) + amount;
  await service
    .from("invoices")
    .update({
      amount_paid: newPaid,
      status: newPaid >= Number(invoice.total_amount) ? "paid" : "pending",
    })
    .eq("id", invoice.id);

  const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;
  await service.from("receipts").insert({
    school_id: tx.school_id,
    payment_id: payment.id,
    receipt_number: receiptNumber,
    student_id: tx.student_id,
    amount,
  });

  await service
    .from("payment_transactions")
    .update({ status: "successful", updated_at: new Date().toISOString() })
    .eq("id", tx.id);

  const [{ data: student }, { data: school }] = await Promise.all([
    service.from("students").select("first_name, last_name").eq("id", tx.student_id!).maybeSingle(),
    service
      .from("schools")
      .select("org_id, organisation_groups(currency)")
      .eq("id", tx.school_id!)
      .maybeSingle(),
  ]);

  await emailReceipt({
    orgId: school!.org_id,
    schoolId: tx.school_id!,
    studentId: tx.student_id!,
    studentName: student ? `${student.first_name} ${student.last_name}` : "your child",
    amount,
    currency: (school?.organisation_groups as { currency?: string } | null)?.currency || "NGN",
    receiptNumber,
    invoiceNumber: invoice.invoice_number,
    balance: Math.max(0, Number(invoice.total_amount) - newPaid),
  });

  return { ok: true, reason: "recorded", receipt_number: receiptNumber, amount };
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
      if (!timingSafeEqual(expected, paystackSignature)) return json({ error: "Invalid signature" }, 401);
      if (payload?.event !== "charge.success") return json({ ignored: true });
      const result = await finalisePayment(payload.data?.reference, "paystack");
      return json(result);
    }

    // 2. Flutterwave webhook
    if (flutterwaveHash) {
      const expected = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
      if (!expected || !timingSafeEqual(flutterwaveHash, expected)) return json({ error: "Invalid signature" }, 401);
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
    console.error("payment-webhook failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
