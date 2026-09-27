import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  admissionsUrl, ageOn, daysWaiting, funnelCounts, isOpenStatus, isStale,
  nextStatuses, RESERVED_SLUGS, slugProblem, statusLabel, suggestSection, toSlug,
} from "@/lib/admissions";

const NOW = new Date("2026-08-28T12:00:00Z");

describe("funnelCounts", () => {
  it("reports every stage, including the ones nobody is at", () => {
    const counts = funnelCounts([
      { status: "new", created_at: NOW.toISOString() },
      { status: "new", created_at: NOW.toISOString() },
      { status: "offered", created_at: NOW.toISOString() },
    ]);
    expect(counts.new).toBe(2);
    expect(counts.offered).toBe(1);
    expect(counts.interview).toBe(0);
    expect(counts.withdrawn).toBe(0);
  });
});

describe("nextStatuses", () => {
  it("never offers enrolled as a status to pick", () => {
    for (const status of ["new", "reviewing", "interview", "offered", "accepted"] as const) {
      expect(nextStatuses(status)).not.toContain("enrolled");
    }
  });

  it("lets an application move backwards as well as forwards", () => {
    expect(nextStatuses("offered")).toContain("reviewing");
  });

  it("freezes an enrolled application", () => {
    expect(nextStatuses("enrolled")).toEqual([]);
  });

  it("never offers the status the application is already at", () => {
    expect(nextStatuses("reviewing")).not.toContain("reviewing");
  });
});

describe("isOpenStatus", () => {
  it("treats enrolled, rejected and withdrawn as finished", () => {
    expect(isOpenStatus("enrolled")).toBe(false);
    expect(isOpenStatus("rejected")).toBe(false);
    expect(isOpenStatus("withdrawn")).toBe(false);
    expect(isOpenStatus("new")).toBe(true);
  });
});

describe("daysWaiting", () => {
  it("counts whole days, not part days", () => {
    expect(daysWaiting("2026-08-28T00:00:00Z", NOW)).toBe(0);
    expect(daysWaiting("2026-08-25T12:00:00Z", NOW)).toBe(3);
  });

  it("does not go negative on a future timestamp", () => {
    expect(daysWaiting("2026-09-01T00:00:00Z", NOW)).toBe(0);
  });

  it("survives an unparseable date rather than reporting NaN days", () => {
    expect(daysWaiting("not a date", NOW)).toBe(0);
  });
});

describe("isStale", () => {
  it("flags an open application nobody has touched in a week", () => {
    expect(isStale({ status: "new", created_at: "2026-08-20T12:00:00Z" }, NOW)).toBe(true);
  });

  it("does not nag about a closed application", () => {
    expect(isStale({ status: "rejected", created_at: "2026-01-01T12:00:00Z" }, NOW)).toBe(false);
  });

  it("leaves a fresh application alone", () => {
    expect(isStale({ status: "new", created_at: "2026-08-27T12:00:00Z" }, NOW)).toBe(false);
  });
});

describe("ageOn", () => {
  it("does not count a birthday that has not happened yet this year", () => {
    expect(ageOn("2020-12-01", NOW)).toBe(5);
    expect(ageOn("2020-01-01", NOW)).toBe(6);
  });

  it("returns null rather than a number for a missing or unusable date", () => {
    expect(ageOn(null, NOW)).toBeNull();
    expect(ageOn("", NOW)).toBeNull();
    expect(ageOn("nonsense", NOW)).toBeNull();
  });
});

describe("suggestSection", () => {
  it("maps ages onto the school's bands", () => {
    expect(suggestSection("2024-06-01", NOW)).toBe("toddler");
    expect(suggestSection("2022-06-01", NOW)).toBe("nursery");
    expect(suggestSection("2018-06-01", NOW)).toBe("primary");
    expect(suggestSection("2012-06-01", NOW)).toBe("secondary");
  });

  it("declines to guess without a date of birth", () => {
    expect(suggestSection(null, NOW)).toBeNull();
  });

  it("declines to guess for someone too old for school", () => {
    expect(suggestSection("1990-06-01", NOW)).toBeNull();
  });
});

describe("toSlug", () => {
  it("makes a school name safe for a URL", () => {
    expect(toSlug("Beloved Lifewalk Montessori Schools")).toBe("beloved-lifewalk-montessori-schools");
    expect(toSlug("  St. Mary's  Academy!! ")).toBe("st-mary-s-academy");
  });
});

describe("reserved slugs", () => {
  const root = path.resolve(__dirname, "../..");

  it("match public.reserved_school_slugs() exactly", () => {
    // The last migration to define it wins, as it does on the database.
    const dir = path.join(root, "supabase/migrations");
    const defs = fs.readdirSync(dir).sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .map((sql) => sql.match(/FUNCTION public\.reserved_school_slugs\(\)[\s\S]*?ARRAY\[([\s\S]*?)\]::text\[\]/))
      .filter((m): m is RegExpMatchArray => m !== null);
    expect(defs.length).toBeGreaterThan(0);
    const body = defs[defs.length - 1][1].replace(/--.*$/gm, "");
    const inSql = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...inSql].sort()).toEqual([...RESERVED_SLUGS].sort());
  });

  it("cover every top-level route, so no school can sit on one", () => {
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    const routes = new Set([...app.matchAll(/path="\/([^/":]+)/g)].map((m) => m[1]));
    expect(routes.size).toBeGreaterThan(10);
    const missing = [...routes].filter((r) => !RESERVED_SLUGS.includes(r));
    expect(missing).toEqual([]);
  });

  it("include the hostnames kept back for subdomains", () => {
    for (const host of ["www", "app", "admin", "api", "mail", "demo"]) {
      expect(RESERVED_SLUGS).toContain(host);
    }
  });
});

describe("slugProblem", () => {
  it("accepts an ordinary school slug", () => {
    expect(slugProblem("kingsqueens")).toBeNull();
  });

  it("rejects reserved words and routes", () => {
    expect(slugProblem("www")).toMatch(/reserved/);
    expect(slugProblem("login")).toMatch(/reserved/);
  });

  it("rejects slugs too short or too long", () => {
    expect(slugProblem("ab")).toMatch(/at least 3/);
    expect(slugProblem("a".repeat(61))).toMatch(/60/);
  });

  it("never blocks the slug a school already has", () => {
    expect(slugProblem("ab", "ab")).toBeNull();
  });
});

describe("admissionsUrl", () => {
  it("does not double up the slash when the origin has one", () => {
    expect(admissionsUrl("grace-academy", "https://school.example.com/"))
      .toBe("https://school.example.com/apply/grace-academy");
  });
});

describe("statusLabel", () => {
  it("says 'Not offered' rather than 'Rejected' to the office", () => {
    expect(statusLabel("rejected")).toBe("Not offered");
  });
});
