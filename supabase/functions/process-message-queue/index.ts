import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailAPIError, sendLovableEmail } from "npm:@lovable.dev/email-js";
import { classifyEmailFailure } from "../_shared/email-result.ts";
import { formatSender, replyToAddress } from "../_shared/sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Rows are retried this many times before being left alone. */
const MAX_ATTEMPTS = 5;
/** Sending is sequential, so keep a batch small enough to finish inside the request. */
const BATCH_SIZE = 50;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface QueueRow {
  id: string;
  org_id: string;
  school_id: string | null;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  reply_to: string | null;
  attempts: number;
}

/** The From name and Reply-To for one message, resolved before sending. */
interface Sender {
  /** Display name — the school this message is from. */
  name: string | null;
  /** Where a reply should go, or null to omit the header. */
  replyTo: string | null;
  /** School branding, so the email looks like it came from the school. */
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  address?: string | null;
  phone?: string | null;
}

/**
 * Four distinct outcomes, because they need different bookkeeping:
 *
 *  - sent          delivered, done
 *  - retry         transient (rate limit, provider 5xx) — costs an attempt
 *  - failed        permanent (bad address, rejected sender) — give up now
 *  - unconfigured  no provider wired up yet — costs no attempt, or a school
 *                  that has not set up email would exhaust every message's
 *                  retries and mark the whole queue failed
 */
type SendResult =
  | { status: "sent" }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string }
  | { status: "unconfigured"; error: string };

/**
 * Resend's built-in sender, used when no verified one is configured.
 *
 * It lets a school prove the pipe works with nothing but an API key, but it only
 * delivers to the address that owns the Resend account — everyone else is
 * refused with a 403. That refusal is classified as `unconfigured`, so those
 * messages wait rather than dying.
 */
const DEFAULT_FROM = "onboarding@resend.dev";

/**
 * The platform's own verified sending domain.
 *
 * Set up once for the whole platform, so no school does DNS work: mail goes out
 * as `Grace Academy <notifications@notify.smartschooladmin.app>` with the
 * school's own address as Reply-To.
 */
const SENDER_DOMAIN = "notify.smartschooladmin.app";
const PLATFORM_FROM = `notifications@${SENDER_DOMAIN}`;
const PLATFORM_NAME = "SmartSchoolAdmin";

