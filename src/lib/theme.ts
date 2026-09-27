/**
 * Turn a school's two brand colours into the whole token set the chrome reads.
 *
 * Why this exists: `schools.primary_color` / `accent_color` are editable in
 * Settings and were being written to `--school-primary` / `--school-accent`,
 * which *nothing* read. A school could pick maroon and see navy. The royal
 * palette in `src/index.css` is really two hue families — one cool (primary)
 * for ink, chrome and navy panels, one warm (accent) for gold, pale grounds
 * and borders — so the whole set derives from those two colours.
 *
 * The `:root` block in index.css is exactly `schoolThemeVars(DEFAULT_PRIMARY,
 * DEFAULT_ACCENT)`, and `src/test/theme.test.ts` parses the CSS and asserts
 * that, so the two cannot drift apart.
 *
 * Lightness is largely NOT borrowed. `--primary` is a background for pale text
 * and `--gold` draws boundaries that owe 3:1 under WCAG 1.4.11, so their
 * lightness is clamped into a range that works whatever the school picked. The
 * untouched hex stays on `branding.primaryColor` for the places that want the
 * literal colour — the login panel, a printed ID card.
 */

export const DEFAULT_PRIMARY = "#15255b"; // royal navy  — hsl(226 63% 22%)
export const DEFAULT_ACCENT = "#bc9529"; // ceremonial gold — hsl(44 64% 45%)

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Parse `#rrggbb` into whole-number HSL. Colours come from a user-editable
 * settings field, so anything else (a short `#fff`, a named colour, an empty
 * string) falls back rather than producing `NaN NaN% NaN%` and blanking the
 * theme.
 */
