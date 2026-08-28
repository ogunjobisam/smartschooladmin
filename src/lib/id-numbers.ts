import { getErrorMessage } from "@/lib/errors";

/**
 * Both students and staff carry a school-scoped unique ID number, enforced by a
 * partial unique index in the database. Postgres reports that as 23505 with the
 * index name in `message`/`details`, which reads as gibberish to a school
 * administrator — so translate it into the one sentence they can act on.
 */
export function describeIdError(err: unknown, entity: "student" | "staff", fallback: string): string {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : null;
  const blob = [
    getErrorMessage(err, ""),
    err && typeof err === "object" && "details" in err ? String((err as { details?: unknown }).details ?? "") : "",
  ].join(" ");

  if (code === "23505" && /id_number/i.test(blob)) {
    const label = entity === "student" ? "student ID" : "staff ID";
    return `That ${label} is already used by another ${entity} in this school. Enter a different one, or clear the field to have one generated.`;
  }
  return getErrorMessage(err, fallback);
}

export type YearPosition = "before" | "after" | "none";

export interface IdFormat {
  prefix: string;
  year_position: YearPosition;
  padding: number;
  separator: string;
}

export const DEFAULT_ID_FORMAT: IdFormat = {
  prefix: "",
  year_position: "before",
  padding: 4,
  separator: "/",
};

/** Client-side preview so the sample updates as the settings are changed. */
export function previewId(format: IdFormat, fallbackPrefix: string, year = new Date().getFullYear()): string {
  const prefix = format.prefix.trim() || fallbackPrefix;
  const num = "1".padStart(Math.min(Math.max(format.padding || 4, 1), 8), "0");
  const sep = format.separator;
  if (format.year_position === "before") return `${prefix}${sep}${year}${sep}${num}`;
  if (format.year_position === "after") return `${prefix}${sep}${num}${sep}${year}`;
  return `${prefix}${sep}${num}`;
}

/** Initials used when a school has not set an explicit prefix. */
export function defaultPrefix(schoolName: string | null | undefined, entity: "student" | "staff"): string {
  const words = (schoolName || "").replace(/[^a-zA-Z ]/g, "").split(/\s+/).filter((w) => w.length > 2).slice(0, 4);
  let prefix = words.map((w) => w[0].toUpperCase()).join("");
  if (!prefix) prefix = (schoolName || "").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  if (!prefix) prefix = "STU";
  return entity === "staff" ? `${prefix}-STF` : prefix;
}
