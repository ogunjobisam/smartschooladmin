/**
 * SMS: everything about a text message that does not depend on who carries it.
 *
 * The queue drainer (process-message-queue) plans each SMS here — is the number
 * real, what exactly will be sent, how many credits it costs — and hands the
 * result to an SmsProvider. Providers are the only part that talks to the
 * outside world, so adding Termii later is one adapter, and everything else is
 * already tested.
 *
 * Plain TypeScript with no Deno or npm imports, so vitest can run it directly.
 */

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

/**
 * A recipient as the provider wants it: international digits, no plus sign,
 * e.g. 2348031234567. Null when it cannot be a mobile number.
 *
 * Nigerian numbers arrive every way parents write them — 08031234567,
 * 8031234567, +234 803 123 4567, 234-803-123-4567, (0803) 123 4567 — and all
 * mean the same phone. Mobile numbers are 10 digits after the country code and
 * start 7, 8 or 9. Anything written with a + is taken as already international,
 * so a parent abroad still gets their text.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);

  // Nigeria, in each of the shapes above.
  if (digits.startsWith("234")) {
    const local = digits.slice(3).replace(/^0/, "");
    return /^[789]\d{9}$/.test(local) ? `234${local}` : null;
  }
  if (!international) {
    const local = digits.replace(/^0/, "");
    return /^[789]\d{9}$/.test(local) ? `234${local}` : null;
  }

  // Anywhere else: E.164 allows up to 15 digits; anything under 8 is not a phone.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

// ---------------------------------------------------------------------------
// Text, encoding and cost
// ---------------------------------------------------------------------------

/**
 * One character outside the GSM 7-bit alphabet turns the whole message into
 * UCS-2, which fits 70 characters to a part instead of 160 — so a fee reminder
 * with a ₦ sign costs two or three credits instead of one. These replacements
 * keep ordinary school messages in GSM, and every one reads the same to a
 * parent.
 */
const SMS_SAFE: [RegExp, string][] = [
  [/₦\s?/g, "N"],
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[–—−]/g, "-"],
  [/…/g, "..."],
  [/[  ]/g, " "],
  [/•/g, "-"],
];

export function smsSafeText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SMS_SAFE) out = out.replace(pattern, replacement);
  return out.trim();
}

/** The GSM 03.38 basic alphabet, which costs one septet per character. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** The extension table: allowed, but each costs two septets. */
const GSM_EXTENDED = "^{}\\[~]|€\f";

const GSM_BASIC_SET = new Set(GSM_BASIC);
const GSM_EXTENDED_SET = new Set(GSM_EXTENDED);

export interface SmsSegments {
  encoding: "GSM-7" | "UCS-2";
  /** Length in the units the encoding counts: septets for GSM, UTF-16 units for UCS-2. */
  length: number;
  /** Parts the carrier bills for — what one message costs in credits. */
  parts: number;
}

/**
 * How many parts a message is billed as. A single part holds 160 GSM
 * characters or 70 UCS-2; once a message is split, each part loses room to the
 * header that joins them back up, leaving 153 and 67.
 */
export function smsSegments(text: string): SmsSegments {
  let septets = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC_SET.has(ch)) septets += 1;
    else if (GSM_EXTENDED_SET.has(ch)) septets += 2;
    else { gsm = false; break; }
  }

  if (gsm) {
    return { encoding: "GSM-7", length: septets, parts: septets <= 160 ? 1 : Math.ceil(septets / 153) };
  }
  const units = text.length; // UTF-16 code units, which is what UCS-2 counts
  return { encoding: "UCS-2", length: units, parts: units <= 70 ? 1 : Math.ceil(units / 67) };
}

/** No school alert needs more than this; anything longer is almost certainly a mistake. */
export const MAX_SMS_PARTS = 6;

// ---------------------------------------------------------------------------
// Planning one send
// ---------------------------------------------------------------------------

export type SmsPlan =
  | { ok: true; to: string; body: string; parts: number; encoding: SmsSegments["encoding"] }
  | { ok: false; permanent: true; error: string };

/**
 * Everything decided before a credit is spent or a provider is called. A bad
 * number or an over-long message is a permanent failure: retrying cannot fix
 * either, and every retry would be another attempt against the school's credits.
 */
export function planSms(recipient: string, body: string): SmsPlan {
  const to = normalisePhone(recipient);
  if (!to) {
    return { ok: false, permanent: true, error: `"${recipient}" is not a mobile number an SMS can reach.` };
  }
  const text = smsSafeText(body);
  if (!text) return { ok: false, permanent: true, error: "The message is empty." };
  const { parts, encoding } = smsSegments(text);
  if (parts > MAX_SMS_PARTS) {
    return {
      ok: false,
      permanent: true,
      error: `The message is ${parts} texts long; the limit is ${MAX_SMS_PARTS}. Shorten it and send again.`,
    };
  }
  return { ok: true, to, body: text, parts, encoding };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface SmsMessage {
  to: string;
  body: string;
  /** Alphanumeric sender ID the phone shows, 3 to 11 characters. */
  senderId: string;
  /** Our queue row, so a provider can de-duplicate a retried send. */
  reference: string;
}

export type SmsSendOutcome =
  | { status: "sent"; providerMessageId: string | null }
  /** Nothing left the building: the text was only recorded, never delivered. */
  | { status: "simulated"; providerMessageId: string }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string };

