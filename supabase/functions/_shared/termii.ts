/**
 * Termii, the SMS provider most Nigerian schools' texts will go through.
 *
 * One call: POST {baseUrl}/api/sms/send with the API key in the body. Termii
 * answers 200 with a message_id when it accepts a text, and a JSON `message`
 * explaining itself when it does not.
 *
 * What matters most here is sorting refusals into the three outcomes the queue
 * treats differently:
 *
 *   - unconfigured  the account, not the message: a bad API key, a sender ID
 *                   Termii has not approved, a DND route not activated, the
 *                   Termii wallet empty. Every message would fail the same way,
 *                   so they wait — with credits refunded — until someone fixes
 *                   the account, rather than a term's messages failing at once.
 *   - failed        this message: a number Termii will not deliver to.
 *   - retry         nobody's fault yet: rate limits, 5xx, timeouts.
 *
 * Plain TypeScript with no Deno or npm imports, so vitest can run it directly.
 */
import type { SmsMessage, SmsProvider, SmsSendOutcome } from "./sms.ts";

export const TERMII_DEFAULT_BASE_URL = "https://api.ng.termii.com";

/**
 * "generic" cannot reach numbers on Nigeria's Do-Not-Disturb register, which is
 * a large share of parents' phones. "dnd" can, but Termii must activate it on
 * the account first, so generic is the default until a school's is.
 */
export type TermiiChannel = "generic" | "dnd";

export interface TermiiConfig {
  apiKey: string;
  baseUrl?: string | null;
  channel?: string | null;
  /** Milliseconds before a send is abandoned and retried later. */
  timeoutMs?: number;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** The route to use, falling back to generic for anything unrecognised. */
export function termiiChannel(value: string | null | undefined): TermiiChannel {
  return (value ?? "").trim().toLowerCase() === "dnd" ? "dnd" : "generic";
}

/** A base URL Termii can be reached on, without a trailing slash. */
export function termiiBaseUrl(value: string | null | undefined): string {
  const v = (value ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v) ? v : TERMII_DEFAULT_BASE_URL;
}

/**
 * Sort a refusal. Termii's status codes are not specific enough on their own —
 * a bad sender ID and a bad number can both come back 400 — so the message
 * text decides the cases that matter.
 */
export function classifyTermiiRefusal(status: number, message: string): SmsSendOutcome {
  const text = message.toLowerCase();
  const error = `Termii ${status}: ${message}`.slice(0, 300);

  if (status === 429 || status >= 500) return { status: "retry", error };

  const account =
    status === 401 ||
    status === 403 ||
    /api[\s_-]?key|unauthori[sz]ed|authentication/.test(text) ||
    /sender[\s_-]?id|senderid|application ?sender/.test(text) ||
    /insufficient|balance|top[\s-]?up|wallet/.test(text) ||
    /dnd|route|channel/.test(text);
  if (account) {
    return {
      status: "unconfigured",
      error: `${error}. This is a problem with the Termii account, not the message — it stays queued until the account is fixed.`,
    };
  }

  if (/number|phone|recipient|destination|invalid "?to/.test(text)) {
    return { status: "failed", error };
  }

  // A 4xx we do not recognise: treat as this message's problem, but do not
  // throw it away on the first try.
  return { status: "retry", error };
}

async function readMessage(response: Response): Promise<{ body: Record<string, unknown> | null; message: string }> {
  const raw = await response.text();
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message : raw;
    return { body, message: message || response.statusText };
  } catch {
    return { body: null, message: raw.slice(0, 200) || response.statusText };
  }
}

export function termiiProvider(config: TermiiConfig, fetchImpl: Fetch = fetch): SmsProvider {
  const baseUrl = termiiBaseUrl(config.baseUrl);
  const channel = termiiChannel(config.channel);
  const timeoutMs = config.timeoutMs ?? 15_000;

  return {
    name: "termii",
    delivers: true,
    async send(message: SmsMessage): Promise<SmsSendOutcome> {
      let response: Response;
      // A controller and timer rather than AbortSignal.timeout(), which not
      // every runtime this is tested under provides.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetchImpl(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: config.apiKey,
            to: message.to,
            from: message.senderId,
            sms: message.body,
            type: "plain",
            channel,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // A timeout or dropped connection: Termii may or may not have sent it,
        // and it offers no idempotency key, so a retry can occasionally double
        // a text. Retrying is still better than a parent never hearing.
        const reason = err instanceof Error ? err.message : "network error";
        return { status: "retry", error: `Termii unreachable: ${reason}` };
      } finally {
        clearTimeout(timer);
      }

      const { body, message: text } = await readMessage(response);

      if (response.ok) {
        const id = body?.message_id ?? body?.messageId ?? null;
        if (id !== null && id !== undefined && String(id) !== "") {
          return { status: "sent", providerMessageId: String(id) };
        }
        // 200 without an id is Termii refusing politely, e.g. an unapproved sender.
        return classifyTermiiRefusal(400, text || "Accepted without a message id");
      }

      return classifyTermiiRefusal(response.status, text);
    },
  };
}
