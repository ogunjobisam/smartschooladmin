/**
 * Payroll calculation.
 *
 * All money values are whole currency units (naira, not kobo) stored as BIGINT,
 * matching the payroll_profiles and payroll_run_items columns. Rates are
 * percentages, so 7.5 means 7.5%.
 */

export interface PayrollProfileInput {
  basic_salary?: number | null;
  housing_allowance?: number | null;
  transport_allowance?: number | null;
  other_allowances?: number | null;
  pension_rate?: number | null;
  tax_rate?: number | null;
}

export interface PayrollLine {
  basic: number;
  allowances: number;
  pension: number;
  tax: number;
  deductions: number;
  gross: number;
  netPay: number;
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Work out one staff member's pay for a period.
 *
 * Pension is charged on basic salary and tax on gross, which is the common
 * Nigerian arrangement and the one the salary-change fields are named for.
 * Net pay is floored at zero so a misconfigured rate cannot produce a negative
 * payslip.
 */
export function calculatePayrollLine(profile: PayrollProfileInput): PayrollLine {
  const basic = Math.max(0, Math.round(num(profile.basic_salary)));
  const allowances = Math.max(
    0,
    Math.round(
      num(profile.housing_allowance) + num(profile.transport_allowance) + num(profile.other_allowances)
    )
  );
  const gross = basic + allowances;

  const pensionRate = Math.min(100, Math.max(0, num(profile.pension_rate)));
  const taxRate = Math.min(100, Math.max(0, num(profile.tax_rate)));

  const pension = Math.round((basic * pensionRate) / 100);
  const tax = Math.round((gross * taxRate) / 100);
  const deductions = Math.min(gross, pension + tax);

  return { basic, allowances, pension, tax, deductions, gross, netPay: gross - deductions };
}

export interface PayrollTotals {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  staffCount: number;
}

export function sumPayrollLines(lines: PayrollLine[]): PayrollTotals {
  return lines.reduce<PayrollTotals>(
    (acc, l) => ({
      totalGross: acc.totalGross + l.gross,
      totalDeductions: acc.totalDeductions + l.deductions,
      totalNet: acc.totalNet + l.netPay,
      staffCount: acc.staffCount + 1,
    }),
    { totalGross: 0, totalDeductions: 0, totalNet: 0, staffCount: 0 }
  );
}

/** "March 2026" style label used as payroll_runs.period_label. */
export function periodLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** The last N months, newest first, as { value, label } for a period picker. */
export function recentPeriods(count = 12, from = new Date()): { value: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    const label = periodLabel(d);
    return { value: label, label };
  });
}

/**
 * Salary-change requests store values as text because the field being changed
 * can be an amount or a rate. This narrows a request back to a typed update.
 */
export const SALARY_FIELDS = [
  "basic_salary",
  "housing_allowance",
  "transport_allowance",
  "other_allowances",
  "pension_rate",
  "tax_rate",
] as const;

export type SalaryField = (typeof SALARY_FIELDS)[number];

export function isSalaryField(field: string): field is SalaryField {
  return (SALARY_FIELDS as readonly string[]).includes(field);
}

/** Rates keep decimals; amounts are whole units. Returns null if unparseable. */
export function parseSalaryValue(field: SalaryField, raw: string): number | null {
  const cleaned = String(raw).replace(/,/g, "").trim();
  // Number("") is 0, which would quietly zero out a salary on an empty field.
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const isRate = field === "pension_rate" || field === "tax_rate";
  if (isRate) return parsed > 100 ? null : Math.round(parsed * 100) / 100;
  return Math.round(parsed);
}
