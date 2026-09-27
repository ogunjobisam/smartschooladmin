/**
 * "Does this caller administer that organisation?", answered the same way twice.
 *
 * Five edge functions asked it like this:
 *
 *   .from("user_roles").select("role, org_id").eq("user_id", userId)
 *   .in("role", ALLOWED).limit(1).maybeSingle()
 *   … then compare that one row's org_id to the requested one
 *
 * PostgREST issues no ORDER BY for a bare `.limit(1)`, so the row that comes
 * back is whatever the plan reaches first, and it changes after an unrelated
 * write. Anyone holding more than one qualifying role — a proprietor of one
 * group who was also made school_admin in another, or anyone who ran onboarding
 * twice — could be told they do not administer an organisation they own, on
 * some requests and not others. Support cannot reproduce that.
 *
 * Picking one row and then testing it is the mistake. The question is about the
 * *set*: does any row this caller holds grant the thing being asked for? That
 * has one answer whatever order the rows arrive in.
 *
 * `administers` is pure so the decision can be tested directly rather than
 * through five copies of it — see src/test/caller-roles.test.ts.
 */

export interface RoleRow {
  role: string;
  org_id: string | null;
  school_id?: string | null;
}

/**
 * Seniority, mirroring public.role_rank() in the database. Kept in the same
 * order deliberately: when this and the SQL disagree, a caller is gated one way
 * by an edge function and another by row-level security, which is the confusing
 * class of bug 20260829120000 already had to converge once.
 */
export const ROLE_RANK: Record<string, number> = {
  super_admin: 0,
  proprietor: 1,
  group_admin: 2,
  school_admin: 3,
  principal: 4,
  bursar: 5,
  finance_officer: 6,
  hr_admin: 7,
  support_staff: 8,
  teacher: 9,
  parent: 10,
  student: 11,
};

export const rankOf = (role: string): number => ROLE_RANK[role] ?? 99;

/**
 * Roles whose holders may appoint someone at their own level, not only below it.
 *
 * The rule everywhere else is "strictly below your own rank", which is right for
 * almost everything: it is what stops a bursar appointing a bursar or a teacher
 * appointing a teacher. But it also meant a school could never have two people
 * who run it, because a school_admin could not appoint a school_admin — the one
 * case where a peer appointment is the point rather than a mistake.
 *
 * Deliberately not a blanket `>=`. Widening the comparison itself would hand
 * every role the power to clone itself, which is a much bigger change than the
 * one asked for.
 */
export const PEER_ASSIGNABLE = ["school_admin", "principal"];

/**
 * May a caller holding `callerRole` grant `targetRole` to someone?
 *
 * This is the authority rule for every grant in invite-user, and the UI reads
 * the same function so the dropdown cannot offer what the function will refuse.
 * It says nothing about *scope* — same org, same school, and outranking the
 * target's existing roles are all checked separately by the caller.
 */
export function canAssignRole(callerRole: string, targetRole: string): boolean {
  const callerRank = ROLE_RANK[callerRole];
  const targetRank = ROLE_RANK[targetRole];
  if (callerRank === undefined || targetRank === undefined) return false;

  // Its own branch, above the rank rules, so that a grep for "super_admin"
  // lands on the one line that can hand out access to every organisation,
  // school and setting on the platform. Only a super admin may, and no rank
  // comparison can be loosened into granting it by accident.
  if (targetRole === "super_admin") return callerRole === "super_admin";

  if (callerRank === targetRank) return PEER_ASSIGNABLE.includes(targetRole);

  return targetRank > callerRank;
}

/**
 * Roles that are not scoped to one organisation. A super_admin's row carries a
 * NULL org_id, so comparing it to a requested org would deny them everything.
 */
const ORG_LESS_ROLES = new Set(["super_admin"]);

/**
 * Roles scoped to a single school when their row names one. A school_admin
 * whose row names school X administers X, not every school in the group — the
 * distinction the callers were throwing away by selecting `role` and never
 * reading it.
 */
const SCHOOL_SCOPED_ROLES = new Set([
  "school_admin",
  "principal",
  "bursar",
  "finance_officer",
  "hr_admin",
  "teacher",
]);

export interface AdministersQuery {
  /** Only these roles count. Omit to accept any role the caller holds. */
  allowed?: readonly string[];
  /** The organisation being acted on. */
  orgId: string;
  /**
   * The school being acted on, when the request names one. A row that names no
   * school is group-wide and covers every school in the org; a row that names a
   * different school does not.
   */
  schoolId?: string | null;
}

/**
 * The most senior role row that authorises this request, or null.
 *
 * Returning the row rather than a boolean is what lets a caller go on to use
 * `role` for the decisions it drives — which analyses may be run, whether the
 * caller is org-wide — instead of guessing.
 */
export function administers(
  rows: readonly RoleRow[] | null | undefined,
  { allowed, orgId, schoolId }: AdministersQuery,
): RoleRow | null {
  if (!rows?.length || !orgId) return null;
  const permitted = allowed ? new Set(allowed) : null;

  const matches = rows.filter((r) => {
    if (permitted && !permitted.has(r.role)) return false;
    // Org-less roles are deliberately not org-compared; everyone else must be
    // in the organisation they are acting on.
    if (!ORG_LESS_ROLES.has(r.role) && r.org_id !== orgId) return false;
    if (schoolId && SCHOOL_SCOPED_ROLES.has(r.role)) {
      // A row naming no school is group-wide; one naming another school is not
      // this school's business.
      if (r.school_id && r.school_id !== schoolId) return false;
    }
    return true;
  });

  if (!matches.length) return null;
  // Deterministic: most senior wins, and a group-wide row beats a school-scoped
  // one at the same rank so the caller sees the widest authority they hold.
  return matches.slice().sort((a, b) =>
    rankOf(a.role) - rankOf(b.role) ||
    Number(Boolean(a.school_id)) - Number(Boolean(b.school_id)) ||
    a.role.localeCompare(b.role),
  )[0];
}

/**
 * The caller's own most senior role, for the handlers that are not told which
 * organisation to act on and have to pick one.
 *
 * Deliberately the same ordering as public.primary_user_role() —
 * `role_rank(role), (org_id IS NULL), (school_id IS NULL), …` — so a caller is
 * not gated one way by an edge function and another by row-level security. That
 * divergence has had to be converged once already, in 20260829120000.
 */
export function primaryRole(rows: readonly RoleRow[] | null | undefined): RoleRow | null {
  if (!rows?.length) return null;
  return rows.slice().sort((a, b) =>
    rankOf(a.role) - rankOf(b.role) ||
    Number(a.org_id == null) - Number(b.org_id == null) ||
    Number(a.school_id == null) - Number(b.school_id == null) ||
    a.role.localeCompare(b.role),
  )[0];
}

/** Minimal shape of the Supabase client these helpers need. */
// PromiseLike, not Promise: PostgREST's filter builder is a thenable rather
// than a real Promise, so typing it as Promise makes every call site a type
// error under Deno even though awaiting it works.
interface RoleQuery {
  from(table: string): {
    select(cols: string): {
      eq(col: string, value: string): PromiseLike<{ data: RoleRow[] | null }>;
    };
  };
}

/**
 * Every role row this caller holds. All of them, deliberately — the filtering
 * and the decision happen in `administers`, where they can be tested.
 */
export async function fetchCallerRoles(client: RoleQuery, userId: string): Promise<RoleRow[]> {
  const { data } = await client.from("user_roles").select("role, org_id, school_id").eq("user_id", userId);
  return data ?? [];
}
