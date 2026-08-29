import { formatCurrency } from "@/lib/format";

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

  const logo = data.school.logoUrl
    ? `<img src="${esc(data.school.logoUrl)}" alt="" style="height:52px;width:52px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:52px;width:52px;border-radius:8px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700">${esc(
        (data.school.name || "S").charAt(0)
      )}</div>`;

  const statusChip = (status?: string | null) =>
    status
      ? `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;background:#f1f5f9;color:#475569">${esc(
          status
        )}</span>`
      : "";

  const bodyRows = rows.length
    ? rows
        .map(
          (r) => `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;white-space:nowrap">${shortDate(r.date)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;font-family:monospace;font-size:11px;color:#475569">${esc(r.reference)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1">${esc(r.description)} ${statusChip(r.status)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;text-align:right;font-family:monospace">${r.debit ? money(r.debit) : ""}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;text-align:right;font-family:monospace;color:#15803d">${r.credit ? money(r.credit) : ""}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;text-align:right;font-family:monospace;font-weight:600">${money(r.balance)}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="6" style="padding:24px;text-align:center;color:#64748b">No invoices or payments in this period.</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Statement of Account — ${esc(data.studentName)}</title>
<style>
  @page { margin: 16mm; }
  @media print { .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0f172a; max-width: 900px; margin: 0 auto; padding: 32px 24px; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
    <div style="display:flex;gap:12px;align-items:center">
      ${logo}
      <div>
        <h1 style="margin:0;font-size:18px">${esc(data.school.name)}</h1>
        ${data.school.address ? `<p style="margin:2px 0;font-size:11px;color:#64748b">${esc(data.school.address)}</p>` : ""}
        ${
          data.school.email || data.school.phone
            ? `<p style="margin:2px 0;font-size:11px;color:#64748b">${esc(data.school.email || "")}${
                data.school.email && data.school.phone ? " • " : ""
              }${esc(data.school.phone || "")}</p>`
            : ""
        }
      </div>
    </div>
    <div style="text-align:right">
      <p style="margin:0;font-size:16px;font-weight:700;letter-spacing:.02em">STATEMENT OF ACCOUNT</p>
      <p style="margin:4px 0 0;font-size:11px;color:#64748b">${esc(statementRangeLabel(data.from, data.to))}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#64748b">Generated ${shortDate(new Date().toISOString())}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0 16px;padding:14px;border:1px solid #e6ebf1;border-radius:10px;background:#f8fafc">
    <div>
      <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b">Student</p>
      <p style="margin:3px 0 0;font-weight:600">${esc(data.studentName)}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#475569">${esc(data.studentIdNumber || "—")}${
        data.className ? ` • ${esc(data.className)}` : ""
      }</p>
    </div>
    <div style="text-align:right">
      ${data.guardianName ? `<p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b">Guardian</p><p style="margin:3px 0 0;font-weight:600">${esc(data.guardianName)}</p>` : ""}
      <p style="margin:6px 0 0;font-size:11px;color:#475569">Filter: ${esc(
        STATEMENT_STATUS_FILTERS.find((f) => f.value === data.statusFilter)?.label || "All invoices"
      )}</p>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th>Date</th><th>Reference</th><th>Detail</th>
      <th style="text-align:right">Charged</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th>
    </tr></thead>
    <tbody>
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;color:#64748b" colspan="5">Balance brought forward</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6ebf1;text-align:right;font-family:monospace;font-weight:600">${money(data.openingBalance)}</td>
      </tr>
      ${bodyRows}
    </tbody>
  </table>

  <div style="margin-top:18px;display:flex;justify-content:flex-end">
    <table style="font-size:13px;border-collapse:collapse;min-width:280px">
      <tr><td style="padding:4px 10px;color:#64748b">Total charged</td><td style="padding:4px 10px;text-align:right;font-family:monospace">${money(totalCharged)}</td></tr>
      <tr><td style="padding:4px 10px;color:#64748b">Total paid</td><td style="padding:4px 10px;text-align:right;font-family:monospace;color:#15803d">${money(totalPaid)}</td></tr>
      <tr><td style="padding:8px 10px;font-weight:700;border-top:2px solid #cbd5e1">Balance outstanding</td>
          <td style="padding:8px 10px;text-align:right;font-family:monospace;font-weight:700;border-top:2px solid #cbd5e1;color:${
            closingBalance > 0 ? "#b91c1c" : "#15803d"
          }">${money(closingBalance)}</td></tr>
    </table>
  </div>

  <p style="margin-top:28px;font-size:11px;color:#64748b;border-top:1px solid #e6ebf1;padding-top:10px">
    This statement reflects invoices raised and payments recorded by the school as at the date of printing.
    If anything looks wrong, please contact the school office${data.school.phone ? ` on ${esc(data.school.phone)}` : ""}.
    ${data.generatedBy ? `Issued by ${esc(data.generatedBy)}.` : ""}
  </p>

  <div class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="padding:10px 22px;background:#0f172a;color:#fff;border:0;border-radius:8px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
  </div>
</body></html>`;
}

export function printStatement(data: StatementData) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(statementHtml(data));
  win.document.close();
  return true;
}
