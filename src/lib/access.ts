/**
 * Single source of truth for what each role can reach.
 *
 * Both the sidebar and the router read this map, so navigation and route
 * authorisation cannot drift apart — hiding a link without guarding the route
 * only hides the page from people who do not know the URL.
 *
 * This is defence in depth, not the security boundary. Row-level security in
 * PostgreSQL is what actually protects the data; this keeps people out of
 * screens that would be empty, broken or none of their business.
 */

export type AppRole =
  | "super_admin"
  | "proprietor"
  | "group_admin"
  | "school_admin"
  | "principal"
  | "bursar"
  | "finance_officer"
  | "hr_admin"
  | "teacher"
  | "parent"
  | "student";

export type NavGroup = "overview" | "finance" | "communications" | "operations" | "system";

export interface NavItem {
  /** Stable key used by the role map below. */
  key: string;
  title: string;
  url: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", title: "Dashboard", url: "/dashboard", group: "overview" },
  { key: "admissions", title: "Admissions", url: "/admissions", group: "overview" },
  { key: "students", title: "Students", url: "/students", group: "overview" },
  { key: "guardians", title: "Guardians", url: "/guardians", group: "overview" },
  { key: "staff", title: "Staff", url: "/staff", group: "overview" },
  { key: "attendance", title: "Attendance", url: "/attendance", group: "overview" },
  { key: "exams", title: "Exams", url: "/exams", group: "overview" },
  { key: "performance", title: "Performance", url: "/performance", group: "overview" },

  { key: "fees", title: "Fee Schedules", url: "/fees", group: "finance" },
  { key: "invoices", title: "Invoices", url: "/invoices", group: "finance" },
  { key: "payments", title: "Payments", url: "/payments", group: "finance" },
  { key: "arrears", title: "Arrears", url: "/arrears", group: "finance" },

  { key: "events", title: "Events", url: "/events", group: "communications" },
  { key: "announcements", title: "Announcements", url: "/announcements", group: "communications" },
  { key: "templates", title: "Templates", url: "/notification-templates", group: "communications" },
  { key: "preferences", title: "My Preferences", url: "/notification-settings", group: "communications" },

  { key: "transport", title: "Transport", url: "/transport", group: "operations" },
  { key: "payroll", title: "Payroll", url: "/payroll", group: "operations" },
  { key: "approvals", title: "Approvals", url: "/approvals", group: "operations" },
  { key: "group-overview", title: "Group Overview", url: "/group-overview", group: "operations" },
  { key: "reports", title: "Reports", url: "/reports", group: "operations" },
  { key: "audit-log", title: "Audit Log", url: "/audit-log", group: "operations" },

  { key: "settings", title: "Settings", url: "/settings", group: "system" },
  { key: "users", title: "Users", url: "/users", group: "system" },
];

/**
 * Routes every signed-in user can reach regardless of role: their own portal,
 * their own notifications, and onboarding.
 */
const ALWAYS_ALLOWED = ["/onboarding", "/notifications", "/parent", "/student"];

/**
 * Detail and sub-routes inherit access from the list page they belong to.
 * Longest prefix wins, so "/payments/new" resolves through "/payments".
 */
const NAV_KEY_BY_ROLE: Record<AppRole, string[]> = {
  super_admin: NAV_ITEMS.map((i) => i.key),
  proprietor: NAV_ITEMS.map((i) => i.key),
  group_admin: NAV_ITEMS.map((i) => i.key),

  school_admin: [
    "dashboard", "admissions", "students", "guardians", "staff", "attendance", "exams", "performance",
    "fees", "invoices", "payments", "arrears",
    "announcements", "templates", "events", "preferences",
    "transport", "approvals", "reports",
    "settings", "users",
  ],
  principal: [
    "dashboard", "admissions", "students", "guardians", "staff", "attendance", "exams", "performance",
    "invoices", "arrears",
    "announcements", "templates", "events", "preferences",
    "transport", "approvals", "reports",
    "users",
  ],
  bursar: [
    "dashboard", "admissions", "students", "guardians",
    "fees", "invoices", "payments", "arrears",
    "announcements", "events", "preferences",
    "transport", "payroll", "reports",
    "users",
  ],
  finance_officer: [
    "dashboard", "students",
    "invoices", "payments", "arrears",
    "events", "preferences",
    "reports",
    "users",
  ],
  hr_admin: [
    "dashboard", "staff",
    "announcements", "events", "preferences",
    "payroll", "reports",
    "users",
  ],
  teacher: [
    "dashboard", "students", "attendance", "exams", "performance",
    "announcements", "events", "preferences",
  ],
  parent: [
    "dashboard",
    "events", "preferences",
  ],
  // A student sees their own portal and their own notification preferences.
  // Everything else on the dashboard is the school's, not theirs.
  student: [
    "dashboard",
    "events", "preferences",
  ],
};

const URL_BY_KEY = new Map(NAV_ITEMS.map((i) => [i.key, i.url]));

/** Nav items this role may see, in declaration order. */
export function navItemsForRole(role: string | null): NavItem[] {
  const keys = NAV_KEY_BY_ROLE[(role || "teacher") as AppRole] ?? NAV_KEY_BY_ROLE.teacher;
  const allowed = new Set(keys);
  return NAV_ITEMS.filter((i) => allowed.has(i.key));
}

/** The self-service portal for a role, or null for staff. */
export function portalPathForRole(role: string | null): string | null {
  if (role === "parent") return "/parent";
  if (role === "student") return "/student";
  return null;
}

/** Where the "Profile & Settings" link should point for this role. */
export function profileLinkForRole(role: string | null): string {
  return canAccessPath(role, "/settings") ? "/settings" : "/notification-settings";
}

/**
 * Whether a role may open a path. Unknown paths (public pages, 404) are allowed
 * through — this guards the app shell, not the whole router.
 */
export function canAccessPath(role: string | null, pathname: string): boolean {
  if (ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;

  const keys = NAV_KEY_BY_ROLE[(role || "") as AppRole];
  // An unrecognised role gets nothing beyond the always-allowed routes.
  if (!keys) return false;

  // Longest matching nav url wins so detail routes inherit from their list page.
  let bestKey: string | null = null;
  let bestLength = -1;
  for (const item of NAV_ITEMS) {
    if (pathname === item.url || pathname.startsWith(item.url + "/")) {
      if (item.url.length > bestLength) {
        bestLength = item.url.length;
        bestKey = item.key;
      }
    }
  }

  // An app-shell path that matches no nav item is not something we can reason
  // about, so it is refused rather than waved through.
  if (!bestKey) return false;
  return keys.includes(bestKey);
}

/** Roles allowed to create, import or promote student records. */
const STUDENT_WRITERS: AppRole[] = [
  "super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar",
];

/** Whether a role may change student records (as opposed to just reading them). */
export function canManageStudents(role: string | null): boolean {
  return STUDENT_WRITERS.includes((role || "") as AppRole);
}

/** Exported for tests. */
export const _internals = { NAV_KEY_BY_ROLE, URL_BY_KEY };
