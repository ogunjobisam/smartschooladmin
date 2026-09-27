/**
 * The tile tones a metric card or a panel header can wear.
 *
 * The reference design colour-codes these tiles, and that is most of what keeps
 * a grid of eight metrics from reading as one grey block. The colour is a
 * mnemonic, not a status: the card's own title always names the metric, so
 * nothing here is the only channel carrying meaning, and `trend` — not the
 * tile — is what says whether a number is good news.
 *
 * `navy` and `gold` are the school's own brand colours and follow a rebrand.
 * The other four come from the validated accent ramp in src/index.css, and
 * deliberately do not: their whole job is to be distinguishable from each
 * other, which collapses if they all chase one hue.
 *
 * Every combination below clears 3:1 for the glyph against its tile, which is
 * what WCAG 1.4.11 asks of an icon.
 */
export type Tone = "navy" | "gold" | "green" | "blue" | "rose" | "violet";

export const TONE: Record<Tone, string> = {
  // Both of these pair the brand's two colours against each other, so both use
  // the gold that is measured against --primary rather than against cream.
  navy: "bg-primary text-gold-on-primary",
  gold: "bg-gold-on-primary text-primary",
  blue: "bg-chart-1 text-white",
  rose: "bg-chart-3 text-white",
  violet: "bg-chart-4 text-white",
  green: "bg-chart-5 text-white",
};