export function hexToHsl(hex: string, fallback = DEFAULT_PRIMARY): Hsl {
  if (!HEX_COLOR.test(hex)) hex = HEX_COLOR.test(fallback) ? fallback : DEFAULT_PRIMARY;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** `226 63% 22%` — the triple shape every shadcn token expects. */
export const hsl = (h: number, s: number, l: number) => `${h} ${s}% ${l}%`;

function toRgb(triple: string): [number, number, number] {
  const [h, s, l] = triple.split(" ").map(parseFloat).map((v, i) => (i ? v / 100 : v));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][
    Math.floor(hp) % 6
  ];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/**
 * WCAG contrast between two `h s% l%` triples.
 *
 * Exported because the guarantees below are only worth anything if a test can
 * check them: `src/test/theme.test.ts` runs every pairing the chrome relies on
 * across a spread of brand colours.
 */
export function contrastRatio(a: string, b: string): number {
  const rel = (t: string) => {
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [r, g, bl] = toRgb(t).map(f);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [rel(a), rel(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The first candidate that clears `min` on `bg`, else the best of a bad lot.
 *
 * First, not best, so the list can run softest-to-harshest: a near-black ink
 * always wins on contrast, but the tinted dark is the one that looks like it
 * belongs to the brand, and it should only be given up when it has to be.
 */
function pickInk(bg: string, min: number, ...candidates: string[]): string {
  return (
    candidates.find((c) => contrastRatio(c, bg) >= min) ??
    candidates.reduce((best, c) => (contrastRatio(c, bg) > contrastRatio(best, bg) ? c : best))
  );
}

/**
 * The same hue, lightened step by step until it clears `min` against `bg`.
 *
 * Hue matters here: gold at 40% lightness reads far brighter than navy at 40%,
 * so no rule about lightness alone can promise a ratio. Measuring can.
 */
function liftUntil(bg: string, h: number, s: number, from: number, min: number): string {
  for (let l = Math.round(from); l <= 94; l += 2) {
    const candidate = hsl(h, s, l);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return hsl(h, Math.min(s, 30), 96);
}

/**
 * The tokens a school's colours drive, as `{ "--token": "h s% l%" }`.
 *
 * Pure, so it can be asserted against the stylesheet in a test instead of
 * being eyeballed in a browser.
 */
export function schoolThemeVars(primaryHex: string, accentHex: string): Record<string, string> {
  const primary = hexToHsl(primaryHex, DEFAULT_PRIMARY);
  const accent = hexToHsl(accentHex, DEFAULT_ACCENT);

  const coolH = primary.h;
  const warmH = accent.h;
  // The pale grounds sit two degrees warm of the accent, which is what keeps
  // cream reading as cream rather than as a tint of the gold.
  const groundH = (warmH + 2) % 360;

  // A grey accent would leave the gold rules and edge bars below the 3:1 that
  // WCAG 1.4.11 asks of a UI boundary, and a fully saturated one would shout.
  const warmS = clamp(accent.s, 20, 90);
  // `--primary` is a *background* for pale text, so its lightness is bounded
  // however light a colour the school chose.
  const coolL = clamp(primary.l, 8, 42);

  // Gold's two jobs, and they are not interchangeable: boundaries at 40% or
  // darker to clear 3:1 on cream and on white, text at 32% to clear AA.
  const goldL = Math.min(accent.l, 40);

  const primaryToken = hsl(coolH, primary.s, coolL);
  const accentToken = hsl(warmH, accent.s, accent.l);

  // The sidebar's active item is the accent bar carrying a dark label. A fixed
  // 48% lightness suited the gold and left a copper or a grey too close to its
  // own text, so the bar brightens until the label clears AA on it.
  const sidebarInk = hsl(coolH, 60, 13);
  const sidebarPrimary = liftUntil(sidebarInk, warmH, warmS, 48, 4.6);

  // The glyph on a navy icon tile, and the fill of a gold one. That gold is
  // pinned dark enough for the cream ground, which for a mid-dark primary
  // leaves the two almost the same brightness — the tile's icon then vanishes.
  // So this one is lifted until it measures 3:1 against the primary rather
  // than being assumed to.
  const goldOnPrimary = liftUntil(primaryToken, warmH, warmS, goldL, 3.2);

  // Ink is chosen by measurement, not by a lightness threshold: whether navy
  // or cream reads better on a given accent depends on its hue as much as its
  // lightness, and a threshold gets the middle of the range wrong. The last
  // last three are fallbacks for an accent so middling that neither tinted ink
  // reaches AA on it — an olive, a copper. Plain black and plain white are
  // there because between them they always can: a colour needs relative
  // luminance below 0.183 for white to clear 4.5:1 and above 0.175 for black
  // to, and those two ranges overlap, so no accent falls through both.
  const accentInk = pickInk(
    accentToken,
    4.5,
    hsl(coolH, 60, 15),
    hsl(groundH, 60, 97),
    hsl(coolH, 45, 6),
    hsl(coolH, 0, 0),
    hsl(groundH, 0, 100),
  );

  return {
    "--background": hsl(groundH, 56, 95),
    "--foreground": hsl(coolH, 55, 16),

    "--card-foreground": hsl(coolH, 55, 16),
    "--popover-foreground": hsl(coolH, 55, 16),

    "--primary": primaryToken,
    "--primary-foreground": hsl(groundH, 60, 97),

    "--secondary": hsl(warmH, 40, 91),
    "--secondary-foreground": hsl(coolH, 50, 20),

    "--muted": hsl(warmH, 30, 92),
    "--muted-foreground": hsl(coolH, 14, 42),

    "--accent": accentToken,
    "--accent-foreground": accentInk,

    "--border": hsl(warmH, 28, 85),
    "--input": hsl(warmH, 28, 85),
    "--ring": accentToken,

    "--gold": hsl(warmH, warmS, goldL),
    "--gold-on-primary": goldOnPrimary,
    "--gold-ink": hsl((warmH + 356) % 360, clamp(warmS + 8, 28, 80), 32),
    "--gold-soft": hsl(warmH, 70, 88),

    "--royal-check": hsl(coolH, 55, 26),
    "--panel-band": hsl(groundH, 52, 96),

    "--sidebar-background": hsl(coolH, clamp(primary.s + 3, 8, 90), 15),
    "--sidebar-foreground": hsl(warmH, 25, 82),
    "--sidebar-primary": sidebarPrimary,
    "--sidebar-primary-foreground": sidebarInk,
    "--sidebar-accent": hsl(coolH, 55, 22),
    "--sidebar-accent-foreground": hsl(warmH, 40, 92),
    "--sidebar-border": hsl(coolH, 45, 24),
    "--sidebar-ring": sidebarPrimary,
    "--sidebar-muted": hsl(coolH, 30, 34),
  };
}
