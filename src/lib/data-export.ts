/**
 * Whole-school data export: the school's own records, as CSV files in one ZIP.
 *
 * It runs in the browser as the signed-in user, so row-level security still
 * decides what can be read — an export can never contain more than the person
 * could already open on screen. On top of that, every query is pinned to the
 * organisation being worked in. RLS alone is not enough for that: its policies
 * resolve "your organisation" through get_user_org_id(), which picks one when an
 * account belongs to several, and a super_admin's reach is not organisation
 * bound at all. Without the explicit filter an export could carry another
 * school's pupils.
 *
 * Every table in the database is either exported below or listed in
 * EXCLUDED_TABLES with a reason; src/test/data-export.test.ts fails when a new
 * table is neither, so nobody has to remember to decide.
 */

import { buildZip, type ZipEntry } from "@/lib/zip";

/** How a table's rows are tied to the organisation being exported. */
export type ExportScope =
  | { kind: "org" }
  | { kind: "school" }
  /** Through a parent table, joined with PostgREST's !inner embedding. */
  | { kind: "via"; parent: string; column: "org_id" | "school_id" };

export interface ExportTable {
  table: string;
  scope: ExportScope;
}

export interface ExportDataset {
  key: string;
  label: string;
  description: string;
  tables: ExportTable[];
}

const org = { kind: "org" } as const;
const school = { kind: "school" } as const;
const via = (parent: string, column: "org_id" | "school_id" = "school_id"): ExportScope =>
  ({ kind: "via", parent, column });

