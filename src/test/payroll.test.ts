import { describe, it, expect } from "vitest";
import {
  calculatePayrollLine,
  sumPayrollLines,
  periodLabel,
  recentPeriods,
  isSalaryField,
  parseSalaryValue,
} from "@/lib/payroll";

describe("calculatePayrollLine", () => {
  it("charges pension on basic and tax on gross", () => {
    const line = calculatePayrollLine({
      basic_salary: 200_000,
      housing_allowance: 50_000,
      transport_allowance: 30_000,
      other_allowances: 20_000,
      pension_rate: 7.5,
      tax_rate: 10,
    });

    expect(line.basic).toBe(200_000);
    expect(line.allowances).toBe(100_000);
    expect(line.gross).toBe(300_000);
    expect(line.pension).toBe(15_000); // 7.5% of basic
    expect(line.tax).toBe(30_000); // 10% of gross
    expect(line.deductions).toBe(45_000);
    expect(line.netPay).toBe(255_000);
  });

  it("treats a missing profile as zero rather than NaN", () => {
    const line = calculatePayrollLine({});
    expect(line).toMatchObject({ basic: 0, allowances: 0, gross: 0, deductions: 0, netPay: 0 });
  });

  it("ignores null and undefined components", () => {
    const line = calculatePayrollLine({
      basic_salary: 100_000,
      housing_allowance: null,
      transport_allowance: undefined,
      pension_rate: null,
      tax_rate: 5,
    });
    expect(line.gross).toBe(100_000);
    expect(line.pension).toBe(0);
    expect(line.tax).toBe(5_000);
    expect(line.netPay).toBe(95_000);
  });

  it("never produces a negative payslip when rates are misconfigured", () => {
    const line = calculatePayrollLine({ basic_salary: 100_000, pension_rate: 90, tax_rate: 90 });
    expect(line.deductions).toBe(100_000);
    expect(line.netPay).toBe(0);
  });

  it("clamps out-of-range rates instead of trusting them", () => {
    const line = calculatePayrollLine({ basic_salary: 100_000, pension_rate: -5, tax_rate: 500 });
    expect(line.pension).toBe(0);
    expect(line.tax).toBe(100_000);
  });
});

describe("sumPayrollLines", () => {
  it("totals a run", () => {
    const lines = [
      calculatePayrollLine({ basic_salary: 100_000, tax_rate: 10 }),
      calculatePayrollLine({ basic_salary: 200_000, tax_rate: 10 }),
    ];
    expect(sumPayrollLines(lines)).toEqual({
      totalGross: 300_000,
      totalDeductions: 30_000,
      totalNet: 270_000,
      staffCount: 2,
    });
  });

  it("returns zeroes for an empty run", () => {
    expect(sumPayrollLines([])).toEqual({
      totalGross: 0,
      totalDeductions: 0,
      totalNet: 0,
      staffCount: 0,
    });
  });
});

describe("period helpers", () => {
  it("labels a period by month and year", () => {
    expect(periodLabel(new Date(2026, 2, 15))).toBe("March 2026");
  });

  it("walks back across a year boundary", () => {
    const periods = recentPeriods(3, new Date(2026, 1, 10));
    expect(periods.map((p) => p.value)).toEqual(["February 2026", "January 2026", "December 2025"]);
  });
});

describe("salary field parsing", () => {
  it("recognises only known fields", () => {
    expect(isSalaryField("basic_salary")).toBe(true);
    expect(isSalaryField("id")).toBe(false);
    expect(isSalaryField("../../etc")).toBe(false);
  });

  it("rounds amounts to whole units and strips separators", () => {
    expect(parseSalaryValue("basic_salary", "250,000")).toBe(250_000);
    expect(parseSalaryValue("basic_salary", "250000.6")).toBe(250_001);
  });

  it("keeps two decimals on rates and rejects impossible ones", () => {
    expect(parseSalaryValue("pension_rate", "7.55")).toBe(7.55);
    expect(parseSalaryValue("tax_rate", "150")).toBeNull();
  });

  it("rejects negatives and non-numbers", () => {
    expect(parseSalaryValue("basic_salary", "-100")).toBeNull();
    expect(parseSalaryValue("basic_salary", "abc")).toBeNull();
    expect(parseSalaryValue("basic_salary", "")).toBeNull();
  });
});

describe("payroll run lifecycle", () => {
  it("lets a draft be edited, submitted or deleted", () => {
    expect(actionsForStatus("draft")).toEqual(["edit", "submit", "delete"]);
  });

  it("locks a paid run", () => {
    expect(actionsForStatus("paid")).toEqual([]);
  });

  it("only lets approvers sign off a submitted run", () => {
    expect(payrollActions("pending", ["bursar"])).toEqual(["return_to_draft"]);
    expect(payrollActions("pending", ["principal"])).toEqual(["approve", "reject"]);
  });

  it("lets payroll managers pay an approved run", () => {
    expect(payrollActions("approved", ["bursar"])).toEqual(["mark_paid"]);
    expect(payrollActions("approved", ["teacher"])).toEqual([]);
  });

  it("lets a rejected run be reopened", () => {
    expect(payrollActions("rejected", ["hr_admin"])).toEqual(["return_to_draft", "delete"]);
  });
});