export interface SmsProvider {
  /** Recorded on the queue row and the usage log. */
  name: string;
  /** Whether a send through this provider reaches a phone and spends credits. */
  delivers: boolean;
  send(message: SmsMessage): Promise<SmsSendOutcome>;
}

/**
 * Records a send without delivering it. Lets the whole pipeline — numbers,
 * encoding, credit checks, statuses, the delivery screen — run end to end
 * before any provider account exists. It never reports "sent" and never spends
 * a credit, so nobody can mistake a sandbox run for texts that reached parents.
 */
export const sandboxProvider: SmsProvider = {
  name: "sandbox",
  delivers: false,
  async send(message) {
    return { status: "simulated", providerMessageId: `sandbox-${message.reference}` };
  },
};

export type ProviderChoice =
  | { provider: SmsProvider }
  | { provider: null; reason: string };

/**
 * Which provider SMS_PROVIDER names. "sandbox" simulates; real providers are
 * named here but not wired, so choosing one reports that plainly instead of
 * quietly doing nothing. Unset means SMS stays queued, exactly as before.
 */
export function chooseSmsProvider(env: { SMS_PROVIDER?: string | null }): ProviderChoice {
  const name = (env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (!name) {
    return { provider: null, reason: "No SMS provider configured. SMS messages stay queued until one is added." };
  }
  if (name === "sandbox") return { provider: sandboxProvider };
  if (name === "termii" || name === "africastalking") {
    return { provider: null, reason: `The ${name} SMS provider is not connected yet. SMS messages stay queued.` };
  }
  return { provider: null, reason: `Unknown SMS provider "${name}". SMS messages stay queued.` };
}

/** Sender ID shown on parents' phones until a school registers its own. */
export const DEFAULT_SENDER_ID = "SchoolAlert";

/** Providers reject sender IDs outside 3–11 letters, digits and spaces. */
export function validSenderId(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return /^[A-Za-z0-9 ]{3,11}$/.test(v) && /[A-Za-z]/.test(v) ? v : DEFAULT_SENDER_ID;
}

// ---------------------------------------------------------------------------
// Delivering one queued SMS
// ---------------------------------------------------------------------------

/** What an SMS cost and who carried it, written to the queue row. */
export interface SmsDetail {
  provider: string;
  providerMessageId: string | null;
  parts: number;
}

export type SmsDeliveryResult =
  | { status: "sent"; sms: SmsDetail }
  | { status: "simulated"; sms: SmsDetail }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string }
  | { status: "unconfigured"; error: string };

/** The two database calls delivery makes: charge_sms / refund_sms, and a log update. */
export interface SmsLedger {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    update(values: Record<string, unknown>): { eq(column: string, value: string): PromiseLike<unknown> };
  };
}

/**
 * One queued SMS, start to finish, in the only order that cannot overspend:
 * plan it, reserve its credits, send, and refund the credits if the provider
 * did not take it. A school's balance never goes below zero, and a text the
 * provider refused costs nothing. A provider that does not deliver (the
 * sandbox) is never charged.
 */
export async function deliverSms(
  row: { id: string; org_id: string; recipient: string; body: string },
  ledger: SmsLedger,
  provider: SmsProvider | null,
  providerMissing: string,
  senderId: string,
): Promise<SmsDeliveryResult> {
  if (!provider) return { status: "unconfigured", error: providerMissing };

  const plan = planSms(row.recipient, row.body);
  if (!plan.ok) return { status: "failed", error: plan.error };

  // charge_sms is one conditional UPDATE, so two drains running at once cannot
  // both spend the last credits.
  if (provider.delivers) {
    const { data: charged, error } = await ledger.rpc("charge_sms", {
      _org_id: row.org_id,
      _queue_id: row.id,
      _recipient: plan.to,
      _parts: plan.parts,
      _provider: provider.name,
    });
    if (error) return { status: "retry", error: `Could not reserve SMS credits: ${error.message}` };
    if (!charged) {
      return {
        status: "unconfigured",
        error: `Not enough SMS credits: this message needs ${plan.parts}. Buy a bundle from Billing to resume SMS delivery.`,
      };
    }
  }

  let outcome: SmsSendOutcome;
  try {
    outcome = await provider.send({ to: plan.to, body: plan.body, senderId, reference: row.id });
  } catch (err) {
    outcome = { status: "retry", error: err instanceof Error ? err.message : "SMS send failed" };
  }

  if (outcome.status === "sent" || outcome.status === "simulated") {
    const sms = { provider: provider.name, providerMessageId: outcome.providerMessageId, parts: plan.parts };
    if (provider.delivers && outcome.providerMessageId) {
      await ledger.from("sms_usage_log").update({ provider_message_id: outcome.providerMessageId }).eq("queue_id", row.id);
    }
    return outcome.status === "sent" ? { status: "sent", sms } : { status: "simulated", sms };
  }

  // The provider did not take it: give the credits back before anything else.
  if (provider.delivers) await ledger.rpc("refund_sms", { _queue_id: row.id });
  return { status: outcome.status, error: `${provider.name}: ${outcome.error}`.slice(0, 400) };
}
