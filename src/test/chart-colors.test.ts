import { describe, it, expect } from "vitest";
import {
  CHART_OTHER,
  CHART_SERIES,
  STATUS_COLOURS,
  topWithOther,
} from "@/lib/chart-colors";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `m${i}`, value: 100 - i }));

describe("topWithOther", () => {
  it("passes a short list straight through, in palette order", () => {
    const out = topWithOther(rows(3));
    expect(out.map((r) => r.name)).toEqual(["m0", "m1", "m2"]);
    expect(out.map((r) => r.fill)).toEqual([CHART_SERIES[0], CHART_SERIES[1], CHART_SERIES[2]]);
  });

  it("uses the whole palette when the list fills it exactly", () => {
    const out = topWithOther(rows(5));
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.fill)).toEqual([...CHART_SERIES]);
    expect(out.some((r) => r.name.startsWith("Other"))).toBe(false);
  });

  it("rolls the tail up rather than wrapping back onto slot 1", () => {
    // The bug this exists to prevent: a sixth category rendered in the first
    // category's colour, which reads as the same thing twice.
    const out = topWithOther(rows(9));
    expect(out).toHaveLength(5);
    expect(out[4].name).toBe("Other (5)");
    expect(out[4].fill).toBe(CHART_OTHER);
    expect(new Set(out.map((r) => r.fill)).size).toBe(5);
    expect(out.map((r) => r.fill)).not.toContain(CHART_SERIES[4]);
  });

  it("keeps every naira when it rolls up", () => {
    const input = rows(9);
    const total = input.reduce((s, r) => s + r.value, 0);
    expect(topWithOther(input).reduce((s, r) => s + r.value, 0)).toBe(total);
  });

  it("handles an empty list", () => {
    expect(topWithOther([])).toEqual([]);
  });

  it("respects a smaller limit", () => {
    const out = topWithOther(rows(5), 3);
    expect(out.map((r) => r.name)).toEqual(["m0", "m1", "Other (3)"]);
  });
});

describe("the two palettes stay separate", () => {
  it("never spends a reserved status colour as a series", () => {
    // A status colour reused as "series 4" makes an ordinary category look
    // like a problem, and a real problem look like an ordinary category.
    for (const status of Object.values(STATUS_COLOURS)) {
      expect(CHART_SERIES as readonly string[]).not.toContain(status);
    }
  });

  it("keeps the series colours distinct from each other", () => {
    expect(new Set(CHART_SERIES).size).toBe(CHART_SERIES.length);
  });
});
