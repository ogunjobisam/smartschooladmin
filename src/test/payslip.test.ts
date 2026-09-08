import { describe, it, expect } from "vitest";
import { buildPayslipHtml, maskAccount, payslipFileName, type PayslipData } from "@/lib/payslip";
import { calculatePayrollLine } from "@/lib/payroll";

const base: PayslipData = {
  school: { name: "Grace High School" },
  currency: "NGN",
  staffName: "Amina Bello",
  staffId: "GHS-STF/2026/0007",
  department: "Sciences",
  position: "Head of Chemistry",
  periodLabel: "March 2026",
  runDate: "2026-03-28",
  basic: 180000,
  allowances: 45000,
  pension: 14400,
  tax: 22500,
  deductions: 36900,
  netPay: 188100,
};

describe("buildPayslipHtml", () => {
  it("breaks deductions down when the split was recorded", () => {
    const html = buildPayslipHtml(base);
    expect(html).toContain("Pension");
    expect(html).toContain("Tax");
    expect(html).not.toContain("Total deductions");
  });

  it("shows one total for a run recorded before the split was stored", () => {
    // Rows written before the pension/tax columns existed carry 0/0. Showing a
    // breakdown there would be inventing one, so the payslip says only what the
    // school actually kept.
    const html = buildPayslipHtml({ ...base, pension: 0, tax: 0 });
    expect(html).toContain("Total deductions");
    expect(html).not.toMatch(/>Pension</);
    expect(html).not.toMatch(/>Tax</);
  });

  it("treats a missing split the same as a zero one", () => {
    const { pension: _p, tax: _t, ...withoutSplit } = base;
    expect(buildPayslipHtml(withoutSplit)).toContain("Total deductions");
  });

  it("accounts for every naira withheld when the split does not cover the total", () => {
    // A deductions total larger than pension + tax must not silently vanish —
    // the lines on a payslip have to add up to what left someone's pay.
    const html = buildPayslipHtml({ ...base, deductions: 40000 });
    expect(html).toContain("Other deductions");
  });

  it("agrees with the payroll calculation it is rendering", () => {
    const line = calculatePayrollLine({
      basic_salary: 180000,
      housing_allowance: 30000,
      transport_allowance: 15000,
      pension_rate: 8,
      tax_rate: 10,
    });
    const html = buildPayslipHtml({
      ...base,
      basic: line.basic,
      allowances: line.allowances,
      pension: line.pension,
      tax: line.tax,
      deductions: line.deductions,
      netPay: line.netPay,
    });
    expect(line.basic + line.allowances - line.deductions).toBe(line.netPay);
    expect(html).toContain("Net pay");
  });

  it("escapes names rather than letting them close a tag", () => {
    const html = buildPayslipHtml({
      ...base,
      staffName: `O'Brien <script>alert(1)</script>`,
      school: { name: `St Mary's & "Co"` },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("uses the organisation's currency, not a hardcoded one", () => {
    const ngn = buildPayslipHtml(base);
    const ghs = buildPayslipHtml({ ...base, currency: "GHS" });
    expect(ngn).not.toEqual(ghs);
  });

  it("renders a logo when there is one and the school initial when there is not", () => {
    const withLogo = buildPayslipHtml({
      ...base,
      school: { ...base.school, logoUrl: "https://example.test/logo.png" },
    });
    expect(withLogo).toContain(`<img src="https://example.test/logo.png"`);

    // No logo: a lettered block stands in, rather than a broken image or a gap.
    const withoutLogo = buildPayslipHtml(base);
    expect(withoutLogo).not.toContain("<img");
    expect(withoutLogo).toMatch(/<div style="height:52px[^"]*">G<\/div>/);
  });

  it("drops the print button in preview, where the app supplies its own", () => {
    expect(buildPayslipHtml(base)).toContain("window.print()");
    expect(buildPayslipHtml(base, { preview: true })).not.toContain("window.print()");
  });

  it("marks an approved-but-unpaid run so nobody reads it as money received", () => {
    expect(buildPayslipHtml({ ...base, status: "approved" })).toContain("approved");
    expect(buildPayslipHtml({ ...base, status: "paid" })).not.toMatch(/>paid</);
  });
});

describe("maskAccount", () => {
  it("shows the last four digits only", () => {
    expect(maskAccount("0123456789")).toBe("••••6789");
  });

  it("ignores separators when counting digits", () => {
    expect(maskAccount("0123 4567 89")).toBe("••••6789");
  });

  it("returns nothing rather than a misleading mask for a too-short value", () => {
    expect(maskAccount("12")).toBeNull();
    expect(maskAccount(null)).toBeNull();
    expect(maskAccount(undefined)).toBeNull();
  });
});

describe("payslipFileName", () => {
  it("is something a person can find again in a downloads folder", () => {
    expect(payslipFileName(base)).toBe("payslip-amina-bello-march-2026");
  });

  it("survives punctuation in a name", () => {
    expect(payslipFileName({ ...base, staffName: "O'Brien, Seán" })).toMatch(/^payslip-o-brien-se-n-/);
  });
});

describe("payroll money units", () => {
  it("is whole currency units, so the bank batch must not divide by 100", () => {
    // Regression guard. The bank batch export used to write `net_pay / 100`,
    // sending a ₦150,000 salary to the bank as 1500.00. Nothing stores kobo:
    // calculatePayrollLine rounds the profile's naira figures straight through.
    const line = calculatePayrollLine({ basic_salary: 150000 });
    expect(line.basic).toBe(150000);
    expect(line.netPay).toBe(150000);
    expect(line.netPay.toFixed(2)).toBe("150000.00");
  });
});
