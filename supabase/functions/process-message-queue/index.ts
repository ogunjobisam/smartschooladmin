import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  attempts: number;
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
 * Email delivery.
 *
 * Resend is the default because it needs nothing but an API key and a verified
 * sender. Swapping providers means replacing this one function — everything
 * else works off the queue table.
 */
async function sendEmail(row: QueueRow): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFICATIONS_FROM_EMAIL");

  if (!apiKey || !from) {
    return {
      status: "unconfigured",
      error: "No email provider configured. Set RESEND_API_KEY and NOTIFICATIONS_FROM_EMAIL.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [row.recipient],
      subject: row.subject || "A message from your school",
      text: row.body,
    }),
  });

  if (response.ok) return { status: "sent" };

  const detail = await response.text();
  const error = `Resend ${response.status}: ${detail.slice(0, 300)}`;

  // A 4xx other than rate limiting will fail identically on every retry.
  const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
  return permanent ? { status: "failed", error } : { status: "retry", error };
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

    let query = admin
      .from("outbound_message_queue")
      .select("id, org_id, channel, recipient, subject, body, attempts")
      .eq("status", "queued")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at")
      .limit(BATCH_SIZE);

    if (orgFilter) query = query.eq("org_id", orgFilter);

    const { data: rows, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const pending = (rows || []) as QueueRow[];
    let sent = 0;
    let failed = 0;
    let deferred = 0;

    for (const row of pending) {
      const result = row.channel === "email" ? await sendEmail(row) : sendSms();
      const now = new Date().toISOString();

      if (result.status === "sent") {
        await admin
          .from("outbound_message_queue")
          .update({ status: "sent", attempts: row.attempts + 1, processed_at: now, error_message: null })
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
      email_configured: !!(Deno.env.get("RESEND_API_KEY") && Deno.env.get("NOTIFICATIONS_FROM_EMAIL")),
    });
  } catch (err) {
    console.error("process-message-queue error:", err);
    return json({ error: err instanceof Error ? err.message : "Queue processing failed" }, 500);
  }
});
