import { formatCurrency } from "@/lib/format";

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

  const logo = data.school.logoUrl
    ? `<img src="${esc(data.school.logoUrl)}" alt="" style="height:52px;width:52px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:52px;width:52px;border-radius:8px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700">${esc(
        (data.school.name || "S").charAt(0)
      )}</div>`;

  const field = (label: string, value: string) => `
    <div>
      <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b">${esc(label)}</p>
      <p style="margin:3px 0 0;font-weight:600">${esc(value)}</p>
    </div>`;

  const masked = maskAccount(data.accountNumber);
  const bankLine =
    data.bankName || masked
      ? field("Paid into", [data.bankName, masked].filter(Boolean).join(" "))
      : "";

  const row = (label: string, amount: string, style = "") =>
    `<tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e6ebf1;${style}">${esc(label)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e6ebf1;text-align:right;font-family:monospace;${style}">${amount}</td>
    </tr>`;

  const deductionRows = hasSplit
    ? [
        pension > 0 ? row("Pension", `−${money(pension)}`, "color:#b91c1c") : "",
        tax > 0 ? row("Tax", `−${money(tax)}`, "color:#b91c1c") : "",
        other > 0 ? row("Other deductions", `−${money(other)}`, "color:#b91c1c") : "",
      ].join("")
    : row("Total deductions", `−${money(data.deductions)}`, "color:#b91c1c");

  const statusChip =
    data.status && data.status !== "paid"
      ? `<span style="display:inline-block;margin-left:8px;padding:1px 8px;border-radius:10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;background:#f1f5f9;color:#475569">${esc(
          data.status
        )}</span>`
      : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payslip — ${esc(data.staffName)} — ${esc(data.periodLabel)}</title>
<style>
  @page { margin: 16mm; }
  @media print { .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0f172a; max-width: 820px; margin: 0 auto; padding: 32px 24px; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #cbd5e1; }
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
      <p style="margin:0;font-size:16px;font-weight:700;letter-spacing:.02em">PAYSLIP${statusChip}</p>
      <p style="margin:4px 0 0;font-size:11px;color:#64748b">${esc(data.periodLabel)}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#64748b">Pay date ${shortDate(data.runDate)}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0 16px;padding:14px;border:1px solid #e6ebf1;border-radius:10px;background:#f8fafc">
    ${field("Employee", data.staffName)}
    ${field("Staff ID", data.staffId || "—")}
    ${field("Position", data.position || "—")}
    ${field("Department", data.department || "—")}
    ${bankLine}
  </div>

  <table style="width:100%;border-collapse:collapse">
    <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${row("Basic salary", money(data.basic))}
      ${row("Allowances", money(data.allowances))}
      ${row("Gross pay", money(gross), "font-weight:600")}
      ${deductionRows}
    </tbody>
  </table>

  <div style="margin-top:18px;display:flex;justify-content:flex-end">
    <table style="font-size:13px;border-collapse:collapse;min-width:300px">
      <tr>
        <td style="padding:10px 12px;font-weight:700;border-top:2px solid #cbd5e1">Net pay</td>
        <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:700;font-size:15px;border-top:2px solid #cbd5e1">${money(
          data.netPay
        )}</td>
      </tr>
    </table>
  </div>

  <p style="margin-top:28px;font-size:11px;color:#64748b;border-top:1px solid #e6ebf1;padding-top:10px">
    This is a computer-generated payslip and does not require a signature.
    If anything looks wrong, please contact the school office${
      data.school.phone ? ` on ${esc(data.school.phone)}` : ""
    }.
  </p>
${
  preview
    ? ""
    : `
  <div class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="padding:10px 22px;background:#0f172a;color:#fff;border:0;border-radius:8px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
  </div>`
}
</body></html>`;
}

export function printPayslip(data: PayslipData): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildPayslipHtml(data));
  win.document.close();
  return true;
}
