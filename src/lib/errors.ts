/**
 * Anything can be thrown in JavaScript, so `err.message` on a caught value is
 * not safe. Use this wherever a caught error is shown to the user.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/**
 * A database error that reached the user, in a form they can act on and read
 * back to someone who can fix it.
 *
 * Supabase surfaces PostgREST and Postgres errors as `{ message, code, details,
 * hint }`. The message alone is often unhelpful out of context — "permission
 * denied for table students" does not tell a head teacher that a migration is
 * missing — so known codes carry a plain sentence about the likely cause.
 */
export interface ErrorDiagnosis {
  message: string;
  code: string | null;
  /** What this code usually means, in plain English. Null when unrecognised. */
  likelyCause: string | null;
  /** Everything worth pasting into a bug report, on one line. */
  report: string;
}

const CAUSE_BY_CODE: Record<string, string> = {
  // Postgres
  "42501": "The database refused the read. A row-level security policy is blocking this account, or the policy that should allow it was never applied.",
  "42P17": "Two security policies refer to each other in a loop. The database cannot resolve them, so nothing can be read until one is rewritten.",
  "42883": "The database function this screen calls does not exist. A migration has most likely not been applied to this project yet.",
  "42P01": "A table this screen needs does not exist. A migration has most likely not been applied to this project yet.",
  // PostgREST
  PGRST202: "The database function this screen calls was not found. A migration has most likely not been applied to this project yet.",
  PGRST301: "The sign-in session was not accepted. Signing out and back in usually clears it.",
  PGRST116: "The record this screen expected was not there.",
};

function stringField(err: unknown, key: string): string | null {
  if (!err || typeof err !== "object" || !(key in err)) return null;
  const value = (err as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function diagnoseError(err: unknown, fallback?: string): ErrorDiagnosis {
  const message = getErrorMessage(err, fallback);
  const code = stringField(err, "code");
  const details = stringField(err, "details");
  const hint = stringField(err, "hint");

  return {
    message,
    code,
    likelyCause: code ? CAUSE_BY_CODE[code] ?? null : null,
    report: [code && `[${code}]`, message, details, hint].filter(Boolean).join(" — "),
  };
}
