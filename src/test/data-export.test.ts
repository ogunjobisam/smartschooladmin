import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  EXPORT_DATASETS, EXCLUDED_TABLES, EXPORT_PAGE_SIZE, PARENT_ID_CHUNK,
  csvCell, rowsToCsv, fetchTableRows, runExport,
  type ExportClient, type ExportQuery,
} from "@/lib/data-export";
import { buildZip, crc32 } from "@/lib/zip";
import { canAccessPath } from "@/lib/access";

/** Table name → column names, read from the generated Supabase types. */
function tableColumns(): Map<string, string[]> {
  const src = fs.readFileSync(path.resolve(__dirname, "../integrations/supabase/types.ts"), "utf8");
  const tables = src.split("    Tables: {")[1].split("    Views: {")[0];
  const out = new Map<string, string[]>();
  for (const m of tables.matchAll(/\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
    out.set(m[1], [...m[2].matchAll(/^ {10}(\w+):/gm)].map((c) => c[1]));
  }
  return out;
}

const exported = EXPORT_DATASETS.flatMap((d) => d.tables);

describe("which tables an export covers", () => {
  const columns = tableColumns();

  it("reads the table list", () => {
    expect(columns.size).toBeGreaterThan(50);
    expect(columns.get("students")).toContain("school_id");
  });

  it("classifies every table in the database as exported or excluded", () => {
    const classified = new Set([...exported.map((t) => t.table), ...Object.keys(EXCLUDED_TABLES)]);
    const unclassified = [...columns.keys()].filter((t) => !classified.has(t));
    expect(unclassified, "add each new table to a dataset or to EXCLUDED_TABLES").toEqual([]);
  });

  it("names only tables that exist, each exactly once", () => {
    const names = [...exported.map((t) => t.table), ...Object.keys(EXCLUDED_TABLES)];
    for (const name of names) expect(columns.has(name), `${name} is not a table`).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reaches scores through the exam_id index, not a join to students", () => {
    // A join-side filter left row-level security checking every score on the
    // platform (~1 ms a row) and the export hit the statement timeout.
    expect(exported.find((t) => t.table === "student_scores")!.scope)
      .toEqual({ kind: "via", parent: "exams", fk: "exam_id", chunk: 1 });
  });

  it("never exports bank details or payment secrets", () => {
    const names = exported.map((t) => t.table);
    for (const secret of ["staff_bank_details", "payment_gateway_config", "email_unsubscribe_tokens"]) {
      expect(names).not.toContain(secret);
    }
  });

  it("scopes every table by a column that is really there", () => {
    for (const { table, scope } of exported) {
      const cols = columns.get(table)!;
      expect(cols, `${table} has no id to page by`).toContain("id");
      if (scope.kind === "org") expect(cols, table).toContain("org_id");
      if (scope.kind === "school") expect(cols, table).toContain("school_id");
      if (scope.kind === "via") {
        expect(cols, `${table} has no ${scope.fk}`).toContain(scope.fk);
        const parent = exported.find((t) => t.table === scope.parent);
        expect(parent, `${table} → ${scope.parent} is not exported itself`).toBeDefined();
        expect(parent!.scope.kind, `${scope.parent} must be scoped directly, not through another table`).not.toBe("via");
      }
    }
  });
});

describe("csvCell", () => {
  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+2348012345678")).toBe("'+2348012345678");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-1+1")).toBe("'-1+1");
  });

  it("leaves numbers alone, negative ones included", () => {
    expect(csvCell(-2500)).toBe("-2500");
    expect(csvCell(0)).toBe("0");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Lagos, Nigeria")).toBe("\"Lagos, Nigeria\"");
    expect(csvCell("say \"hi\"")).toBe("\"say \"\"hi\"\"\"");
    expect(csvCell("line\nbreak")).toBe("\"line\nbreak\"");
  });

  it("writes nothing for null and JSON for objects", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell({ a: 1 })).toBe("\"{\"\"a\"\":1}\"");
  });
});

