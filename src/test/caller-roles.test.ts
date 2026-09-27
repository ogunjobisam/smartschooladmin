import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  administers,
  fetchCallerRoles,
  primaryRole,
  rankOf,
  ROLE_RANK,
  targetRolesInScope,
  type RoleRow,
} from "../../supabase/functions/_shared/caller-roles.ts";

const ORG_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const ORG_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const SCHOOL_1 = "11111111-0000-0000-0000-000000000001";
const SCHOOL_2 = "22222222-0000-0000-0000-000000000002";

const row = (role: string, org_id: string | null, school_id: string | null = null): RoleRow =>
  ({ role, org_id, school_id });

const ADMIN_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin"];

describe("administers", () => {
  it("says no when the caller holds nothing", () => {
    expect(administers([], { allowed: ADMIN_ROLES, orgId: ORG_A })).toBeNull();
    expect(administers(null, { allowed: ADMIN_ROLES, orgId: ORG_A })).toBeNull();
    expect(administers(undefined, { allowed: ADMIN_ROLES, orgId: ORG_A })).toBeNull();
  });

  it("says yes for a plain single-org admin", () => {
    const rows = [row("proprietor", ORG_A)];
    expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A })?.role).toBe("proprietor");
  });

  it("says no for an organisation the caller has no row in", () => {
    const rows = [row("proprietor", ORG_A)];
    expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_B })).toBeNull();
  });

  it("says no when the caller's role is not one of the permitted ones", () => {
    const rows = [row("teacher", ORG_A), row("parent", ORG_A)];
    expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A })).toBeNull();
  });

  // The bug this file exists for.
  it("does not depend on the order the rows arrive in", () => {
    // A proprietor of one group who was also made school_admin in another. The
    // old code took one row at random and compared it, so this caller was told
    // "you do not administer this organisation" for a group they own —
    // intermittently, flipping after any unrelated write to user_roles.
    const held = [row("proprietor", ORG_A), row("school_admin", ORG_B, SCHOOL_2)];
    for (const rows of [held, held.slice().reverse()]) {
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A })?.role).toBe("proprietor");
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_B })?.role).toBe("school_admin");
    }
  });

  it("returns the same answer for every permutation of the same rows", () => {
    const held = [
      row("teacher", ORG_A, SCHOOL_1),
      row("school_admin", ORG_A, SCHOOL_1),
      row("parent", ORG_A),
      row("bursar", ORG_A, SCHOOL_1),
    ];
    const permutations = (xs: RoleRow[]): RoleRow[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) =>
        permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
    const answers = new Set(
      permutations(held).map((rows) =>
        administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A, schoolId: SCHOOL_1 })?.role),
    );
    expect([...answers]).toEqual(["school_admin"]);
  });

  it("gives the most senior role the caller holds in that org", () => {
    const rows = [row("teacher", ORG_A, SCHOOL_1), row("group_admin", ORG_A), row("bursar", ORG_A)];
    expect(administers(rows, { orgId: ORG_A })?.role).toBe("group_admin");
  });

  describe("school scope", () => {
    it("lets a school-scoped admin act on their own school", () => {
      const rows = [row("school_admin", ORG_A, SCHOOL_1)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A, schoolId: SCHOOL_1 })?.role)
        .toBe("school_admin");
    });

    // The second hole in seed-demo-data: it checked only that the school
    // belonged to the org, never that the caller administered that school —
    // while writing with the service role key.
    it("stops a school-scoped admin acting on a sibling school", () => {
      const rows = [row("school_admin", ORG_A, SCHOOL_1)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A, schoolId: SCHOOL_2 })).toBeNull();
    });

    it("treats a row naming no school as group-wide", () => {
      // An org-level invite writes school_id: null. That is authority over the
      // whole group, not over nothing.
      const rows = [row("school_admin", ORG_A, null)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A, schoolId: SCHOOL_2 })?.role)
        .toBe("school_admin");
    });

    it("does not school-scope a role that is not school-scoped", () => {
      const rows = [row("proprietor", ORG_A, SCHOOL_1)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A, schoolId: SCHOOL_2 })?.role)
        .toBe("proprietor");
    });

    it("ignores school scope entirely when the request names no school", () => {
      const rows = [row("school_admin", ORG_A, SCHOOL_1)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A })?.role).toBe("school_admin");
    });

    it("prefers the group-wide row when the caller holds both", () => {
      const rows = [row("school_admin", ORG_A, SCHOOL_1), row("school_admin", ORG_A, null)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A })?.school_id).toBeNull();
    });
  });

  describe("super_admin", () => {
    // Their row carries a NULL org_id, so comparing it to the requested org
    // denied them everything — the old code's `callerRole.org_id !== org_id`.
    it("is not org-compared", () => {
      const rows = [row("super_admin", null)];
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_A })?.role).toBe("super_admin");
      expect(administers(rows, { allowed: ADMIN_ROLES, orgId: ORG_B })?.role).toBe("super_admin");
    });

    it("still has to be in the permitted set", () => {
      const rows = [row("super_admin", null)];
      expect(administers(rows, { allowed: ["proprietor"], orgId: ORG_A })).toBeNull();
    });

    it("outranks everything else", () => {
      const rows = [row("teacher", ORG_A), row("super_admin", null)];
      expect(administers(rows, { orgId: ORG_A })?.role).toBe("super_admin");
    });
  });

  it("refuses an empty organisation rather than matching a NULL row", () => {
    const rows = [row("proprietor", null)];
    expect(administers(rows, { allowed: ADMIN_ROLES, orgId: "" })).toBeNull();
  });

  it("does not let an unknown role outrank a known one", () => {
    const rows = [row("something_new", ORG_A), row("teacher", ORG_A)];
    expect(administers(rows, { orgId: ORG_A })?.role).toBe("teacher");
  });
});

