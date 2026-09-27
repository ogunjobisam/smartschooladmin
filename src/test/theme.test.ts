import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  hexToHsl,
  schoolThemeVars,
} from "@/lib/theme";

/** The `:root { … }` block of the stylesheet, as `{ "--token": "h s% l%" }`. */
function rootTokens(): Record<string, string> {
  const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
  const block = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/);
  if (!block) throw new Error("no :root block in src/index.css");
  const out: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/(--[a-z-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

describe("hexToHsl", () => {
  it("reads a six-digit hex", () => {
    expect(hexToHsl("#15255b")).toEqual({ h: 226, s: 63, l: 22 });
    expect(hexToHsl("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl("#000000")).toEqual({ h: 0, s: 0, l: 0 });
  });

  it("falls back rather than producing NaN on anything else", () => {
    // These all arrive from a free-text settings field, and a NaN triple would
    // blank the whole theme rather than fail visibly.
    for (const bad of ["", "#fff", "navy", "rgb(1,2,3)", "#12345", "#xyzxyz"]) {
      const { h, s, l } = hexToHsl(bad);
      expect(Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)).toBe(false);
      expect(hexToHsl(bad)).toEqual(hexToHsl(DEFAULT_PRIMARY));
    }
  });
});

describe("schoolThemeVars", () => {
  it("reproduces the :root block from the two default brand colours", () => {
    // The point of the whole exercise: the stylesheet's defaults and the
    // derivation are the same thing, so a school that has not chosen colours
    // renders byte-identically to the hard-coded palette. If this fails,
    // either index.css or theme.ts moved without the other.
    const root = rootTokens();
    const derived = schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT);
    for (const [token, value] of Object.entries(derived)) {
      expect(root[token], `${token} missing from :root`).toBeDefined();
      expect(value, `${token} drifted from :root`).toBe(root[token]);
    }
  });

  it("leaves the status and ledger tokens alone", () => {
    // Success, destructive and the row tints carry meaning, not brand, so a
    // school's colours must not be able to repaint "overdue" as its accent.
    const derived = schoolThemeVars("#7f1d3a", "#9ca3af");
    for (const token of [
      "--destructive", "--success", "--warning", "--tint-paid", "--tint-owing",
    ]) {
      expect(derived[token]).toBeUndefined();
    }
  });

  it("keeps gold dark enough to draw a boundary whatever the school picked", () => {
    // --gold outlines edge bars and dashed borders, which owe 3:1 under WCAG
    // 1.4.11, so a pale accent must not carry straight through to it.
    for (const accent of ["#ffe680", "#fffbe6", "#bc9529"]) {
      const { "--gold": gold, "--gold-ink": ink } = schoolThemeVars(DEFAULT_PRIMARY, accent);
      expect(Number(gold.match(/(\d+)%$/)![1])).toBeLessThanOrEqual(40);
      expect(ink.endsWith("32%")).toBe(true);
    }
  });

  it("keeps a grey accent chromatic enough for gold to read as gold", () => {
    const { "--gold": gold } = schoolThemeVars(DEFAULT_PRIMARY, "#9ca3af");
    expect(Number(gold.split(" ")[1].replace("%", ""))).toBeGreaterThanOrEqual(20);
  });

  it("keeps --primary dark enough to carry pale text", () => {
    // --primary is a background for --primary-foreground, so a school choosing
    // a pale colour must not end up with white-on-white buttons.
    for (const primary of ["#ffffff", "#bfdbfe", "#15255b"]) {
      const vars = schoolThemeVars(primary, DEFAULT_ACCENT);
      expect(Number(vars["--primary"].match(/(\d+)%$/)![1])).toBeLessThanOrEqual(42);
    }
  });

  it("flips the accent's own ink when the accent is too dark for navy text", () => {
    const light = schoolThemeVars(DEFAULT_PRIMARY, "#e8c65a");
    const dark = schoolThemeVars(DEFAULT_PRIMARY, "#2b1a00");
    expect(Number(light["--accent-foreground"].match(/(\d+)%$/)![1])).toBeLessThan(50);
    expect(Number(dark["--accent-foreground"].match(/(\d+)%$/)![1])).toBeGreaterThan(50);
  });

  it("leaves the default's gold-on-navy unlifted", () => {
    // The navy default already clears 3:1, so --gold-on-primary must come out
    // identical to --gold: anything else would silently shift the shipped look.
    const v = schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT);
    expect(v["--gold-on-primary"]).toBe(v["--gold"]);
  });

  it("follows the school's own hues, not the default ones", () => {
    const vars = schoolThemeVars("#5b1520", "#6b7f2a"); // maroon and olive
    expect(vars["--primary"]).toBe("351 63% 22%");
    expect(vars["--gold"]).toBe("74 50% 33%");
    expect(vars["--sidebar-background"]).toBe("351 66% 15%");
    // …and the pale ground follows the accent, so cream becomes a pale olive
    // rather than staying warm yellow next to a maroon chrome.
    expect(vars["--background"]).toBe("76 56% 95%");
  });
});

/**
 * The chrome's contrast has to hold for whatever two colours a school picks in
 * Settings, not just for the navy and gold in the screenshots. Before these
 * ran, a teal-and-amber school got a metric tile whose icon measured 1.66:1
 * against its own tile — invisible — and four of the seven brands below had a
 * sidebar active item that failed AA.
 */
describe("contrast holds across brands", () => {
  const WHITE = "0 0% 100%";

  const BRANDS: [string, string, string][] = [
    ["navy & gold (the default)", DEFAULT_PRIMARY, DEFAULT_ACCENT],
    ["maroon & olive", "#5b1520", "#8a7a2f"],
    ["forest & copper", "#123024", "#b06a2a"],
    ["teal & amber", "#0f766e", "#f59e0b"],
    ["slate & blue", "#1e293b", "#3b82f6"],
    ["plum & rose", "#3b0a45", "#d94f7a"],
    ["black & grey", "#000000", "#9ca3af"],
    ["a school that typed nonsense", "not-a-colour", ""],
  ];

  // [what it is, ink token, ground token (null = a white card), minimum].
  // 3 is WCAG 1.4.11 for a boundary or an icon; 4.5 is AA for small text.
  const PAIRS: [string, string, string | null, number][] = [
    ["the gold glyph on a navy tile", "--gold-on-primary", "--primary", 3],
    ["the navy glyph on a gold tile", "--primary", "--gold-on-primary", 3],
    ["a gold rule on cream", "--gold", "--background", 3],
    ["a gold rule on a white card", "--gold", null, 3],
    ["the gold eyebrow on a panel band", "--gold-ink", "--panel-band", 4.5],
    ["the gold eyebrow on a white card", "--gold-ink", null, 4.5],
    ["body text on cream", "--foreground", "--background", 4.5],
    ["pale text on navy", "--primary-foreground", "--primary", 4.5],
    ["sidebar text", "--sidebar-foreground", "--sidebar-background", 4.5],
    ["the sidebar's active item", "--sidebar-primary-foreground", "--sidebar-primary", 4.5],
    ["ink on the accent", "--accent-foreground", "--accent", 4.5],
  ];

  for (const [brand, primary, accent] of BRANDS) {
    describe(brand, () => {
      const vars = schoolThemeVars(primary, accent);
      for (const [what, ink, ground, min] of PAIRS) {
        it(`${what} clears ${min}:1`, () => {
          const ratio = contrastRatio(vars[ink], ground ? vars[ground] : WHITE);
          expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
