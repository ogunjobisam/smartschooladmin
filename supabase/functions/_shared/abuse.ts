/**
 * Small defences for endpoints that answer the public or handle secrets.
 *
 * Shared between edge functions and their tests, and deliberately free of
 * imports so both Deno and vitest can load it — the same arrangement as
 * sender.ts. See src/test/abuse.test.ts.
 */

interface HeaderSource {
  get(name: string): string | null;
}

/**
 * The caller's IP address, for rate limiting. Supabase's edge sits behind a
 * proxy, so the socket address is the proxy's; the client is the first entry
 * of X-Forwarded-For. Not proof of identity — a limit keyed on it slows abuse,
 * it does not authenticate anyone.
 */
export function clientIp(headers: HeaderSource): string {
  const direct = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Whether free text contains something a mail client would turn into a link.
 *
 * The admissions form puts the guardian's name into an email sent to an
 * address the caller chooses, from the platform's own domain. A "name" of
 * "Click www.pay-fees-now.xyz to confirm" made that a phishing relay. Real
 * names do not contain URLs, so refusing them costs nothing.
 */
export function containsLink(text: string): boolean {
  return /https?:|:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|ly|xyz|info|ru|co|me|link|click|top|app|site|online|biz|ng|uk)\b/i
    .test(text);
}

/**
 * String comparison whose running time does not depend on where the inputs
 * first differ, for signatures and shared secrets. `!==` returns at the first
 * mismatched character, which in principle lets a caller recover a secret one
 * character at a time by timing responses.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Hosts a payment may send the browser back to, besides ALLOWED_RETURN_ORIGINS. */
const APP_HOSTS = ["smartschooladmin.app", "smartschooladmin.lovable.app"];
/** The Lovable project, whose preview hosts embed its id. */
const LOVABLE_PROJECT_ID = "af2f82cb-fd9f-4ac2-8e61-8aa67cb14264";

/**
 * The return URL a checkout may redirect to, or null when it points anywhere
 * but this app. The gateway sends the payer to it after paying, so an
 * unchecked value let anyone who could start a checkout bounce a real payer to
 * a site of their choosing, fresh from a genuine payment page.
 *
 * `extraOrigins` is ALLOWED_RETURN_ORIGINS, split — for a school's own domain,
 * once schools have them.
 */
export function safeReturnUrl(value: unknown, extraOrigins: readonly string[] = []): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  if (url.username || url.password) return null;

  const allowed =
    local ||
    APP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
    ((host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) &&
      host.includes(LOVABLE_PROJECT_ID)) ||
    extraOrigins.some((o) => o.trim() && url.origin === o.trim().replace(/\/$/, ""));
  return allowed ? url.toString() : null;
}

interface RateLimitClient {
  rpc(
    fn: "consume_rate_limit",
    args: { _key: string; _limit: number; _window_seconds: number },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Count one hit against `key` and say whether it is within `limit` for the
 * current window. Fails open, logging loudly: these limits guard public forms
 * that schools depend on, and refusing every family because the limiter itself
 * broke would be worse than a spell without a limit.
 */
export async function withinRateLimit(
  client: RateLimitClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await client.rpc("consume_rate_limit", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`Rate limiter unavailable (${key}); allowing:`, error.message);
    return true;
  }
  return data !== false;
}
