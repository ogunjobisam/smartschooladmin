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

export interface BrandPreset {
  name: string;
  primary: string;
  accent: string;
}

/**
 * Ready-made pairs, because picking two colours that work together is a
 * different skill from running a school.
 *
 * Each is a deep, cool ink against a warm metal — the shape the design needs,
 * whatever the hues. Every one of them is run through the full contrast suite
 * in `src/test/theme.test.ts`, so a preset on this list is one we have proved
 * legible rather than one that looked nice in a picker.
 */
export const BRAND_PRESETS: BrandPreset[] = [
  { name: "Royal Navy & Gold", primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT },
  { name: "Deep Maroon & Gold", primary: "#5b1520", accent: "#bc9529" },
  { name: "Forest & Brass", primary: "#123024", accent: "#b08a2a" },
  { name: "Oxford Blue & Copper", primary: "#0f2540", accent: "#b06a2a" },
  { name: "Aubergine & Gold", primary: "#3b1a4f", accent: "#c09a2c" },
  { name: "Teal & Amber", primary: "#0e4a46", accent: "#d99a1f" },
];

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Whether a string is a colour this theme can actually use. */
export const isBrandColor = (value: string): boolean => HEX_COLOR.test(value);

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

/** The same hue, darkened step by step until it clears `min` against `bg`. */
function darkenUntil(bg: string, h: number, s: number, from: number, min: number): string {
  for (let l = Math.round(from); l >= 6; l -= 2) {
    const candidate = hsl(h, s, l);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return hsl(h, Math.min(s, 30), 4);
}

export type ThemeMode = "light" | "dark";
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"];

/**
 * The two hue families a school's colours resolve to, before either mode
 * decides what to do with them. Shared so light and dark cannot disagree about
 * what the school's colours *are*, only about how to light them.
 */
interface BrandFamily {
  /** Cool: ink and chrome in light, the grounds in dark. */
  coolH: number;
  /** Warm: gold, pale grounds and borders in light, the ink in dark. */
  warmH: number;
  groundH: number;
  warmS: number;
  primary: Hsl;
  accent: Hsl;
}

function brandFamily(primaryHex: string, accentHex: string): BrandFamily {
  const primary = hexToHsl(primaryHex, DEFAULT_PRIMARY);
  const accent = hexToHsl(accentHex, DEFAULT_ACCENT);
  return {
    coolH: primary.h,
    warmH: accent.h,
    // The pale grounds sit two degrees warm of the accent, which is what keeps
    // cream reading as cream rather than as a tint of the gold.
    groundH: (accent.h + 2) % 360,
    // A grey accent would leave the gold rules and edge bars below the 3:1 that
    // WCAG 1.4.11 asks of a UI boundary, and a fully saturated one would shout.
    warmS: clamp(accent.s, 20, 90),
    primary,
    accent,
  };
}

function lightTokens({ coolH, warmH, groundH, warmS, primary, accent }: BrandFamily): Record<string, string> {
  // `--primary` is a *background* for pale text, so its lightness is bounded
  // however light a colour the school chose.
  const coolL = clamp(primary.l, 8, 42);

  // Gold's two jobs, and they are not interchangeable: boundaries at 40% or
  // darker to clear 3:1 on cream and on white, text at 32% to clear AA.
  const goldL = Math.min(accent.l, 40);

  const primaryToken = hsl(coolH, primary.s, coolL);
  const accentToken = hsl(warmH, accent.s, accent.l);
  const goldToken = hsl(warmH, warmS, goldL);
  const mutedGround = hsl(warmH, 30, 92);

  // The sidebar's active item is the accent bar carrying a dark label. A fixed
  // 48% lightness suited the gold and left a copper or a grey too close to its
  // own text, so the bar brightens until the label clears AA on it.
  const sidebarInk = hsl(coolH, 60, 13);
  const sidebarPrimary = liftUntil(sidebarInk, warmH, warmS, 48, 4.6);
  const sidebarBg = hsl(coolH, clamp(primary.s + 3, 8, 90), 15);
  // The sidebar's second line — the group label, the role, the user's email.
  // It is text, at four call sites, and a flat 34% measured 1.91-2.26:1 on the
  // sidebar for every brand. Lifted until it is actually readable.
  const sidebarMuted = liftUntil(sidebarBg, coolH, 30, 34, 4.6);

  // The icon plaque — a dark square carrying a gold emblem. Its own token
  // because --primary inverts to a PALE colour in dark mode for text reasons,
  // and a plaque that inverts with it stops being a plaque. In light the two
  // are the same value, so nothing moves.
  const tile = primaryToken;

  // The glyph on that plaque, and the fill of a gold one. The gold is pinned
  // dark enough for the cream ground, which for a mid-dark primary leaves the
  // two almost the same brightness and the icon vanishes — so it is lifted
  // until it measures 3:1 against the plaque rather than being assumed to.
  const goldOnPrimary = liftUntil(tile, warmH, warmS, goldL, 3.2);

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

    // White here, but derived rather than literal so both modes produce the
    // SAME set of keys — which is what lets the runtime overwrite every
    // property on a mode flip with no stale value surviving.
    "--card": "0 0% 100%",
    "--popover": "0 0% 100%",
    "--card-foreground": hsl(coolH, 55, 16),
    "--popover-foreground": hsl(coolH, 55, 16),

    "--primary": primaryToken,
    "--primary-foreground": hsl(groundH, 60, 97),

    "--secondary": hsl(warmH, 40, 91),
    "--secondary-foreground": hsl(coolH, 50, 20),

    "--muted": mutedGround,
    // Darkened until it clears AA on its own ground rather than assumed to: a
    // flat 42% measured 3.95:1 for a copper or an amber accent, and
    // `.status-void` puts exactly this pair together.
    "--muted-foreground": darkenUntil(mutedGround, coolH, 14, 42, 4.6),

    "--accent": accentToken,
    "--accent-foreground": accentInk,

    "--border": hsl(warmH, 28, 85),
    "--input": hsl(warmH, 28, 85),
    // A focus ring is a UI component and owes 3:1, which the raw accent did not
    // manage on white (2.81 for the default gold, 2.14 for an amber). The
    // boundary gold already does, and is the same brand colour.
    "--ring": goldToken,

    "--gold": goldToken,
    "--tile": tile,
    "--gold-on-primary": goldOnPrimary,
    "--gold-ink": hsl((warmH + 356) % 360, clamp(warmS + 8, 28, 80), 32),
    "--gold-soft": hsl(warmH, 70, 88),

    "--royal-check": hsl(coolH, 55, 26),
    "--panel-band": hsl(groundH, 52, 96),

    "--sidebar-background": sidebarBg,
    "--sidebar-foreground": hsl(warmH, 25, 82),
    "--sidebar-primary": sidebarPrimary,
    "--sidebar-primary-foreground": sidebarInk,
    // The hover fill, and only ever that — every call site is `hover:`,
    // `active:` or `data-[active=true]:`. It has to clear the royal-check
    // diamonds above it (L26), not just the sidebar fill below it (L15): at
    // L22 it sat *between* the two and read as more pattern rather than as a
    // highlight.
    //
    // L34 is the target, but it is a ceiling rather than a constant: a green or
    // teal brand is far more luminous at the same lightness than navy, and the
    // near-white ink stops clearing AA on it. So darken from 34 only as far as
    // that ink requires — navy keeps all of it, teal gives a little back.
    "--sidebar-accent": darkenUntil(hsl(warmH, 40, 92), coolH, 55, 34, 4.5),
    "--sidebar-accent-foreground": hsl(warmH, 40, 92),
    "--sidebar-border": hsl(coolH, 45, 24),
    "--sidebar-ring": sidebarPrimary,
    "--sidebar-muted": sidebarMuted,

    // Shadows come off this rather than off --primary, which inverts in dark:
    // a pale primary would turn every card shadow into a halo.
    "--shadow-color": hsl(coolH, primary.s, coolL),
  };
}

