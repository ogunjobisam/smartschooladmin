/**
 * Notices are the school's public standing statements — resumption dates, when
 * admissions open, a PTA meeting. Whether one is showing depends on a published
 * flag and a date window, and getting that wrong either hides this term's dates
 * or leaves last term's up, so the rule lives here and is tested.
 */

export interface Notice {
  is_published: boolean;
  /** Inclusive. Null means it has always been live. */
  starts_on: string | null;
  /** Inclusive. Null means it stays live. */
  ends_on: string | null;
  display_order?: number | null;
}

/** Today as YYYY-MM-DD in the viewer's own timezone, to compare with date columns. */
export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether a notice should be on the page right now.
 *
 * Both bounds are inclusive: a notice that ends on the day of the event should
 * still be up that morning.
 */
export function isLive<T extends Notice>(notice: T, on: string = today()): boolean {
  if (!notice.is_published) return false;
  if (notice.starts_on && notice.starts_on > on) return false;
  if (notice.ends_on && notice.ends_on < on) return false;
  return true;
}

/** The notices to show, in the order the school arranged them. */
export function liveNotices<T extends Notice>(notices: T[], on: string = today()): T[] {
  return notices
    .filter((n) => isLive(n, on))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

/** Why a notice is not showing, for the admin list. */
export function noticeState<T extends Notice>(notice: T, on: string = today()): "live" | "draft" | "scheduled" | "expired" {
  if (!notice.is_published) return "draft";
  if (notice.starts_on && notice.starts_on > on) return "scheduled";
  if (notice.ends_on && notice.ends_on < on) return "expired";
  return "live";
}
