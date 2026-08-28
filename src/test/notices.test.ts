import { describe, expect, it } from "vitest";
import { isLive, liveNotices, noticeState, today, type Notice } from "@/lib/notices";

const ON = "2026-08-28";
const base: Notice = { is_published: true, starts_on: null, ends_on: null };

describe("isLive", () => {
  it("keeps a draft off the page whatever its dates say", () => {
    expect(isLive({ ...base, is_published: false }, ON)).toBe(false);
    expect(isLive({ is_published: false, starts_on: "2026-01-01", ends_on: "2027-01-01" }, ON)).toBe(false);
  });

  it("shows a published notice with no dates", () => {
    expect(isLive(base, ON)).toBe(true);
  });

  it("treats both bounds as inclusive", () => {
    expect(isLive({ ...base, starts_on: ON, ends_on: ON }, ON)).toBe(true);
  });

  it("hides a notice that has not started", () => {
    expect(isLive({ ...base, starts_on: "2026-09-01" }, ON)).toBe(false);
  });

  it("hides a notice that has finished", () => {
    expect(isLive({ ...base, ends_on: "2026-08-27" }, ON)).toBe(false);
  });
});

describe("liveNotices", () => {
  it("keeps the school's own order rather than the database's", () => {
    const result = liveNotices([
      { ...base, display_order: 2 },
      { ...base, display_order: 1 },
      { ...base, is_published: false, display_order: 0 },
    ], ON);
    expect(result.map((n) => n.display_order)).toEqual([1, 2]);
  });

  it("treats a missing order as first rather than dropping the notice", () => {
    const result = liveNotices<Notice>([{ ...base, display_order: 3 }, { ...base }], ON);
    expect(result).toHaveLength(2);
    expect(result[0].display_order).toBeUndefined();
  });
});

describe("noticeState", () => {
  it("says why a notice is not showing", () => {
    expect(noticeState({ ...base, is_published: false }, ON)).toBe("draft");
    expect(noticeState({ ...base, starts_on: "2026-09-01" }, ON)).toBe("scheduled");
    expect(noticeState({ ...base, ends_on: "2026-01-01" }, ON)).toBe("expired");
    expect(noticeState(base, ON)).toBe("live");
  });
});

describe("today", () => {
  it("formats a local date, not a UTC one", () => {
    // 2026-08-28 23:30 local is still the 28th, whatever UTC says.
    expect(today(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-28");
  });

  it("pads single-digit months and days", () => {
    expect(today(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
