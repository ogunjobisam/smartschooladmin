import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { getErrorMessage } from "@/lib/errors";

describe("formatCurrency", () => {
  it("formats the org currency with its own locale", () => {
    expect(formatCurrency(1500, "NGN")).toContain("1,500");
    expect(formatCurrency(1500, "GBP")).toContain("1,500");
  });

  it("rounds to whole units", () => {
    expect(formatCurrency(1500.4, "NGN")).not.toContain(".");
  });

  it("falls back to a readable string for an unknown currency code", () => {
    expect(formatCurrency(1500, "NOTREAL")).toBe("NOTREAL 1,500");
  });

  it("defaults to NGN", () => {
    expect(formatCurrency(10)).toBe(formatCurrency(10, "NGN"));
  });
});

describe("formatCurrencyCompact", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatCurrencyCompact(2_500_000, "NGN")).toBe("₦2.5M");
    expect(formatCurrencyCompact(4_000, "NGN")).toBe("₦4K");
    expect(formatCurrencyCompact(750, "NGN")).toBe("₦750");
  });

  it("abbreviates negative amounts rather than printing them in full", () => {
    // Outstanding balances can go negative when a payment overshoots an invoice.
    expect(formatCurrencyCompact(-2_500_000, "NGN")).toBe("-₦2.5M");
    expect(formatCurrencyCompact(-4_000, "NGN")).toBe("-₦4K");
  });

  it("uses the currency code when it has no symbol mapping", () => {
    expect(formatCurrencyCompact(3_000, "XOF")).toBe("XOF 3K");
  });
});

describe("getErrorMessage", () => {
  it("reads the message off an Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("accepts a bare string", () => {
    expect(getErrorMessage("boom")).toBe("boom");
  });

  it("reads Supabase-style error objects that are not Error instances", () => {
    expect(getErrorMessage({ message: "row violates policy" })).toBe("row violates policy");
  });

  it("falls back for values with nothing useful on them", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage({}, "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});