/**
 * Dark mode, chosen rather than flipped.
 *
 * Both hue families cross over. In light, grounds are warm and pale and ink is
 * cool and dark; in dark, grounds take the COOL hue and go near-black, and ink
 * takes the WARM hue and goes pale. A dark ground built on the warm accent
 * reads as brown mud rather than unlit paper, and a pale ink built on the cool
 * hue reads as cold grey beside the gold. Keeping that warm/cool tension —
 * inverted — is what makes this the same design at night rather than a
 * greyscale of it.
 *
 * The one true inversion is `--primary`. In light it is a dark FILL carrying
 * pale text. In dark it cannot be both that and legible as `text-primary` on a
 * card: measured against the dark card, 62% lightness reads as text at 4.62
 * but carries pale text at only 3.65, and there is no value where both hold.
 * So it becomes the pale member of the pair and `--primary-foreground` becomes
 * the dark ink — the conventional shadcn inversion, which keeps all ~78 call
 * sites correct with no markup change.
 *
 * The hand-written block this replaces set `--primary` and `--gold-on-primary`
 * to the same colour, so the two headline pairings measured 1.00:1. Nothing
 * caught it because nothing ever set `.dark`.
 */
function darkTokens({ coolH, warmH, groundH, warmS, primary, accent }: BrandFamily): Record<string, string> {
  // Saturation is clamped from the school's own, never a constant: a constant
  // hands the school that picked black (s = 0) a dark red page.
  const coolS = primary.s;
  const page = hsl(coolH, clamp(coolS, 0, 45), 7);
  const card = hsl(coolH, clamp(coolS, 0, 42), 12);
  const panelBand = hsl(coolH, clamp(coolS, 0, 40), 14);
  const mutedGround = hsl(coolH, clamp(coolS, 0, 30), 18);

  // Pale enough to read as text on the card, with a ceiling as well as a floor:
  // without the ceiling a white brand colour lands at l = 100, liftUntil never
  // runs, and nothing can sit on the result.
  const primaryToken = liftUntil(card, coolH, clamp(coolS, 25, 70), clamp(primary.l, 58, 70), 4.6);
  const primaryInk = pickInk(
    primaryToken, 4.5,
    hsl(coolH, 60, 10), hsl(groundH, 60, 97), hsl(coolH, 0, 0), hsl(groundH, 0, 100),
  );

  // The gold clamps flip from ceiling to floor, because the grounds did. Gold
  // is measured against the card — the lightest surface it draws a boundary on
  // — the mirror of light mode, where white was the hard case.
  const gold = liftUntil(card, warmH, warmS, Math.max(accent.l, 46), 3.2);
  const goldInk = liftUntil(panelBand, (warmH + 356) % 360, clamp(warmS + 8, 28, 80), Math.max(accent.l, 60), 4.6);

  // The plaque stays a dark square here even though --primary has gone pale,
  // so the navy-tile-with-a-gold-emblem that the whole design is built on still
  // reads as one. Lifted off the card so its edge is visible against it.
  const tile = liftUntil(card, coolH, clamp(coolS, 25, 70), 26, 1.6);
  const goldOnPrimary = liftUntil(tile, warmH, warmS, Math.max(accent.l, 50), 3.2);

  const accentToken = hsl(warmH, accent.s, Math.max(accent.l, 52));
  const accentInk = pickInk(
    accentToken, 4.5,
    hsl(coolH, 60, 12), hsl(groundH, 60, 97), hsl(coolH, 0, 0), hsl(groundH, 0, 100),
  );

  // The sidebar does not invert: it is already a dark island in light mode, at
  // 15% against a 95% page. It holds that 15% here, which now makes it slightly
  // LIGHTER than the 7% page — the separation carries on, just reversed.
  const sidebarBg = hsl(coolH, clamp(coolS + 3, 8, 60), 15);
  const sidebarInk = hsl(coolH, 60, 10);
  const sidebarPrimary = liftUntil(sidebarInk, warmH, warmS, 52, 4.6);

  return {
    "--background": page,
    "--foreground": hsl(warmH, 25, 92),

    "--card": card,
    "--popover": card,
    "--card-foreground": hsl(warmH, 25, 92),
    "--popover-foreground": hsl(warmH, 25, 92),

    "--primary": primaryToken,
    "--primary-foreground": primaryInk,

    "--secondary": hsl(coolH, clamp(coolS, 0, 35), 18),
    "--secondary-foreground": hsl(warmH, 25, 88),

    "--muted": mutedGround,
    "--muted-foreground": liftUntil(mutedGround, warmH, 12, 64, 4.6),

    "--accent": accentToken,
    "--accent-foreground": accentInk,

    "--border": hsl(coolH, clamp(coolS, 0, 30), 26),
    "--input": hsl(coolH, clamp(coolS, 0, 30), 26),
    "--ring": gold,

    "--gold": gold,
    "--tile": tile,
    "--gold-on-primary": goldOnPrimary,
    "--gold-ink": goldInk,
    // Warm, not the cool wash the hand-written block had: that measured 1.30:1
    // against the card and was invisible behind an active preset tile.
    "--gold-soft": liftUntil(card, warmH, clamp(warmS, 20, 50), 20, 1.8),

    // Anchored to the sidebar, its only call site, rather than to the primary,
    // which no longer sits behind it.
    "--royal-check": hsl(coolH, clamp(coolS, 20, 55), 22),
    "--panel-band": panelBand,

    "--sidebar-background": sidebarBg,
    "--sidebar-foreground": hsl(warmH, 20, 84),
    "--sidebar-primary": sidebarPrimary,
    "--sidebar-primary-foreground": sidebarInk,
    // Same story as light, and worse: at L21 the hover fill was a hair *below*
    // the diamonds at L22, measuring 1.00 against them — the hovered row and
    // the texture were the same colour. Ceiling of 34, given back per-hue to
    // whatever the ink needs, exactly as in light.
    "--sidebar-accent": darkenUntil(hsl(warmH, 25, 90), coolH, clamp(coolS, 8, 45), 34, 4.5),
    "--sidebar-accent-foreground": hsl(warmH, 25, 90),
    "--sidebar-border": hsl(coolH, clamp(coolS, 8, 40), 30),
    "--sidebar-ring": sidebarPrimary,
    // Text, at four call sites in AppSidebar, so it owes AA — which the
    // hand-written 26% did not come close to.
    "--sidebar-muted": liftUntil(sidebarBg, warmH, 12, 68, 4.6),

    "--shadow-color": hsl(coolH, 0, 0),
  };
}

/**
 * The tokens a school's colours drive, as `{ "--token": "h s% l%" }`.
 *
 * Pure, so it can be asserted against the stylesheet in a test instead of being
 * eyeballed in a browser — `src/test/theme.test.ts` checks both modes against
 * `:root` and `.dark`, and measures every pairing the chrome relies on.
 */
export function schoolThemeVars(
  primaryHex: string,
  accentHex: string,
  mode: ThemeMode = "light",
): Record<string, string> {
  const family = brandFamily(primaryHex, accentHex);
  return mode === "dark" ? darkTokens(family) : lightTokens(family);
}