describe("rowsToCsv", () => {
  it("starts with a byte-order mark, uses CRLF and keeps every column", () => {
    const csv = rowsToCsv([{ id: "1", name: "Adé" }, { id: "2", note: "x" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1)).toBe("id,name,note\r\n1,Adé,\r\n2,,x\r\n");
  });
});

interface Call { table: string; ops: [string, ...unknown[]][] }

/** A stand-in for the Supabase client that serves rows in id order and records every filter. */
function fakeClient(tables: Record<string, Record<string, unknown>[]>, calls: Call[] = [], fail?: string): ExportClient {
  return {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const query: ExportQuery = {
        select: (c) => (call.ops.push(["select", c]), query),
        eq: (c, v) => (call.ops.push(["eq", c, v]), query),
        in: (c, v) => (call.ops.push(["in", c, v]), query),
        gt: (c, v) => (call.ops.push(["gt", c, v]), query),
        order: (c, o) => (call.ops.push(["order", c, o]), query),
        limit: (n) => (call.ops.push(["limit", n]), query),
        then(resolve, reject) {
          if (fail === table) return Promise.resolve({ data: null, error: { message: "permission denied" } }).then(resolve, reject);
          const after = call.ops.find((o) => o[0] === "gt")?.[2] as string | undefined;
          const limit = (call.ops.find((o) => o[0] === "limit")?.[1] as number | undefined) ?? Infinity;
          const rows = (tables[table] ?? [])
            .filter((r) => call.ops.every(([op, col, val]) =>
              op === "eq" ? r[col as string] === undefined || r[col as string] === val
              : op === "in" ? r[col as string] === undefined || (val as unknown[]).includes(r[col as string])
              : true))
            .filter((r) => after === undefined || String(r.id) > after)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .slice(0, limit)
            .map((r) => ({ ...r }));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const ctx = { orgId: "org-1", schoolIds: ["school-1"] };
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(6, "0")}` }));

describe("fetchTableRows", () => {
  it("pages by id past the page size until a page comes back empty", async () => {
    const calls: Call[] = [];
    const rows = await fetchTableRows(fakeClient({ students: ids(EXPORT_PAGE_SIZE * 2 + 5) }, calls),
      { table: "students", scope: { kind: "school" } }, ctx);
    expect(rows).toHaveLength(EXPORT_PAGE_SIZE * 2 + 5);
    expect(calls).toHaveLength(4);
    expect(calls[1].ops).toContainEqual(["gt", "id", `id-${String(EXPORT_PAGE_SIZE - 1).padStart(6, "0")}`]);
  });

  it("pins org and school tables to the organisation being exported", async () => {
    const calls: Call[] = [];
    const client = fakeClient({}, calls);
    await fetchTableRows(client, { table: "guardians", scope: { kind: "org" } }, ctx);
    await fetchTableRows(client, { table: "students", scope: { kind: "school" } }, ctx);
    expect(calls[0].ops).toContainEqual(["eq", "org_id", "org-1"]);
    expect(calls[1].ops).toContainEqual(["in", "school_id", ["school-1"]]);
  });

  it("scopes child tables by their own foreign key, never through a join", async () => {
    const calls: Call[] = [];
    const rows = await fetchTableRows(
      fakeClient({ invoice_items: [
        { id: "a", invoice_id: "inv-1", amount: 5 },
        { id: "b", invoice_id: "someone-elses", amount: 9 },
      ] }, calls),
      { table: "invoice_items", scope: { kind: "via", parent: "invoices", fk: "invoice_id" } },
      { ...ctx, parentIds: async () => ["inv-1"] });
    expect(calls[0].ops).toContainEqual(["select", "*"]);
    expect(calls[0].ops).toContainEqual(["in", "invoice_id", ["inv-1"]]);
    expect(calls.flatMap((c) => c.ops).some((o) => String(o[1]).includes("."))).toBe(false);
    expect(rows).toEqual([{ id: "a", invoice_id: "inv-1", amount: 5 }]);
  });

  it("splits a long parent id list into several requests", async () => {
    const calls: Call[] = [];
    const parents = Array.from({ length: PARENT_ID_CHUNK * 2 + 1 }, (_, i) => `s-${i}`);
    await fetchTableRows(fakeClient({}, calls),
      { table: "enrolments", scope: { kind: "via", parent: "students", fk: "student_id" } },
      { ...ctx, parentIds: async () => parents });
    const chunks = calls.map((c) => c.ops.find((o) => o[0] === "in")![2] as string[]);
    expect(chunks.map((c) => c.length)).toEqual([PARENT_ID_CHUNK, PARENT_ID_CHUNK, 1]);
    expect(chunks.flat()).toEqual(parents);
  });

  it("asks for no children when the parent has no rows", async () => {
    const calls: Call[] = [];
    const rows = await fetchTableRows(fakeClient({ enrolments: ids(3) }, calls),
      { table: "enrolments", scope: { kind: "via", parent: "students", fk: "student_id" } },
      { ...ctx, parentIds: async () => [] });
    expect(rows).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("asks for nothing school-scoped when the organisation has no schools", async () => {
    const calls: Call[] = [];
    const rows = await fetchTableRows(fakeClient({ students: ids(3) }, calls),
      { table: "students", scope: { kind: "school" } }, { orgId: "org-1", schoolIds: [] });
    expect(rows).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("fails loudly rather than exporting a table short", async () => {
    await expect(fetchTableRows(fakeClient({}, [], "payments"),
      { table: "payments", scope: { kind: "school" } }, ctx)).rejects.toThrow("payments: permission denied");
  });
});

/** Reads a ZIP back with Node's own inflate, so the writer is checked against an independent reader. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const body = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    const data = method === 8 ? new Uint8Array(zlib.inflateRawSync(body)) : body;
    expect(crc32(data), `${name} checksum`).toBe(crc);
    out.set(name, new TextDecoder().decode(data));
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(view.getUint16(bytes.length - 12, true)).toBe(out.size);
  return out;
}

describe("buildZip", () => {
  it("matches the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips files, UTF-8 names and large repetitive content", async () => {
    const big = "a,b,c\r\n".repeat(5000);
    const zip = await buildZip([
      { name: "tiny.txt", data: new TextEncoder().encode("x") },
      { name: "École/big.csv", data: new TextEncoder().encode(big) },
    ]);
    const files = readZip(zip);
    expect(files.get("tiny.txt")).toBe("x");
    expect(files.get("École/big.csv")).toBe(big);
  });
});

describe("runExport", () => {
  it("exports only the chosen sets, with a manifest, from this organisation's schools", async () => {
    const calls: Call[] = [];
    const client = fakeClient({
      schools: [{ id: "school-1", name: "Grace Academy" }],
      students: [{ id: "st-1", school_id: "school-1" }, { id: "st-2", school_id: "school-1" }, { id: "st-3", school_id: "school-1" }],
      guardians: ids(2),
      enrolments: [
        { id: "e-1", student_id: "st-1" },
        { id: "e-2", student_id: "st-from-another-org" },
      ],
    }, calls);
    const progress: string[] = [];
    const result = await runExport({
      client, orgId: "org-1", datasetKeys: ["people"], exportedBy: "owner@example.com",
      now: new Date("2026-09-27T10:00:00Z"), onProgress: (p) => progress.push(p.table),
    });

    const files = readZip(result.zip);
    const people = EXPORT_DATASETS.find((d) => d.key === "people")!;
    expect([...files.keys()]).toEqual(["manifest.json", ...people.tables.map((t) => `people/${t.table}.csv`)]);
    expect(result.counts.students).toBe(3);
    expect(result.counts.enrolments).toBe(1);
    expect(result.totalRows).toBe(6);
    const enrolmentCall = calls.find((c) => c.table === "enrolments")!;
    expect(enrolmentCall.ops).toContainEqual(["in", "student_id", ["st-1", "st-2", "st-3"]]);
    // The parent's ids are read once, however many tables hang off it.
    expect(calls.filter((c) => c.table === "students" && c.ops.some((o) => o[0] === "select" && o[1] === "id"))).toHaveLength(2);
    expect(calls[0].ops).toContainEqual(["eq", "org_id", "org-1"]);
    expect(calls.some((c) => c.table === "invoices")).toBe(false);
    expect(progress).toContain("students");

    const manifest = JSON.parse(files.get("manifest.json")!);
    expect(manifest.schools).toEqual([{ id: "school-1", name: "Grace Academy" }]);
    expect(manifest.exported_by).toBe("owner@example.com");
    expect(manifest.total_rows).toBe(6);
  });

  it("refuses an empty selection", async () => {
    await expect(runExport({ client: fakeClient({}), orgId: "org-1", datasetKeys: [] })).rejects.toThrow();
  });
});

describe("who can export", () => {
  it("lets owners, school admins, principals and bursars in", () => {
    for (const role of ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar"]) {
      expect(canAccessPath(role, "/settings/data-export"), role).toBe(true);
    }
  });

  it("keeps everyone else out", () => {
    for (const role of ["finance_officer", "hr_admin", "support_staff", "teacher", "parent", "student"]) {
      expect(canAccessPath(role, "/settings/data-export"), role).toBe(false);
    }
  });
});