describe("ROLE_RANK", () => {
  it("matches the database's role_rank() ordering", () => {
    // If these drift, a caller is gated one way by an edge function and another
    // by row-level security — which 20260829120000 already had to converge once.
    //
    // Read out of the migration rather than restated here. A hand-written copy
    // of the expected order is a third place to forget: adding support_staff to
    // role_rank() and to this module left this assertion failing against a list
    // that was only ever a transcription of the SQL.
    const migrations = path.join(process.cwd(), "supabase", "migrations");
    const latest = fs.readdirSync(migrations)
      .filter((f) => fs.readFileSync(path.join(migrations, f), "utf8").includes("FUNCTION public.role_rank"))
      .sort()
      .pop();
    expect(latest, "no migration defines role_rank()").toBeDefined();

    const sql = fs.readFileSync(path.join(migrations, latest!), "utf8");
    const body = sql.slice(sql.lastIndexOf("FUNCTION public.role_rank"));
    const fromSql = [...body.matchAll(/WHEN '([a-z_]+)' THEN (\d+)/g)]
      .map(([, role, rank]) => [role, Number(rank)] as const)
      .sort((a, b) => a[1] - b[1]);

    expect(fromSql.length).toBeGreaterThan(0);
    expect(Object.fromEntries(fromSql)).toEqual(ROLE_RANK);
  });

  it("puts an unrecognised role last rather than first", () => {
    expect(rankOf("not_a_role")).toBeGreaterThan(rankOf("student"));
  });
});

