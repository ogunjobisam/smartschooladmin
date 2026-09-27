import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  BRAND_PRESETS,
  contrastRatio,
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  hexToHsl,
  schoolThemeVars,
  THEME_MODES,
  type ThemeMode,
} from "@/lib/theme";

/** The `:root { … }` or `.dark { … }` block, as `{ "--token": "h s% l%" }`. */
function blockTokens(mode: ThemeMode): Record<string, string> {
  const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
  const selector = mode === "dark" ? /\.dark\s*\{([\s\S]*?)\n\s*\}/ : /:root\s*\{([\s\S]*?)\n\s*\}/;
  const block = css.match(selector);
  if (!block) throw new Error(`no ${mode} block in src/index.css`);
  const out: Record<string, string> = {};
  // [a-z0-9-], not [a-z-]: the narrower class silently skipped --chart-1..5,
  // so the whole chart ramp was invisible to this parser and to every check
  // built on it.
  for (const [, name, value] of block[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/**
 * Stylesheet tokens the derivation deliberately does not produce: they carry
 * meaning, or the product's own brand, rather than a school's.
 */
const UNBRANDED = new Set([
  "--radius",
  "--destructive", "--destructive-foreground", "--destructive-ink",
  "--success", "--success-foreground", "--success-ink",
  "--warning", "--warning-foreground", "--warning-ink",
  "--tint-paid", "--tint-owing",
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--gold-foreground", "--brand-ice", "--brand-mint",
  "--coral", "--coral-foreground",
  "--teal", "--teal-foreground",
  "--violet", "--violet-foreground",
]);

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
  for (const mode of THEME_MODES) {
    const where = mode === "dark" ? ".dark" : ":root";

    it(`reproduces the ${where} block from the two default brand colours`, () => {
      // The point of the whole exercise: the stylesheet's defaults and the
      // derivation are the same thing, so a school that has not chosen colours
      // renders byte-identically to the hard-coded palette. If this fails,
      // either index.css or theme.ts moved without the other.
      const block = blockTokens(mode);
      const derived = schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT, mode);
      for (const [token, value] of Object.entries(derived)) {
        expect(block[token], `${token} missing from ${where}`).toBeDefined();
        expect(value, `${token} drifted from ${where}`).toBe(block[token]);
      }
    });

    it(`has nothing in ${where} the derivation does not account for`, () => {
      // The reverse direction, which did not exist before — and is exactly how
      // .dark drifted into setting --primary and --gold-on-primary to the same
      // colour. Without it a hand-edit is invisible forever.
      const derived = schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT, mode);
      const unaccounted = Object.keys(blockTokens(mode))
        .filter((t) => !(t in derived) && !UNBRANDED.has(t));
      expect(unaccounted, "add it to the derivation or to UNBRANDED").toEqual([]);
    });
  }

  it("produces the same set of tokens in both modes", () => {
    // The runtime writes these as inline styles and rewrites them on a mode
    // flip. Identical key sets are what make "no stale token survives a flip"
    // a fact rather than a hope.
    const light = Object.keys(schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT, "light")).sort();
    const dark = Object.keys(schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT, "dark")).sort();
    expect(dark).toEqual(light);
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
  const BRANDS: [string, string, string][] = [
    ["navy & gold (the default)", DEFAULT_PRIMARY, DEFAULT_ACCENT],
    ["maroon & olive", "#5b1520", "#8a7a2f"],
    ["forest & copper", "#123024", "#b06a2a"],
    ["teal & amber", "#0f766e", "#f59e0b"],
    ["slate & blue", "#1e293b", "#3b82f6"],
    ["plum & rose", "#3b0a45", "#d94f7a"],
    ["black & grey", "#000000", "#9ca3af"],
    ["a school that typed nonsense", "not-a-colour", ""],
    // Every pair offered in Settings, so the list cannot grow a preset that
    // looked good in a picker and fails a pairing somewhere in the chrome.
    ...BRAND_PRESETS.map(
      (p): [string, string, string] => [`preset: ${p.name}`, p.primary, p.accent],
    ),
  ];

  // [what it is, ink token, ground token, minimum]. The ground is "--card"
  // rather than a literal white: in dark a card is not white, and measuring
  // gold against #fff there would fail for entirely the wrong reason.
  // 3 is WCAG 1.4.11 for a boundary or an icon; 4.5 is AA for small text.
  const PAIRS: [string, string, string, number][] = [
    ["the gold glyph on the icon plaque", "--gold-on-primary", "--tile", 3],
    ["the plaque's own colour as a glyph on gold", "--tile", "--gold-on-primary", 3],
    // The plaque must stay a DARK square in both modes, or the navy-tile-with-
    // a-gold-emblem the design is built on stops reading as one thing.
    ["the plaque against a card", "--tile", "--card", 1.5],
    ["a gold rule on the page", "--gold", "--background", 3],
    ["a gold rule on a card", "--gold", "--card", 3],
    ["the gold eyebrow on a panel band", "--gold-ink", "--panel-band", 4.5],
    ["the gold eyebrow on a card", "--gold-ink", "--card", 4.5],
    ["body text on the page", "--foreground", "--background", 4.5],
    ["text on a card", "--card-foreground", "--card", 4.5],
    ["the primary's own ink on it", "--primary-foreground", "--primary", 4.5],
    // Only bites in dark, where --primary inverts from a fill into a pale
    // colour that `text-primary` sets on a card — 30 call sites do that.
    ["the primary as text on a card", "--primary", "--card", 4.5],
    ["the focus ring on a card", "--ring", "--card", 3],
    ["muted text on the muted ground", "--muted-foreground", "--muted", 4.5],
    ["secondary ink on secondary", "--secondary-foreground", "--secondary", 4.5],
    ["sidebar text", "--sidebar-foreground", "--sidebar-background", 4.5],
    ["the sidebar's active item", "--sidebar-primary-foreground", "--sidebar-primary", 4.5],
    // Text, at four call sites in AppSidebar, and nothing was checking it.
    ["sidebar secondary text", "--sidebar-muted", "--sidebar-background", 4.5],
    ["ink on the accent", "--accent-foreground", "--accent", 4.5],
  ];

  for (const mode of THEME_MODES) {
    describe(mode, () => {
      for (const [brand, primary, accent] of BRANDS) {
        describe(brand, () => {
          const vars = schoolThemeVars(primary, accent, mode);
          for (const [what, ink, ground, min] of PAIRS) {
            it(`${what} clears ${min}:1`, () => {
              const ratio = contrastRatio(vars[ink], vars[ground]);
              expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(min);
            });
          }
        });
      }
    });
  }
});

