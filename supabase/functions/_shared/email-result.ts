/**
 * How to treat a refusal from the email provider.
 *
 * Shared between the queue processor and its tests, and deliberately free of
 * imports so both a Deno edge function and vitest can load it.
 *
 * The distinction that matters here is between a message that is wrong and a
 * *sender* that is not set up yet. Resend answers 403 in two very common
 * situations that have nothing to do with the individual message:
 *
 *   - the `from` domain has not been verified, and
 *   - the built-in `onboarding@resend.dev` sender is being used to write to
 *     anyone other than the address that owns the Resend account.
 *
 * Both apply to every message in the queue equally, and both are fixed by
 * configuration rather than by editing the message. Treating them as permanent
 * per-message failures — which is what "any 4xx except 429 is permanent" did —
 * burned the whole backlog on its first drain, with no way back: nothing in the
 * app can move a row out of `failed`. Classifying them as `unconfigured` costs
 * no attempt and leaves the row queued, so a backlog survives until a domain is
 * verified and then goes out.
 */

export type SendOutcome = "sent" | "retry" | "failed" | "unconfigured";

/** Outcomes a refusal can map to — "sent" is not one of them. */
export type FailureOutcome = Exclude<SendOutcome, "sent">;

/**
 * Phrases Resend uses when the problem is the sender rather than the message.
 * Matched case-insensitively against the response body as a backstop, in case a
 * sender problem ever arrives as something other than a 403.
 */
const SENDER_PROBLEM_PHRASES = [
  "domain is not verified",
  "not verified",
  "you can only send testing emails",
  "invalid `from` field",
  "invalid from field",
  "does not belong to",
];

/**
 * Classify a non-2xx response from the email provider.
 *
 * @param status HTTP status returned by the provider.
 * @param body   Response body, used only to recognise sender problems.
 */
export function classifyEmailFailure(status: number, body = ""): FailureOutcome {
  // Rate limiting and provider outages are worth another go.
  if (status === 429 || status >= 500) return "retry";

  // A sender that is not set up yet. Every queued message hits this equally, so
  // it must not consume attempts or mark anything failed.
  if (status === 403) return "unconfigured";

  const haystack = body.toLowerCase();
  if (SENDER_PROBLEM_PHRASES.some((phrase) => haystack.includes(phrase))) {
    return "unconfigured";
  }

  // Anything else in the 4xx range is about this message — a malformed address,
  // a body the provider rejected — and will fail identically forever.
  if (status >= 400) return "failed";

  // Not a failure status at all; the caller should not have asked. Retrying is
  // the safe reading, since it neither loses the message nor declares success.
  return "retry";
}