describe("primaryRole", () => {
  // For the handlers that are not told which organisation to act on —
  // ai-insights, start-demo, process-message-queue — and have to pick.
  it("gives the most senior role, whatever order the rows arrive in", () => {
    const held = [row("teacher", ORG_B, SCHOOL_2), row("proprietor", ORG_A), row("parent", ORG_A)];
    for (const rows of [held, held.slice().reverse()]) {
      expect(primaryRole(rows)?.role).toBe("proprietor");
    }
  });

  it("prefers a row that names an organisation over one that does not", () => {
    // Mirrors primary_user_role()'s `(org_id IS NULL)` tie-break: a role row
    // with no org cannot tell a handler whose data to work on.
    const rows = [row("proprietor", null), row("proprietor", ORG_A)];
    expect(primaryRole(rows)?.org_id).toBe(ORG_A);
  });

  it("prefers a row that names a school, at the same rank and org", () => {
    const rows = [row("school_admin", ORG_A, null), row("school_admin", ORG_A, SCHOOL_1)];
    expect(primaryRole(rows)?.school_id).toBe(SCHOOL_1);
  });

  it("is null when the caller holds nothing", () => {
    expect(primaryRole([])).toBeNull();
    expect(primaryRole(null)).toBeNull();
  });

  it("agrees with administers on which role is senior", () => {
    const rows = [row("bursar", ORG_A), row("group_admin", ORG_A), row("teacher", ORG_A)];
    expect(primaryRole(rows)?.role).toBe(administers(rows, { orgId: ORG_A })?.role);
  });
});

describe("fetchCallerRoles", () => {
  // The edge functions are Deno and nothing in this repo type-checks them, so
  // the query shape is worth asserting rather than assuming.
  const stub = (data: RoleRow[] | null) => {
    const calls: Record<string, string> = {};
    const client = {
      from(table: string) {
        calls.table = table;
        return {
          select(cols: string) {
            calls.cols = cols;
            return {
              eq(col: string, value: string) {
                calls.col = col;
                calls.value = value;
                return Promise.resolve({ data });
              },
            };
          },
        };
      },
    };
    return { client, calls };
  };

  it("asks for every role row belonging to the caller", async () => {
    const { client, calls } = stub([row("proprietor", ORG_A)]);
    const rows = await fetchCallerRoles(client, "user-1");
    expect(calls).toEqual({
      table: "user_roles",
      cols: "role, org_id, school_id",
      col: "user_id",
      value: "user-1",
    });
    expect(rows).toHaveLength(1);
  });

  it("returns an empty list rather than null, so callers cannot forget", async () => {
    const { client } = stub(null);
    expect(await fetchCallerRoles(client, "user-1")).toEqual([]);
  });

  it("selects school_id, which the old queries left out", async () => {
    // seed-demo-data could not scope a school_admin to their own school
    // because it never asked for the column.
    const { client, calls } = stub([]);
    await fetchCallerRoles(client, "user-1");
    expect(calls.cols).toContain("school_id");
  });
});

/**
 * Which of a target user's roles an admin may manage.
 *
 * invite-user used to check only rank, and school scope for school-level
 * callers. It never compared organisations, and its writes matched on user_id
 * alone, so a proprietor of a throwaway demo organisation could make a parent
 * in someone else's school a group_admin there.
 */
describe("targetRolesInScope", () => {
  const proprietorA = row("proprietor", ORG_A);

  it("keeps only the target's roles in the caller's organisation", () => {
    const target = [row("parent", ORG_A, SCHOOL_1), row("parent", ORG_B, SCHOOL_2)];
    expect(targetRolesInScope(proprietorA, target)).toEqual([row("parent", ORG_A, SCHOOL_1)]);
  });

  it("gives an admin nothing to manage for a user in another organisation", () => {
    expect(targetRolesInScope(proprietorA, [row("parent", ORG_B, SCHOOL_2)])).toEqual([]);
  });

  it("does not let an organisation reach a platform-wide super_admin row", () => {
    expect(targetRolesInScope(proprietorA, [row("super_admin", null)])).toEqual([]);
  });

  it("gives a caller with no organisation nothing, rather than every org-less row", () => {
    expect(targetRolesInScope(row("school_admin", null, SCHOOL_1), [row("super_admin", null)])).toEqual([]);
  });

  it("lets a super_admin manage roles in every organisation", () => {
    const target = [row("parent", ORG_A), row("teacher", ORG_B, SCHOOL_2), row("super_admin", null)];
    expect(targetRolesInScope(row("super_admin", null), target)).toEqual(target);
  });
});
