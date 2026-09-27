import { canAccessPath } from "@/lib/access";

/**
 * Search across the school's records from the command palette (⌘K).
 *
 * Every query runs as the signed-in user, so row-level security decides what
 * comes back — this adds no access of its own. On top of that, a record type
 * is only searched when the role can open the page its results link to, so a
 * parent is never offered a staff screen they would be turned away from.
 */

export type SearchKind = "student" | "staff" | "guardian" | "invoice" | "exam" | "subject" | "class";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

type Row = Record<string, unknown>;

interface SearchSource {
  kind: SearchKind;
  /** Group heading in the palette. */
  heading: string;
  table: string;
  select: string;
  /** Columns a search term may match; each term must match at least one. */
  fields: string[];
  /** The page results open, which the role must be allowed to reach. */
  accessPath: string;
  /** Whether the current school or organisation narrows the search. */
  scope: "school" | "org";
  toHit(row: Row): SearchHit;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const name = (row: Row) => [text(row.first_name), text(row.last_name)].filter(Boolean).join(" ") || "Unnamed";
const joined = (...parts: unknown[]) => parts.map(text).filter(Boolean).join(" · ") || undefined;

export const SEARCH_SOURCES: SearchSource[] = [
  {
    kind: "student", heading: "Students", table: "students",
    select: "id, first_name, last_name, student_id_number, status",
    fields: ["first_name", "last_name", "student_id_number"],
    accessPath: "/students", scope: "school",
    toHit: (r) => ({ kind: "student", id: String(r.id), title: name(r),
      subtitle: joined(r.student_id_number, r.status), url: `/students/${r.id}` }),
  },
  {
    kind: "staff", heading: "Staff", table: "staff",
    select: "id, first_name, last_name, email, staff_id_number",
    fields: ["first_name", "last_name", "email", "staff_id_number"],
    accessPath: "/staff", scope: "school",
    toHit: (r) => ({ kind: "staff", id: String(r.id), title: name(r),
      subtitle: joined(r.staff_id_number, r.email), url: `/staff/${r.id}` }),
  },
  {
    kind: "guardian", heading: "Guardians", table: "guardians",
    select: "id, first_name, last_name, email, phone",
    fields: ["first_name", "last_name", "email", "phone"],
    accessPath: "/guardians", scope: "org",
    toHit: (r) => ({ kind: "guardian", id: String(r.id), title: name(r),
      subtitle: joined(r.phone, r.email), url: `/guardians/${r.id}` }),
  },
  {
    kind: "invoice", heading: "Invoices", table: "invoices",
    select: "id, invoice_number, status",
    fields: ["invoice_number"],
    accessPath: "/invoices", scope: "school",
    toHit: (r) => ({ kind: "invoice", id: String(r.id), title: text(r.invoice_number) ?? "Invoice",
      subtitle: text(r.status), url: `/invoices/${r.id}` }),
  },
  {
    kind: "exam", heading: "Exams", table: "exams",
    select: "id, name",
    fields: ["name"],
    accessPath: "/exams", scope: "school",
    toHit: (r) => ({ kind: "exam", id: String(r.id), title: text(r.name) ?? "Exam", url: `/exams/${r.id}` }),
  },
  {
    kind: "subject", heading: "Subjects", table: "subjects",
    select: "id, name, short_code",
    fields: ["name", "short_code"],
    accessPath: "/settings", scope: "school",
    toHit: (r) => ({ kind: "subject", id: String(r.id), title: text(r.name) ?? "Subject",
      subtitle: text(r.short_code), url: "/settings?tab=subjects" }),
  },
  {
    kind: "class", heading: "Classes", table: "classes",
    select: "id, name, level_name, arm",
    fields: ["name", "level_name", "arm"],
    accessPath: "/settings", scope: "school",
    toHit: (r) => ({ kind: "class", id: String(r.id), title: text(r.name) ?? "Class",
      subtitle: joined(r.level_name, r.arm), url: "/settings?tab=classes" }),
  },
];

/** Shorter than this and a search would match half the school. */
export const MIN_QUERY_LENGTH = 2;

/**
 * The words of a query, safe to put in a PostgREST filter. Commas and
 * parentheses end a filter clause and % and * are wildcards, so they are
 * dropped rather than escaped: nobody searches for a name by its punctuation.
 */
export function searchTerms(query: string): string[] {
  const terms = query
    .replace(/[%,()*\\"'`:]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
  return terms.join("").length >= MIN_QUERY_LENGTH ? terms : [];
}

/** One term matching any of the fields, as a PostgREST `or` filter. */
export function anyFieldMatches(fields: string[], term: string): string {
  return fields.map((f) => `${f}.ilike.%${term}%`).join(",");
}

/** The record types this role can open, and so may search. */
export function sourcesForRole(role: string | null): SearchSource[] {
  return SEARCH_SOURCES.filter((s) => canAccessPath(role, s.accessPath));
}

/** Whether a page title matches every word of the query. */
export function pageMatches(title: string, terms: string[]): boolean {
  const t = title.toLowerCase();
  return terms.every((term) => t.includes(term.toLowerCase()));
}

// The slice of the Supabase query builder this needs. PostgREST's builder is
// a thenable, so it is awaited rather than typed as a Promise.
interface Query extends PromiseLike<{ data: Row[] | null; error: { message: string } | null }> {
  or(filter: string): Query;
  eq(column: string, value: string): Query;
  limit(n: number): Query;
}
export interface SearchClient {
  from(table: string): { select(columns: string): Query };
}

export interface SearchContext {
  role: string | null;
  schoolId: string | null;
  orgId: string | null;
  /** Results per record type. */
  limit?: number;
}

/**
 * Every record the user can see that matches every word of the query, grouped
 * by source order. A source that fails is left out rather than failing the
 * whole search.
 */
export async function searchRecords(
  client: SearchClient,
  query: string,
  { role, schoolId, orgId, limit = 5 }: SearchContext,
): Promise<SearchHit[]> {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const results = await Promise.all(
    sourcesForRole(role).map(async (source) => {
      let q = client.from(source.table).select(source.select);
      // Each .or() is ANDed with the others: "Ada Obi" finds Ada Obi, not
      // every Ada and every Obi.
      for (const term of terms) q = q.or(anyFieldMatches(source.fields, term));
      if (source.scope === "school" && schoolId) q = q.eq("school_id", schoolId);
      if (source.scope === "org" && orgId) q = q.eq("org_id", orgId);
      const { data, error } = await q.limit(limit);
      if (error) {
        console.error(`Search in ${source.table} failed:`, error.message);
        return [];
      }
      return (data ?? []).map(source.toHit);
    }),
  );
  return results.flat();
}

export const HEADING_BY_KIND: Record<SearchKind, string> = Object.fromEntries(
  SEARCH_SOURCES.map((s) => [s.kind, s.heading]),
) as Record<SearchKind, string>;