/**
 * Some pairings are about being *perceptible* rather than about WCAG — a
 * card's edge against the page, a border against a card. Rather than invent a
 * threshold, hold dark to what light already achieves: if the light design
 * reads, and dark separates at least as well, dark reads too.
 */
describe("dark separates its surfaces at least as well as light", () => {
  const SEPARATIONS: [string, string, string][] = [
    ["a card against the page", "--card", "--background"],
    ["a border against a card", "--border", "--card"],
    ["the sidebar's border against the sidebar", "--sidebar-border", "--sidebar-background"],
    ["a gold wash against a card", "--gold-soft", "--card"],
    ["the panel band against a card", "--panel-band", "--card"],
  ];

  const light = schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT, "light");
  const dark = schoolThemeVars(DEFAULT_PRIMARY, DEFAULT_ACCENT, "dark");

  for (const [what, a, b] of SEPARATIONS) {
    it(what, () => {
      expect(contrastRatio(dark[a], dark[b]))
        .toBeGreaterThanOrEqual(contrastRatio(light[a], light[b]) * 0.95);
    });
  }

  it("does not pretend the sidebar keeps its light-mode separation", () => {
    // The one pairing deliberately exempt. In light the sidebar is a dark
    // island on cream at ~16:1; in dark there is nowhere for it to go, and its
    // edge is carried by --sidebar-border and the royal-check texture instead.
    expect(contrastRatio(dark["--sidebar-background"], dark["--background"])).toBeLessThan(2);
    expect(contrastRatio(dark["--sidebar-border"], dark["--sidebar-background"]))
      .toBeGreaterThanOrEqual(1.5);
  });
});

/**
 * The tokens the derivation deliberately leaves alone — status colours and the
 * ledger row tints — still have to be legible. They are constants, so they need
 * no brand loop, and nothing was checking them at all: `text-warning` measured
 * 2.48:1 on a card in light mode, which is every "pending" badge in the app.
 */
describe("the unbranded status tokens are legible in both modes", () => {
  // [what it is, ink token, ground token, minimum]
  const PAIRS: [string, string, string, number][] = [
    ["overdue text on a card", "--destructive-ink", "--card", 4.5],
    ["overdue text on an owing row", "--destructive-ink", "--tint-owing", 4.5],
    ["overdue text on the page", "--destructive-ink", "--background", 4.5],
    ["paid text on a card", "--success-ink", "--card", 4.5],
    ["paid text on a paid row", "--success-ink", "--tint-paid", 4.5],
    ["paid text on the page", "--success-ink", "--background", 4.5],
    ["pending text on a card", "--warning-ink", "--card", 4.5],
    ["pending text on the muted ground", "--warning-ink", "--muted", 4.5],
    // The fills carry their own foreground, which is the other half of the job
    // the single token used to be doing badly.
    ["white on a destructive fill", "--destructive-foreground", "--destructive", 4.5],
    ["ink on a warning fill", "--warning-foreground", "--warning", 4.5],
    // The tints are a wash, not text: they only have to be visible as a wash.
    ["an owing row against a card", "--tint-owing", "--card", 1.1],
    ["a paid row against a card", "--tint-paid", "--card", 1.1],
  ];

  for (const mode of THEME_MODES) {
    describe(mode, () => {
      const vars = blockTokens(mode);
      for (const [what, ink, ground, min] of PAIRS) {
        it(`${what} clears ${min}:1`, () => {
          expect(vars[ink], `${ink} missing from the ${mode} block`).toBeDefined();
          const ratio = contrastRatio(vars[ink], vars[ground]);
          expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
