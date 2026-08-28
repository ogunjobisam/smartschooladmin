/**
 * Composing the From and Reply-To headers.
 *
 * Shared between the queue processor and its tests, and deliberately free of
 * imports so both a Deno edge function and vitest can load it.
 *
 * The model: one domain, verified once by whoever runs the platform, sends for
 * every school. A message goes out as `Grace Academy <notifications@platform>`
 * with Reply-To set to that school's own address, so a parent sees the school in
 * their inbox and a reply reaches the school rather than the platform. Adding a
 * school needs no DNS work. A school that later wants mail genuinely from its
 * own domain verifies that domain separately; this is the plumbing that would
 * need.
 *
 * School names come from user input, so both helpers treat them as hostile.
 */

/**
 * Characters that cannot appear unquoted in a display name (RFC 5322 §3.2.3).
 * A comma is the one that bites in practice: "Grace Academy, Ikeja" unquoted
 * reads as two addresses and corrupts the header. A full stop does it too,
 * which catches "St. Mary's".
 */
const NEEDS_QUOTING = /[()<>[\]:;@\\,."]/;

/** Longer than any real school name; guards against an absurd header. */
const MAX_DISPLAY_NAME = 200;

/**
 * Strip anything that could break out of a header field.
 *
 * CR and LF are the reason this exists: a name containing a newline would let
 * whoever set it inject arbitrary headers into every message the school sends.
 */
function headerSafe(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, MAX_DISPLAY_NAME);
}

/**
 * The bare mailbox from a configured sender.
 *
 * `NOTIFICATIONS_FROM_EMAIL` is commonly set to `"Your School <noreply@x>"`, and
 * a display name cannot be put in front of something that already has one.
 */
export function mailboxOf(configured: string | null | undefined): string {
  const value = headerSafe(configured ?? "");
  if (!value) return "";
  const angled = value.match(/<([^>]*)>/);
  return (angled ? angled[1] : value).trim();
}

/**
 * `Name <mailbox>`, or a bare mailbox when there is no usable name.
 *
 * Quoting only when needed keeps the common case readable; always escaping
 * inside the quotes keeps the odd case correct.
 */
export function formatSender(schoolName: string | null | undefined, mailbox: string): string {
  const address = mailboxOf(mailbox);
  const name = headerSafe(schoolName ?? "");
  if (!address) return "";
  if (!name) return address;

  if (NEEDS_QUOTING.test(name)) {
    const escaped = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}" <${address}>`;
  }
  return `${name} <${address}>`;
}

/**
 * A reply-to address, or null if it is unusable.
 *
 * `schools.email` is nullable and free text, so it is checked rather than
 * trusted. Returning null omits the header entirely — better than a reply-to
 * that bounces, and far better than falling back to the platform address, which
 * would quietly route parents' replies to the wrong organisation.
 */
export function replyToAddress(value: string | null | undefined): string | null {
  const address = mailboxOf(value ?? "");
  if (!address) return null;
  // Deliberately loose: this rejects obvious rubbish and header injection, and
  // leaves the provider to judge deliverability.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  return address;
}
