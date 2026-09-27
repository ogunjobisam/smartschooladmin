/**
 * The colours charts are allowed to use.
 *
 * Two palettes, and they never borrow from each other.
 *
 * `CHART_SERIES` is categorical: it says *which* thing a mark is, nothing more.
 * The order is fixed — slot 0 is always the same blue — and it is never cycled
 * or re-dealt when a series disappears, because a filter that repaints the
 * survivors makes two screenshots of the same data look like different data.
 * More than five categories means rolling the tail into "Other" (see
 * `topWithOther`), not inventing a sixth hue.
 *
 * `STATUS_COLOURS` is reserved. Paid, pending, overdue and void mean something,
 * so they wear the app's own status tokens wherever they appear — a table pill,
 * a row tint, a pie slice — and those four colours never come back as
 * "series 4".
 *
 * The values live as `--chart-1…5` in src/index.css, where the note explains
 * how they were validated and how to re-check them.
 */

export const CHART_SERIES = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

/** The tail of a long tail. Grey on purpose: "Other" is not a category. */
export const CHART_OTHER = "hsl(var(--muted-foreground))";

/**
 * A second series that exists only as a reference for the first — billed behind
 * collected, target behind actual. Recessive, so the series it frames reads as
 * the subject.
 */
export const CHART_REFERENCE = "hsl(var(--muted-foreground))";

export const STATUS_COLOURS = {
  paid: "hsl(var(--success))",
  pending: "hsl(var(--warning))",
  overdue: "hsl(var(--destructive))",
  void: "hsl(var(--muted-foreground))",
} as const;

export interface Slice {
  name: string;
  value: number;
  /** The fill to give this slice — already the right one, including "Other". */
  fill: string;
}

/**
 * Keep the biggest slices, sum the rest into one grey "Other", and hand back
 * each slice already carrying its colour.
 *
 * Without this a long tail either runs off the end of the palette or wraps
 * around it, and a wrapped palette claims two unrelated categories are the same
 * thing. Returning the fill alongside the value is what stops a caller
 * reaching for `CHART_SERIES[i % 5]` and reintroducing exactly that.
 *
 * Expects `rows` sorted by value, descending.
 */
export function topWithOther(
  rows: { name: string; value: number }[],
  limit: number = CHART_SERIES.length,
): Slice[] {
  const kept = rows.length <= limit ? rows : rows.slice(0, limit - 1);
  const out: Slice[] = kept.map((r, i) => ({ name: r.name, value: r.value, fill: CHART_SERIES[i] }));
  if (rows.length > limit) {
    const tail = rows.slice(limit - 1);
    out.push({
      name: `Other (${tail.length})`,
      value: tail.reduce((s, r) => s + r.value, 0),
      fill: CHART_OTHER,
    });
  }
  return out;
}