export const EXPORT_DATASETS: ExportDataset[] = [
  {
    key: "school",
    label: "School setup",
    description: "Schools, campuses, academic years and terms, classes and subjects.",
    tables: [
      { table: "schools", scope: org },
      { table: "campuses", scope: school },
      { table: "academic_years", scope: org },
      { table: "academic_periods", scope: via("academic_years", "org_id") },
      { table: "classes", scope: school },
      { table: "subjects", scope: school },
      { table: "class_subjects", scope: via("classes") },
    ],
  },
  {
    key: "people",
    label: "Pupils, families and staff",
    description: "Pupil records, enrolments, guardians and who they look after, staff and their positions.",
    tables: [
      { table: "students", scope: school },
      { table: "enrolments", scope: via("students") },
      { table: "guardians", scope: org },
      { table: "student_guardians", scope: via("students") },
      { table: "staff", scope: school },
      { table: "staff_positions", scope: via("staff") },
      { table: "class_teachers", scope: via("classes") },
      { table: "subject_teachers", scope: via("classes") },
    ],
  },
  {
    key: "academic",
    label: "Exams and results",
    description: "Exams, grade bands, every score entered, report card comments and ratings, awards.",
    tables: [
      { table: "exams", scope: school },
      { table: "exam_subjects", scope: via("exams") },
      { table: "exam_grade_bands", scope: via("exams") },
      { table: "student_scores", scope: via("students") },
      { table: "result_releases", scope: school },
      { table: "term_report_comments", scope: via("students") },
      { table: "term_report_ratings", scope: via("students") },
      { table: "term_report_releases", scope: via("classes") },
      { table: "student_awards", scope: school },
      { table: "recognitions", scope: org },
    ],
  },
  {
    key: "attendance",
    label: "Attendance and timetable",
    description: "Every attendance mark, timetable periods, lessons and one-off changes.",
    tables: [
      { table: "attendance_records", scope: school },
      { table: "timetable_periods", scope: school },
      { table: "timetable_entries", scope: school },
      { table: "timetable_exceptions", scope: school },
    ],
  },
  {
    key: "finance",
    label: "Fees and payments",
    description: "Fee schedules, invoices and their lines, payments, allocations, online transactions and receipts.",
    tables: [
      { table: "fee_categories", scope: org },
      { table: "fee_schedules", scope: school },
      { table: "invoices", scope: school },
      { table: "invoice_items", scope: via("invoices") },
      { table: "payments", scope: school },
      { table: "payment_allocations", scope: via("payments") },
      { table: "payment_transactions", scope: school },
      { table: "receipts", scope: school },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Salary profiles, payroll runs, payslip lines and salary change requests. Bank details are never exported.",
    tables: [
      { table: "payroll_profiles", scope: via("staff") },
      { table: "payroll_runs", scope: school },
      { table: "payroll_run_items", scope: via("payroll_runs") },
      { table: "salary_change_requests", scope: school },
      { table: "approval_requests", scope: org },
    ],
  },
  {
    key: "admissions",
    label: "Admissions",
    description: "Applications received and admissions appointments.",
    tables: [
      { table: "applications", scope: school },
      { table: "appointments", scope: org },
    ],
  },
  {
    key: "communications",
    label: "Announcements and events",
    description: "Announcements, notices, events and RSVPs, and the school's message templates.",
    tables: [
      { table: "school_announcements", scope: org },
      { table: "school_notices", scope: school },
      { table: "school_events", scope: org },
      { table: "event_rsvps", scope: org },
      { table: "notification_templates", scope: org },
    ],
  },
  {
    key: "transport",
    label: "Transport",
    description: "Routes, stops and which pupils ride them.",
    tables: [
      { table: "transport_routes", scope: school },
      { table: "transport_stops", scope: via("transport_routes") },
      { table: "student_transport", scope: via("students") },
    ],
  },
  {
    key: "audit",
    label: "Audit log",
    description: "Who changed what, and when.",
    tables: [{ table: "audit_logs", scope: org }],
  },
];

/**
 * Tables deliberately left out, and why. A new table must be added either to a
 * dataset above or here — the test enforces it.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  staff_bank_details: "Bank account numbers: too costly if an export file is lost or forwarded.",
  payment_gateway_config: "Payment provider keys and secrets.",
  email_unsubscribe_tokens: "Secret tokens, meaningless outside the app.",
  profiles: "Sign-in accounts, not school records; names are on the staff, guardian and pupil rows.",
  user_roles: "App permissions, not school records.",
  organisation_groups: "Platform account settings.",
  org_subscriptions: "The school's subscription with us, shown on the Billing page.",
  platform_payments: "Payments to us for the subscription, shown on the Billing page.",
  subscription_plans: "Our price list, the same for every school.",
  sms_credit_balances: "Platform billing state.",
  sms_usage_log: "Platform billing state.",
  ai_usage_events: "Platform metering.",
  notifications: "Each user's personal inbox.",
  notification_preferences: "Each user's personal settings.",
  notification_settings: "App configuration.",
  outbound_message_queue: "Delivery machinery for messages already sent.",
  document_files: "Uploaded file metadata only; the files themselves live in storage.",
  school_id_formats: "App configuration.",
  id_counters: "Internal sequence counters.",
  application_counters: "Internal sequence counters.",
  client_errors: "Error telemetry.",
  error_alerts: "Error telemetry.",
  demo_cleanup_log: "Demo housekeeping.",
};

export const EXPORT_PAGE_SIZE = 1000;

/** The narrow slice of the Supabase query builder this module uses. */
export interface ExportQuery extends PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> {
  select(columns: string): ExportQuery;
  eq(column: string, value: unknown): ExportQuery;
  in(column: string, values: unknown[]): ExportQuery;
  gt(column: string, value: unknown): ExportQuery;
  order(column: string, options: { ascending: boolean }): ExportQuery;
  limit(count: number): ExportQuery;
}

export interface ExportClient {
  from(table: string): ExportQuery;
}

interface ScopeContext {
  orgId: string;
  schoolIds: string[];
}

/**
 * Reads every row of one table the caller may see within the organisation.
 *
 * Pages by primary key rather than by offset: it cannot skip or repeat a row
 * when something is written mid-export, and it does not depend on the server's
 * max-rows setting — a short page is not taken to mean the end.
 */
export async function fetchTableRows(
  client: ExportClient,
  { table, scope }: ExportTable,
  ctx: ScopeContext,
  onPage?: (fetched: number) => void,
): Promise<Record<string, unknown>[]> {
  const needsSchools = scope.kind === "school" || (scope.kind === "via" && scope.column === "school_id");
  if (needsSchools && ctx.schoolIds.length === 0) return [];

  const rows: Record<string, unknown>[] = [];
  let lastId: unknown = null;

  for (;;) {
    const columns = scope.kind === "via" ? `*, ${scope.parent}!inner(${scope.column})` : "*";
    let query = client.from(table).select(columns);

    if (scope.kind === "org") query = query.eq("org_id", ctx.orgId);
    else if (scope.kind === "school") query = query.in("school_id", ctx.schoolIds);
    else if (scope.column === "org_id") query = query.eq(`${scope.parent}.org_id`, ctx.orgId);
    else query = query.in(`${scope.parent}.school_id`, ctx.schoolIds);

    if (lastId !== null) query = query.gt("id", lastId);
    const { data, error } = await query.order("id", { ascending: true }).limit(EXPORT_PAGE_SIZE);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (scope.kind === "via") delete row[scope.parent];
      rows.push(row);
    }
    lastId = data[data.length - 1].id;
    onPage?.(rows.length);
  }

  return rows;
}

