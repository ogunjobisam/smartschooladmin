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
        html: textToHtml(row.body),
        purpose: "transactional",
        label: "school-alert",
        idempotency_key: `queue-${row.id}`,
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

/** Plain queued text turned into a readable HTML body. */
function textToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${
    escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("")
  }</div>`;
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
 * SMS is queued but not delivered: no provider is wired up yet.
 *
 * Deliberately reported rather than silently dropped or marked sent — SMS is
 * how most Nigerian schools actually reach parents, so a queue quietly filling
 * with undelivered texts would be worse than a visible error.
 */
function sendSms(): SendResult {
  return {
    status: "unconfigured",
    error: "No SMS provider configured. SMS messages stay queued until one is added.",
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

    // Two callers: a scheduler holding the service role key, which drains every
    // organisation, and a signed-in admin draining their own.
    const isScheduler = token === serviceKey;
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
    const schools = new Map<string, { name: string; email: string | null }>();
    if (schoolIds.length > 0) {
      const { data: schoolRows } = await admin
        .from("schools")
        .select("id, name, email")
        .in("id", schoolIds);
      for (const school of schoolRows || []) {
        schools.set(school.id, { name: school.name, email: school.email });
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
      };
      const result = row.channel === "email" ? await sendEmail(row, sender) : sendSms();
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
