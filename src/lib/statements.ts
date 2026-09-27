import { formatCurrency } from "@/lib/format";
import {
  documentShell,
  footerHtml,
  letterheadHtml,
  openDocument,
  printButtonHtml,
  statusChipHtml,
} from "@/lib/document-theme";


/**
 * Printable "Statement of Account".
 *
 * A statement answers the one question a parent actually asks: what have we been
 * charged, what have we paid, and what is left? It is deliberately a running
 * ledger — invoices raised and payments received in date order, with an opening
 * and closing balance — so a parent can reconcile it against their own records
 * offline, and a bursar can hand it over the counter.
 */

export type StatementStatusFilter = "all" | "unpaid" | "paid" | "overdue";

export const STATEMENT_STATUS_FILTERS: { value: StatementStatusFilter; label: string }[] = [
  { value: "all", label: "All invoices" },
  { value: "unpaid", label: "Unpaid & partly paid" },
  { value: "overdue", label: "Overdue only" },
  { value: "paid", label: "Paid only" },
];

export interface StatementSchool {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
}

export interface StatementLine {
  /** ISO date used for ordering and display. */
  date: string;
  kind: "invoice" | "payment";
  reference: string;
  description: string;
  /** Amount charged, in minor units. */
  debit?: number;
  /** Amount received, in minor units. */
  credit?: number;
  status?: string | null;
  dueDate?: string | null;
}

export interface StatementData {
  school: StatementSchool;
  currency: string;
  studentName: string;
  studentIdNumber?: string | null;
  className?: string | null;
  guardianName?: string | null;
  from?: string | null;
  to?: string | null;
  statusFilter: StatementStatusFilter;
  /** Balance carried in from before the window starts, in minor units. */
  openingBalance: number;
  lines: StatementLine[];
  generatedBy?: string | null;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/** Ordered ledger plus the totals a statement has to add up to. */
export function buildStatement(data: StatementData) {
  const lines = [...data.lines].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let running = data.openingBalance;
  const rows = lines.map((line) => {
    running += (line.debit || 0) - (line.credit || 0);
    return { ...line, balance: running };
  });

  const totalCharged = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalPaid = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

  return {
    rows,
    totalCharged,
    totalPaid,
    closingBalance: data.openingBalance + totalCharged - totalPaid,
  };
}

export function statementRangeLabel(from?: string | null, to?: string | null): string {
  if (from && to) return `${shortDate(from)} — ${shortDate(to)}`;
  if (from) return `From ${shortDate(from)}`;
  if (to) return `Up to ${shortDate(to)}`;
  return "All time";
}

export function statementHtml(data: StatementData): string {
  const money = (v: number) => formatCurrency(v, data.currency || "NGN");
  const { rows, totalCharged, totalPaid, closingBalance } = buildStatement(data);

  const bodyRows = rows.length
    ? rows
        .map(
          (r) => `<tr>
      <td style="white-space:nowrap">${shortDate(r.date)}</td>
      <td class="mono muted" style="font-size:11px">${esc(r.reference)}</td>
      <td>${esc(r.description)} ${statusChipHtml(r.status)}</td>
      <td class="num">${r.debit ? money(r.debit) : ""}</td>
      <td class="num" style="color:#15803d">${r.credit ? money(r.credit) : ""}</td>
      <td class="num" style="font-weight:600">${money(r.balance)}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="muted" style="padding:26px;text-align:center">No invoices or payments in this period.</td></tr>`;

  const body = `
  ${letterheadHtml(data.school, {
    kicker: "Finance",
    title: "Statement of Account",
    meta: [statementRangeLabel(data.from, data.to), `Generated ${shortDate(new Date().toISOString())}`],
  })}

  <div class="grid-2 card">
    <div>
      <p class="label">Student</p>
      <p class="value">${esc(data.studentName)}</p>
      <p class="muted" style="font-size:11.5px">${esc(data.studentIdNumber || "—")}${
        data.className ? ` • ${esc(data.className)}` : ""
      }</p>
    </div>
    <div style="text-align:right">
      ${
        data.guardianName
          ? `<p class="label">Guardian</p><p class="value">${esc(data.guardianName)}</p>`
          : ""
      }
      <p class="muted" style="margin-top:6px;font-size:11.5px">Filter: ${esc(
        STATEMENT_STATUS_FILTERS.find((f) => f.value === data.statusFilter)?.label || "All invoices"
      )}</p>
    </div>
  </div>

  <p class="section-title">Account activity</p>
  <div class="table-scroll">
  <table class="doc" style="min-width:520px">
    <thead><tr>
      <th>Date</th><th>Reference</th><th>Detail</th>
      <th style="text-align:right">Charged</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th>
    </tr></thead>
    <tbody>
      <tr>
        <td colspan="5" class="muted">Balance brought forward</td>
        <td class="num" style="font-weight:600">${money(data.openingBalance)}</td>
      </tr>
      ${bodyRows}
    </tbody>
  </table>
  </div>

  <div class="total-box">
    <div class="row"><span>Total charged</span><span class="mono">${money(totalCharged)}</span></div>
    <div class="row"><span>Total paid</span><span class="mono" style="color:#15803d">${money(totalPaid)}</span></div>
    <div class="row headline"><span>Balance outstanding</span><span class="mono">${money(closingBalance)}</span></div>
  </div>

  ${footerHtml(
    data.school,
    `This statement reflects invoices raised and payments recorded as at the date of printing.${
      data.generatedBy ? ` Issued by ${data.generatedBy}.` : ""
    }`
  )}
  ${printButtonHtml()}`;

  return documentShell(data.school, {
    title: `Statement of Account — ${data.studentName}`,
    body,
    maxWidth: 900,
  });
}

export function printStatement(data: StatementData) {
  return openDocument(statementHtml(data));
}