/** Characters that make Excel and Sheets treat a cell as a formula. */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * One cell. Text that a spreadsheet would run as a formula is prefixed with an
 * apostrophe: admissions applications are typed in by the public, and a name
 * of =HYPERLINK(...) must not become a live link on the proprietor's laptop.
 * Numbers are left alone, so a negative balance stays a number.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "string") {
    text = FORMULA_TRIGGERS.has(value.charAt(0)) ? `'${value}` : value;
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows as CSV. Starts with a byte-order mark so Excel reads UTF-8 — without it
 * the naira sign and accented names arrive as mojibake — and uses CRLF, which
 * Excel expects.
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export interface ExportProgress {
  table: string;
  tableIndex: number;
  tableCount: number;
  rows: number;
}

export interface ExportResult {
  zip: Uint8Array;
  counts: Record<string, number>;
  totalRows: number;
}

export async function runExport(options: {
  client: ExportClient;
  orgId: string;
  datasetKeys: string[];
  exportedBy?: string | null;
  now?: Date;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<ExportResult> {
  const { client, orgId, datasetKeys, onProgress } = options;
  const now = options.now ?? new Date();
  const datasets = EXPORT_DATASETS.filter((d) => datasetKeys.includes(d.key));
  if (datasets.length === 0) throw new Error("Choose at least one set of data to export.");

  const { data: schools, error } = await client.from("schools").select("id, name").eq("org_id", orgId);
  if (error) throw new Error(`schools: ${error.message}`);
  const ctx: ScopeContext = { orgId, schoolIds: (schools ?? []).map((s) => String(s.id)) };

  const work = datasets.flatMap((d) => d.tables.map((t) => ({ dataset: d, table: t })));
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const counts: Record<string, number> = {};

  for (const [index, { dataset, table }] of work.entries()) {
    const report = (rows: number) =>
      onProgress?.({ table: table.table, tableIndex: index, tableCount: work.length, rows });
    report(0);
    const rows = await fetchTableRows(client, table, ctx, report);
    counts[table.table] = rows.length;
    entries.push({ name: `${dataset.key}/${table.table}.csv`, data: encoder.encode(rowsToCsv(rows)) });
  }

  const totalRows = Object.values(counts).reduce((n, c) => n + c, 0);
  const manifest = {
    generated_at: now.toISOString(),
    organisation_id: orgId,
    schools: (schools ?? []).map((s) => ({ id: s.id, name: s.name })),
    exported_by: options.exportedBy ?? null,
    datasets: datasets.map((d) => ({
      key: d.key,
      label: d.label,
      files: d.tables.map((t) => ({ file: `${d.key}/${t.table}.csv`, rows: counts[t.table] })),
    })),
    total_rows: totalRows,
    notes: [
      "Contains personal data about pupils, families and staff. Store and share it as carefully as the school's paper records.",
      "Only rows the exporting account is allowed to see are included.",
      "Text beginning with = + - or @ is prefixed with an apostrophe so spreadsheets do not run it as a formula.",
      "Uploaded files (photos, documents) and staff bank details are not included.",
    ],
  };
  entries.unshift({ name: "manifest.json", data: encoder.encode(JSON.stringify(manifest, null, 2)) });

  return { zip: await buildZip(entries, now), counts, totalRows };
}
