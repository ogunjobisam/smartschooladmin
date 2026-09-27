import { describe, it, expect, vi } from "vitest";
import {
  anyFieldMatches, pageMatches, searchRecords, searchTerms, sourcesForRole,
  type SearchClient,
} from "@/lib/global-search";

/** A fake query builder that records every call and answers per table. */
function fakeClient(rows: Record<string, Record<string, unknown>[]>, failing: string[] = []) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const client: SearchClient = {
    from(table) {
      const q = {
        select: (...args: unknown[]) => (calls.push({ table, op: "select", args }), q),
        or: (...args: unknown[]) => (calls.push({ table, op: "or", args }), q),
        eq: (...args: unknown[]) => (calls.push({ table, op: "eq", args }), q),
        limit: (...args: unknown[]) => (calls.push({ table, op: "limit", args }), q),
        then: (resolve: (v: unknown) => unknown) =>
          resolve(failing.includes(table)
            ? { data: null, error: { message: "boom" } }
            : { data: rows[table] ?? [], error: null }),
      };
      return q as never;
    },
  };
  return { client, calls };
}

describe("searchTerms", () => {
  it("splits a query into words", () => {
    expect(searchTerms("  Ada   Obi ")).toEqual(["Ada", "Obi"]);
  });

  it("drops characters that would break or widen a PostgREST filter", () => {
    expect(searchTerms("Ada,first_name.eq.x")).toEqual(["Ada", "first_name.eq.x"]);
    expect(searchTerms("100% (a)")).toEqual(["100", "a"]);
    expect(searchTerms("o'neil")).toEqual(["o", "neil"]);
  });

  it("waits for something worth searching", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("a")).toEqual([]);
    expect(searchTerms("%%")).toEqual([]);
    expect(searchTerms("ab")).toEqual(["ab"]);
  });

  it("caps the number of words", () => {
    expect(searchTerms("a b c d e f g")).toHaveLength(5);
  });
});

describe("anyFieldMatches", () => {
  it("matches the term in any listed column", () => {
    expect(anyFieldMatches(["first_name", "last_name"], "ada"))
      .toBe("first_name.ilike.%ada%,last_name.ilike.%ada%");
  });
});

describe("pageMatches", () => {
  it("needs every word, in any case", () => {
    expect(pageMatches("Fee Schedules", ["fee"])).toBe(true);
    expect(pageMatches("Fee Schedules", ["SCHED", "fee"])).toBe(true);
    expect(pageMatches("Fee Schedules", ["fee", "payroll"])).toBe(false);
  });
});

describe("sourcesForRole", () => {
  const kinds = (role: string | null) => sourcesForRole(role).map((s) => s.kind);

  it("gives an owner every record type", () => {
    expect(kinds("proprietor")).toEqual(["student", "staff", "guardian", "invoice", "exam", "subject", "class"]);
  });

  it("gives families nothing: their portals link to no staff screens", () => {
    expect(kinds("parent")).toEqual([]);
    expect(kinds("student")).toEqual([]);
    expect(kinds(null)).toEqual([]);
  });

  it("keeps a teacher to the pages a teacher can open", () => {
    const teacher = kinds("teacher");
    expect(teacher).toContain("student");
    expect(teacher).toContain("exam");
    expect(teacher).not.toContain("invoice");
    expect(teacher).not.toContain("guardian");
  });
});

describe("searchRecords", () => {
  const ctx = { role: "proprietor", schoolId: "school-1", orgId: "org-1" };

  it("searches nothing for a query too short to mean anything", async () => {
    const { client, calls } = fakeClient({});
    expect(await searchRecords(client, "a", ctx)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("requires every word to match, and scopes to the current school or group", async () => {
    const { client, calls } = fakeClient({
      students: [{ id: "s1", first_name: "Ada", last_name: "Obi", student_id_number: "GA/001", status: "active" }],
    });
    const hits = await searchRecords(client, "Ada Obi", ctx);

    expect(hits).toContainEqual({
      kind: "student", id: "s1", title: "Ada Obi", subtitle: "GA/001 · active", url: "/students/s1",
    });
    const students = calls.filter((c) => c.table === "students");
    expect(students.filter((c) => c.op === "or").map((c) => c.args[0])).toEqual([
      "first_name.ilike.%Ada%,last_name.ilike.%Ada%,student_id_number.ilike.%Ada%",
      "first_name.ilike.%Obi%,last_name.ilike.%Obi%,student_id_number.ilike.%Obi%",
    ]);
    expect(students).toContainEqual({ table: "students", op: "eq", args: ["school_id", "school-1"] });
    // Guardians belong to the group, not a school.
    expect(calls).toContainEqual({ table: "guardians", op: "eq", args: ["org_id", "org-1"] });
  });

  it("links subjects and classes to where they are managed", async () => {
    const { client } = fakeClient({
      subjects: [{ id: "sub", name: "Mathematics", short_code: "MTH" }],
      classes: [{ id: "cls", name: "JSS1 Gold", level_name: "JSS1", arm: "Gold" }],
    });
    const hits = await searchRecords(client, "ma", ctx);
    expect(hits).toContainEqual({ kind: "subject", id: "sub", title: "Mathematics", subtitle: "MTH", url: "/settings?tab=subjects" });
    expect(hits).toContainEqual({ kind: "class", id: "cls", title: "JSS1 Gold", subtitle: "JSS1 · Gold", url: "/settings?tab=classes" });
  });

  it("queries only the tables the role may open", async () => {
    const { client, calls } = fakeClient({});
    await searchRecords(client, "ada", { ...ctx, role: "parent" });
    expect(calls).toHaveLength(0);
  });

  it("keeps the other results when one table fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ staff: [{ id: "t1", first_name: "Bola", last_name: "Ade" }] }, ["students"]);
    const hits = await searchRecords(client, "bola", ctx);
    expect(hits.map((h) => h.id)).toEqual(["t1"]);
    spy.mockRestore();
  });
});