/** Delivery through the managed platform email service. */
async function sendManaged(
  row: QueueRow,
  sender: Sender,
  apiKey: string,
  unsubscribeToken: string,
): Promise<SendResult> {
  const replyTo = replyToAddress(sender.replyTo);
  const subject = row.subject || "A message from your school";
  try {
    await sendLovableEmail(
      {
        to: row.recipient,
        from: { name: sender.name || PLATFORM_NAME, address: PLATFORM_FROM },
        sender_domain: SENDER_DOMAIN,
        subject,
        text: row.body,
        html: brandedEmailHtml(row.body, subject, sender),
        purpose: "transactional",
        label: "school-alert",
        // The attempt number is part of the key: a retry after a failed send is a
        // genuinely new send, and reusing the key would be refused outright.
        idempotency_key: `queue-${row.id}-${row.attempts}`,
        // Required for every send: it is what makes the one-click unsubscribe
        // in the message header work, and the provider rejects sends without it.
        unsubscribe_token: unsubscribeToken,
        ...(replyTo ? { reply_to: replyTo } : {}),
      },
      { apiKey },
    );
    return { status: "sent" };
  } catch (err) {
    if (err instanceof EmailAPIError) {
      const error = `Email API ${err.status}: ${err.message}`.slice(0, 400);
      if (err.code === "recipient_suppressed") {
        return { status: "failed", error: `${error} — recipient has unsubscribed or bounced.` };
      }
      return { status: err.retryable ? "retry" : "failed", error };
    }
    return { status: "retry", error: err instanceof Error ? err.message : "Send failed" };
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

function brandColor(value: string | null | undefined, fallback: string): string {
  const raw = String(value ?? "").trim();
  return HEX.test(raw) ? raw : fallback;
}

function readableOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0f172a" : "#ffffff";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Queued alerts are plain text, but the email a parent opens should still look
 * like it came from their school: the school's logo or monogram, its own colour
 * on the header band, and its contact details in the footer.
 */
function brandedEmailHtml(body: string, subject: string, sender: Sender): string {
  const brand = brandColor(sender.primaryColor, "#0f172a");
  const accent = brandColor(sender.accentColor, "#3b82f6");
  const onBrand = readableOn(brand);
  const name = sender.name || PLATFORM_NAME;

  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1f2937">${p.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const crest = sender.logoUrl
    ? `<img src="${escapeHtml(sender.logoUrl)}" alt="" width="44" height="44" style="display:block;border-radius:10px;background:#fff;border:0" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:rgba(255,255,255,.18);color:${onBrand};font:700 20px/44px Helvetica,Arial,sans-serif;text-align:center">${escapeHtml(
        name.charAt(0).toUpperCase(),
      )}</div>`;

  const footerBits = [sender.address, sender.phone, sender.replyTo].filter(Boolean).map((v) => escapeHtml(String(v)));

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>${escapeHtml(
    subject,
  )}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f6fa;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.06)">
    <tr><td style="padding:20px 26px;background:${brand}">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px">${crest}</td>
        <td style="color:${onBrand};font-size:17px;font-weight:700;letter-spacing:.01em">${escapeHtml(name)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:${accent}"></td></tr>
    <tr><td style="padding:26px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8">School update</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(subject)}</h1>
      ${paragraphs}
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebf1">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#7c8798">${escapeHtml(name)}${
        footerBits.length ? ` &middot; ${footerBits.join(" &middot; ")}` : ""
      }</p>
      <p style="margin:6px 0 0;font-size:11px;color:#a3adbb">You are receiving this because your contact details are on record with the school.</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Email delivery.
 *
 * The platform's managed sending domain is used whenever it is available, so
 * schools need no provider account of their own. Resend stays as a fallback for
 * deployments that were wired to it before.
 */
async function sendEmail(
  row: QueueRow,
  sender: Sender,
  unsubscribeToken: string | null,
): Promise<SendResult> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    if (!unsubscribeToken) {
      return { status: "retry", error: "Could not prepare the unsubscribe link for this recipient." };
    }
    return await sendManaged(row, sender, lovableKey, unsubscribeToken);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  // A missing sender is no longer a blocker: without this default, setting only
  // RESEND_API_KEY left the whole queue "unconfigured" with nothing to say why.
  const from = Deno.env.get("NOTIFICATIONS_FROM_EMAIL") || DEFAULT_FROM;

  if (!apiKey) {
    return {
      status: "unconfigured",
      error: "No email provider configured.",
    };
  }

  // One platform domain sends for every school: the school's name goes on the
  // From line, and a reply reaches the school rather than the platform.
  const replyTo = replyToAddress(sender.replyTo);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: formatSender(sender.name, from),
      to: [row.recipient],
      subject: row.subject || "A message from your school",
      text: row.body,
      html: brandedEmailHtml(row.body, row.subject || "A message from your school", sender),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (response.ok) return { status: "sent" };

  const detail = await response.text();
  const error = `Resend ${response.status}: ${detail.slice(0, 300)}`;

  // An unverified sender refuses every message equally, so it must not burn the
  // backlog — see the note in _shared/email-result.ts.
  const outcome = classifyEmailFailure(response.status, detail);
  if (outcome === "unconfigured") {
    return {
      status: "unconfigured",
      error:
        `${error} — this is a sender problem, not a problem with the message. ` +
        `Messages stay queued until the sender is fixed.`,
    };
  }
  return { status: outcome, error };
}

/**
 * SMS delivery.
 *
 * No provider is wired up yet, so SMS is queued but not delivered — deliberately
 * reported rather than silently dropped or marked sent. SMS is how most
 * Nigerian schools actually reach parents, so a queue quietly filling with
 * undelivered texts would be worse than a visible error.
 *
 * Metering: a credit is only deducted from the organisation's prepaid SMS
 * balance when a text is actually delivered. With no provider configured, no
 * credit is ever charged, so schools that buy bundles now are not spending
 * them on messages that never went out. When a provider is added, the success
 * path below calls `charge_sms`; if the balance is empty, the message is left
 * queued with a clear "no SMS credits" error rather than silently dropped.
 */
async function sendSms(
  row: QueueRow,
  admin: ReturnType<typeof createClient>,
): Promise<SendResult> {
  const smsProviderKey =
    Deno.env.get("SMS_PROVIDER") || Deno.env.get("TERMII_API_KEY") || Deno.env.get("AFRICASTALKING_API_KEY");
  if (!smsProviderKey) {
    return {
      status: "unconfigured",
      error: "No SMS provider configured. SMS messages stay queued until one is added.",
    };
  }

  // A real provider exists — guard the org's prepaid balance before sending.
  if (row.org_id) {
    const { data: balance } = await admin
      .from("sms_credit_balances")
      .select("balance")
      .eq("org_id", row.org_id)
      .maybeSingle();
    if (!balance || Number(balance.balance) <= 0) {
      return {
        status: "unconfigured",
        error: "No SMS credits left. Buy a bundle from Billing to resume SMS delivery.",
      };
    }
  }

  // TODO: real provider HTTP call goes here. On a successful delivery:
  //   await admin.rpc("charge_sms", { _org_id: row.org_id, _queue_id: row.id, _recipient: row.recipient });
  // and return { status: "sent" }.
  return {
    status: "unconfigured",
    error: "SMS provider recognised but not yet implemented for delivery.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // Two callers: the scheduler, which drains every organisation, and a
    // signed-in admin draining their own. The scheduler runs inside the database
    // and holds a token kept in the vault, checked here — the service role key
    // is also accepted so a manual admin call still works.
    let isScheduler = token === serviceKey;
    if (!isScheduler && token && !token.includes(".")) {
      const { data: valid } = await admin.rpc("verify_queue_drain_token", { t: token });
      isScheduler = valid === true;
    }
    let orgFilter: string | null = null;

    if (!isScheduler) {
      const { data: { user } } = await createClient(supabaseUrl, anonKey).auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { data: role } = await admin
        .from("user_roles")
        .select("role, org_id")
        .eq("user_id", user.id)
        .in("role", ["super_admin", "proprietor", "group_admin", "school_admin", "principal"])
        .limit(1)
        .maybeSingle();

      if (!role?.org_id) return json({ error: "Your role cannot send queued messages" }, 403);
      orgFilter = role.org_id;
    }

    // Requeue: put failed rows back in the queue so a fixed configuration can
    // deliver them. Nothing else in the app can move a row out of "failed" —
    // there is no UPDATE policy for `authenticated` — so without this a single
    // bad sender setting loses the backlog permanently.
    let requeueRequested = false;
    try {
      const body = await req.json();
      requeueRequested = body?.action === "requeue";
    } catch {
      // No body, or not JSON: a plain drain.
    }

    if (requeueRequested) {
      let reset = admin
        .from("outbound_message_queue")
        .update({ status: "queued", attempts: 0, processed_at: null })
        .eq("status", "failed");
      if (orgFilter) reset = reset.eq("org_id", orgFilter);

      const { data: requeued, error: requeueError } = await reset.select("id");
      if (requeueError) throw requeueError;
      return json({ success: true, requeued: (requeued || []).length });
    }

    let query = admin
      .from("outbound_message_queue")
      .select("id, org_id, school_id, channel, recipient, subject, body, reply_to, attempts")
      .eq("status", "queued")
      .lt("attempts", MAX_ATTEMPTS)
      // Scheduled rows (event reminders) wait until their send time.
      .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
      .order("created_at")
      .limit(BATCH_SIZE);

    if (orgFilter) query = query.eq("org_id", orgFilter);

    const { data: rows, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const pending = (rows || []) as QueueRow[];

    // One lookup for the handful of distinct schools in the batch, rather than
    // a query per message. Names go on the From line; the school's own address
    // is the fallback reply-to for rows queued before reply_to was resolved.
    const schoolIds = [...new Set(pending.map((r) => r.school_id).filter((id): id is string => !!id))];
    const schools = new Map<
      string,
      {
        name: string;
        email: string | null;
        logo_url: string | null;
        primary_color: string | null;
        accent_color: string | null;
        address: string | null;
        phone: string | null;
      }
    >();
    if (schoolIds.length > 0) {
      const { data: schoolRows } = await admin
        .from("schools")
        .select("id, name, email, logo_url, primary_color, accent_color, address, phone")
        .in("id", schoolIds);
      for (const school of schoolRows || []) {
        schools.set(school.id, {
          name: school.name,
          email: school.email,
          logo_url: school.logo_url,
          primary_color: school.primary_color,
          accent_color: school.accent_color,
          address: school.address,
          phone: school.phone,
        });
      }
    }

    // Every message carries a one-click unsubscribe, and the token has to be the
    // same one each time for a given address, so it is stored rather than made
    // up per send. One round trip for the whole batch.
    const recipients = [...new Set(pending.filter((r) => r.channel === "email").map((r) => r.recipient.toLowerCase()))];
    const tokens = new Map<string, string>();
    if (recipients.length > 0) {
      await admin
        .from("email_unsubscribe_tokens")
        .upsert(recipients.map((email) => ({ email })), { onConflict: "email", ignoreDuplicates: true });
      const { data: tokenRows } = await admin
        .from("email_unsubscribe_tokens")
        .select("email, token")
        .in("email", recipients);
      for (const t of tokenRows || []) tokens.set(t.email, t.token);
    }



    let sent = 0;
    let failed = 0;
    let deferred = 0;

    for (const row of pending) {
      const school = row.school_id ? schools.get(row.school_id) : undefined;
      const sender: Sender = {
        name: school?.name ?? null,
        replyTo: row.reply_to ?? school?.email ?? null,
        logoUrl: school?.logo_url ?? null,
        primaryColor: school?.primary_color ?? null,
        accentColor: school?.accent_color ?? null,
        address: school?.address ?? null,
        phone: school?.phone ?? null,
      };
      const result = row.channel === "email"
        ? await sendEmail(row, sender, tokens.get(row.recipient.toLowerCase()) ?? null)
        : sendSms();
      const now = new Date().toISOString();

      if (result.status === "sent") {
        await admin
          .from("outbound_message_queue")
          .update({ status: "sent", attempts: row.attempts + 1, processed_at: now, last_attempt_at: now, error_message: null })
          .eq("id", row.id);
        sent++;
        continue;
      }

      if (result.status === "unconfigured") {
        // Leave the row exactly as it is apart from the explanation, so it goes
        // out untouched once a provider is added.
        await admin
          .from("outbound_message_queue")
          .update({ error_message: result.error.slice(0, 500) })
          .eq("id", row.id);
        deferred++;
        continue;
      }

      const attempts = row.attempts + 1;
      const givingUp = result.status === "failed" || attempts >= MAX_ATTEMPTS;

      await admin
        .from("outbound_message_queue")
        .update({
          status: givingUp ? "failed" : "queued",
          attempts,
          error_message: result.error.slice(0, 500),
          processed_at: givingUp ? now : null,
          last_attempt_at: now,
        })
        .eq("id", row.id);

      if (givingUp) failed++;
      else deferred++;
    }

    return json({
      success: true,
      considered: pending.length,
      sent,
      failed,
      deferred,
      email_configured: !!(Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("RESEND_API_KEY")),
      // So the settings screen can say which sender is in use.
      sender: Deno.env.get("LOVABLE_API_KEY")
        ? PLATFORM_FROM
        : Deno.env.get("NOTIFICATIONS_FROM_EMAIL") || DEFAULT_FROM,
      sender_is_default: !Deno.env.get("LOVABLE_API_KEY") && !Deno.env.get("NOTIFICATIONS_FROM_EMAIL"),
    });
  } catch (err) {
    console.error("process-message-queue error:", err);
    return json({ error: err instanceof Error ? err.message : "Queue processing failed" }, 500);
  }
});
