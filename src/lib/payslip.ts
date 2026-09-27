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
 * Printable payslip.
 *
 * A payslip is the one document a staff member keeps: it is what a bank, a
 * landlord or a lender asks for. So it is built the way every other document in
 * this app is built — as a complete standalone HTML document with its own inline
 * styles — rather than by scraping the rendered page, which is what this replaced.
 * The old version copied `innerHTML` out of the live DOM into a popup carrying
 * none of the app's stylesheet, so the printed result arrived stripped of its
 * layout and without the school's logo, address or contact details.
 *
 * Money is in whole currency units throughout, matching payroll_run_items and the
 * convention set out in `payroll.ts`.
 */

export interface PayslipSchool {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
}

export interface PayslipData {
  school: PayslipSchool;
  currency?: string;

  staffName: string;
  staffId?: string | null;
  department?: string | null;
  position?: string | null;

  periodLabel: string;
  runDate: string;
  /** Shown as a chip when the run is approved but not yet paid. */
  status?: string | null;

  basic: number;
  allowances: number;
  /** Authoritative total. Always equals what was actually withheld. */
  deductions: number;
  /**
   * The split behind `deductions`. Both are 0 for runs recorded before the split
   * was stored, in which case the payslip shows a single total rather than
   * implying a breakdown nobody kept.
   */
  pension?: number;
  tax?: number;
  netPay: number;

  bankName?: string | null;
  accountNumber?: string | null;
}

export interface PayslipRenderOptions {
  /** Drop the print button when the document is being shown inside the app. */
  preview?: boolean;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Last four digits only — a payslip should confirm the account, not restate it. */
export function maskAccount(accountNumber?: string | null): string | null {
  const digits = String(accountNumber ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `••••${digits.slice(-4)}`;
}

/** A filename a person can find again in their downloads folder. */
export function payslipFileName(data: PayslipData): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const name = slug(data.staffName) || "payslip";
  const period = slug(data.periodLabel);
  return period ? `payslip-${name}-${period}` : `payslip-${name}`;
}

export function buildPayslipHtml(data: PayslipData, opts: PayslipRenderOptions = {}): string {
  const { preview = false } = opts;
  const money = (v: number) => formatCurrency(v, data.currency || "NGN");

  const gross = data.basic + data.allowances;
  const pension = data.pension ?? 0;
  const tax = data.tax ?? 0;
  // Only trust the split when it was actually recorded. Anything left over after
  // pension and tax is shown as "Other", so the lines always sum to the total the
  // staff member was really docked rather than quietly disagreeing with it.
  const hasSplit = pension > 0 || tax > 0;
  const other = Math.max(0, data.deductions - pension - tax);

  const field = (label: string, value: string) => `
    <div>
      <p class="label">${esc(label)}</p>
      <p class="value">${esc(value)}</p>
    </div>`;

  const masked = maskAccount(data.accountNumber);
  const bankLine =
    data.bankName || masked ? field("Paid into", [data.bankName, masked].filter(Boolean).join(" ")) : "";

  const row = (label: string, amount: string, style = "") =>
    `<tr>
      <td style="${style}">${esc(label)}</td>
      <td class="num" style="${style}">${amount}</td>
    </tr>`;

  const deductionRows = hasSplit
    ? [
        pension > 0 ? row("Pension", `−${money(pension)}`, "color:#b91c1c") : "",
        tax > 0 ? row("Tax", `−${money(tax)}`, "color:#b91c1c") : "",
        other > 0 ? row("Other deductions", `−${money(other)}`, "color:#b91c1c") : "",
      ].join("")
    : row("Total deductions", `−${money(data.deductions)}`, "color:#b91c1c");

  const statusChip =
    data.status && data.status !== "paid" ? `<p style="margin-top:6px">${statusChipHtml(data.status)}</p>` : "";

  const body = `
  ${letterheadHtml(data.school, {
    kicker: "Payslip",
    title: data.periodLabel,
    meta: [`Pay date ${shortDate(data.runDate)}`],
    extra: statusChip,
  })}

  <div class="card grid-2">
    ${field("Employee", data.staffName)}
    ${field("Staff ID", data.staffId || "—")}
    ${field("Position", data.position || "—")}
    ${field("Department", data.department || "—")}
    ${bankLine}
  </div>

  <p class="section-title">Earnings &amp; deductions</p>
  <table class="doc">
    <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${row("Basic salary", money(data.basic))}
      ${row("Allowances", money(data.allowances))}
      ${row("Gross pay", money(gross), "font-weight:700")}
      ${deductionRows}
    </tbody>
  </table>

  <div class="total-box">
    <div class="row"><span>Gross pay</span><span class="mono">${money(gross)}</span></div>
    <div class="row"><span>Deductions</span><span class="mono" style="color:#b91c1c">−${money(
      data.deductions
    )}</span></div>
    <div class="row headline"><span>Net pay</span><span class="mono">${money(data.netPay)}</span></div>
  </div>

  ${footerHtml(
    data.school,
    "This is a computer-generated payslip and does not require a signature. If anything looks wrong, please contact the school office."
  )}
  ${preview ? "" : printButtonHtml()}`;

  return documentShell(data.school, {
    title: `Payslip — ${data.staffName} — ${data.periodLabel}`,
    body,
    maxWidth: 820,
    // A payslip is always one sheet per employee: keep the blocks together and
    // trim the printed spacing so nothing tips over onto a second page.
    extraCss: `
      .card, table.doc, .total-box, .doc-foot { page-break-inside: avoid; break-inside: avoid; }
      @media print {
        body { padding: 0; }
        .section-title { margin: 16px 0 8px; }
        .total-box { margin-top: 12px; }
        .doc-foot { margin-top: 18px; }
        .doc-rule { margin: 10px 0 16px; }
      }
    `,
  });
}

export function printPayslip(data: PayslipData): boolean {
  return openDocument(buildPayslipHtml(data));
}

