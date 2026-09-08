/**
 * Roles, their seniority and which of them may be held together.
 *
 * A person can legitimately wear more than one hat in a school — a teacher who
 * is also a parent, a bursar who also runs HR. The one combination that must
 * never happen is a pupil holding a staff or admin role, because every staff
 * role grants sight of other people's records.
 */

export interface RoleOption {
  value: string;
  label: string;
}

export const ROLES: RoleOption[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "proprietor", label: "Proprietor" },
  { value: "group_admin", label: "Group Admin" },
  { value: "school_admin", label: "School Admin" },
  { value: "principal", label: "Principal" },
  { value: "bursar", label: "Bursar" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "parent", label: "Parent" },
  { value: "student", label: "Student" },
];

/** Lower number = more senior. */
export const ROLE_RANK: Record<string, number> = {
  super_admin: 0,
  proprietor: 1,
  group_admin: 2,
  school_admin: 3,
  principal: 4,
  bursar: 5,
  finance_officer: 6,
  hr_admin: 7,
  teacher: 8,
  parent: 9,
  student: 10,
};

export const ADMIN_ROLES = [
  "super_admin", "proprietor", "group_admin", "school_admin",
  "principal", "bursar", "finance_officer", "hr_admin",
];

/** Student is exclusive except for parent. Mirrors public.roles_compatible(). */
export function rolesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === "student") return b === "parent";
  if (b === "student") return a === "parent";
  return true;
}

/** Can this role be added to someone who already holds `existing`? */
export function roleAllowedAlongside(role: string, existing: string[]): boolean {
  if (existing.includes(role)) return false;
  return existing.every((r) => rolesCompatible(r, role));
}

export function roleLabel(role: string): string {
  return ROLES.find((r) => r.value === role)?.label || role;
}

/** The most senior of a set of roles — what menus and gating should follow. */
export function primaryRole(roles: string[]): string | null {
  if (roles.length === 0) return null;
  return [...roles].sort((a, b) => (ROLE_RANK[a] ?? 99) - (ROLE_RANK[b] ?? 99))[0];
}

export const roleBadgeClass: Record<string, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/20",
  proprietor: "bg-accent/10 text-accent border-accent/20",
  group_admin: "bg-accent/10 text-accent border-accent/20",
  school_admin: "bg-primary/10 text-primary border-primary/20",
  principal: "bg-success/10 text-success border-success/20",
  bursar: "bg-warning/10 text-warning border-warning/20",
  finance_officer: "bg-warning/10 text-warning border-warning/20",
  hr_admin: "bg-muted text-muted-foreground",
  teacher: "bg-muted text-muted-foreground",
  parent: "bg-muted text-muted-foreground",
  student: "bg-muted text-muted-foreground",
};

/**
 * What each role is for, in the words a school would use. Shown on the Roles &
 * Access page so an owner can see who should hold what without reading code.
 */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Platform owner. Full access to every organisation, school and setting.",
  proprietor: "Owns the school group. Sees every school, all finances and all reports.",
  group_admin: "Runs the group day to day on the proprietor's behalf, with the same reach.",
  school_admin: "Runs one school: its people, records, fees, settings and user accounts.",
  principal: "Heads one school: academics, staff, students, approvals and school settings.",
  bursar: "Owns fees and money in: schedules, invoices, payments, arrears and payroll.",
  finance_officer: "Handles day-to-day money work — invoices, payments and arrears only.",
  hr_admin: "Handles staff records, payroll and staff recognition.",
  teacher: "Sees only their own classes: attendance, exams, results and their own pay.",
  parent: "Sees only their own children: attendance, results, fees and invoices.",
  student: "Sees only their own records: results, attendance, fees and achievements.",
};

/** Roles senior enough to preview the app as a more junior role. */
export function canPreviewRoles(role: string | null): boolean {
  return (ROLE_RANK[role || ""] ?? 99) <= 4;
}

/**
 * Which roles a person may preview: strictly more junior than their own, mirroring
 * the rule that nobody may act above their own rank.
 */
export function previewableRoles(role: string | null): string[] {
  if (!canPreviewRoles(role)) return [];
  const mine = ROLE_RANK[role || ""] ?? 99;
  return ROLES.filter((r) => (ROLE_RANK[r.value] ?? 99) > mine).map((r) => r.value);
}
