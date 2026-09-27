import { describe, it, expect } from "vitest";
import { canAccessPath, canApproveAdjustments, canManageStudents, canManageTermReports, canReleaseResults, RESULT_RELEASERS, navItemsForRole, portalPathForRole, profileLinkForRole, NAV_ITEMS, _internals } from "@/lib/access";
import { ROLES } from "@/lib/roles";
import fs from "node:fs";
import path from "node:path";

describe("canAccessPath", () => {
  it("lets a proprietor everywhere in the app shell", () => {
    for (const path of ["/payroll", "/settings", "/audit-log", "/users", "/reports"]) {
      expect(canAccessPath("proprietor", path)).toBe(true);
    }
  });

  it("keeps a teacher out of payroll, settings, audit log and user management", () => {
    expect(canAccessPath("teacher", "/payroll")).toBe(false);
    expect(canAccessPath("teacher", "/settings")).toBe(false);
    expect(canAccessPath("teacher", "/audit-log")).toBe(false);
    expect(canAccessPath("teacher", "/users")).toBe(false);
  });

  it("keeps a teacher in the classroom pages they need", () => {
    expect(canAccessPath("teacher", "/attendance")).toBe(true);
    expect(canAccessPath("teacher", "/exams")).toBe(true);
    expect(canAccessPath("teacher", "/students")).toBe(true);
  });

  it("lets everyone who works at the school see their own pay", () => {
    // Distinct from /payroll, which is the whole school's. A teacher has no
    // business in the payroll run and every right to their own payslip.
    for (const role of ["teacher", "principal", "school_admin", "hr_admin", "bursar", "finance_officer", "proprietor"]) {
      expect(canAccessPath(role, "/my-pay"), role).toBe(true);
    }
    expect(canAccessPath("teacher", "/payroll")).toBe(false);
  });

  it("does not offer My Pay to families, who are not paid by the school", () => {
    expect(canAccessPath("parent", "/my-pay")).toBe(false);
    expect(canAccessPath("student", "/my-pay")).toBe(false);
  });

  it("keeps a parent out of the whole school's finances", () => {
    // The parent portal shows their own children's invoices; the staff-facing
    // invoice and payment lists cover the entire school.
    expect(canAccessPath("parent", "/invoices")).toBe(false);
    expect(canAccessPath("parent", "/payments")).toBe(false);
    expect(canAccessPath("parent", "/arrears")).toBe(false);
    expect(canAccessPath("parent", "/students")).toBe(false);
  });

  it("always allows the self-service portals, notifications and onboarding", () => {
    expect(canAccessPath("parent", "/parent")).toBe(true);
    expect(canAccessPath("student", "/student")).toBe(true);
    expect(canAccessPath("teacher", "/notifications")).toBe(true);
    expect(canAccessPath("parent", "/onboarding")).toBe(true);
  });

  it("keeps a student out of every staff page", () => {
    for (const path of ["/students", "/staff", "/invoices", "/payments", "/attendance",
                        "/exams", "/performance", "/payroll", "/reports", "/settings", "/users"]) {
      expect(canAccessPath("student", path), path).toBe(false);
    }
  });

  it("lets a student reach their own portal and preferences", () => {
    expect(canAccessPath("student", "/student")).toBe(true);
    expect(canAccessPath("student", "/notification-settings")).toBe(true);
    expect(canAccessPath("student", "/notifications")).toBe(true);
  });

  it("inherits access on detail routes from their list page", () => {
    expect(canAccessPath("teacher", "/students/abc-123")).toBe(true);
    expect(canAccessPath("teacher", "/payroll/abc-123")).toBe(false);
    expect(canAccessPath("bursar", "/invoices/abc-123")).toBe(true);
  });

  it("resolves /payments/new through /payments, not a prefix collision", () => {
    expect(canAccessPath("finance_officer", "/payments/new")).toBe(true);
    expect(canAccessPath("teacher", "/payments/new")).toBe(false);
  });

  it("denies an unknown or missing role rather than defaulting open", () => {
    expect(canAccessPath(null, "/payroll")).toBe(false);
    expect(canAccessPath("not_a_role", "/settings")).toBe(false);
  });

  it("keeps admissions in the school office", () => {
    for (const role of ["school_admin", "principal", "bursar"]) {
      expect(canAccessPath(role, "/admissions")).toBe(true);
    }
    for (const role of ["teacher", "parent", "student", "hr_admin", "finance_officer"]) {
      expect(canAccessPath(role, "/admissions")).toBe(false);
    }
  });

  it("keeps transport with the people who bill for it, not with riders", () => {
    for (const role of ["school_admin", "principal", "bursar"]) {
      expect(canAccessPath(role, "/transport")).toBe(true);
    }
    for (const role of ["teacher", "parent", "student", "finance_officer", "hr_admin"]) {
      expect(canAccessPath(role, "/transport")).toBe(false);
    }
  });

  it("does not treat /notification-settings as part of /notifications", () => {
    // Distinct routes: one is the user's own preferences, the other their inbox.
    expect(canAccessPath("parent", "/notification-settings")).toBe(true);
    expect(canAccessPath("parent", "/notification-templates")).toBe(false);
  });
});

describe("navItemsForRole", () => {
  it("shows a student only their own preferences in the nav", () => {
    const urls = navItemsForRole("student").map((i) => i.url);
    expect(urls).toContain("/dashboard");
    expect(urls).not.toContain("/students");
    expect(urls).not.toContain("/exams");
    expect(urls).not.toContain("/invoices");
  });

  it("shows a parent only what their portal covers", () => {
    const urls = navItemsForRole("parent").map((i) => i.url);
    expect(urls).toContain("/dashboard");
    expect(urls).not.toContain("/invoices");
    expect(urls).not.toContain("/staff");
  });

  it("gives hr_admin staff and payroll but no student or fee pages", () => {
    const urls = navItemsForRole("hr_admin").map((i) => i.url);
    expect(urls).toEqual(expect.arrayContaining(["/staff", "/payroll"]));
    expect(urls).not.toContain("/students");
    expect(urls).not.toContain("/fees");
  });

  it("never offers a link the router would then refuse", () => {
    const roles = ["super_admin", "proprietor", "group_admin", "school_admin", "principal",
      "bursar", "finance_officer", "hr_admin", "teacher", "parent", "student"];
    for (const role of roles) {
      for (const item of navItemsForRole(role)) {
        expect(canAccessPath(role, item.url), `${role} -> ${item.url}`).toBe(true);
      }
    }
  });
});

describe("portalPathForRole", () => {
  it("sends self-service roles to their own portal", () => {
    expect(portalPathForRole("parent")).toBe("/parent");
    expect(portalPathForRole("student")).toBe("/student");
  });

  it("leaves staff on the school dashboard", () => {
    expect(portalPathForRole("bursar")).toBeNull();
    expect(portalPathForRole("proprietor")).toBeNull();
    expect(portalPathForRole(null)).toBeNull();
  });
});

describe("profileLinkForRole", () => {
  it("sends roles without settings access to their own preferences instead", () => {
    expect(profileLinkForRole("proprietor")).toBe("/settings");
    expect(profileLinkForRole("teacher")).toBe("/notification-settings");
    expect(profileLinkForRole("parent")).toBe("/notification-settings");
    expect(profileLinkForRole("student")).toBe("/notification-settings");
  });
});

describe("canManageStudents", () => {
  it("allows management roles and refuses everyone else", () => {
    for (const role of ["proprietor", "group_admin", "school_admin", "principal", "bursar"]) {
      expect(canManageStudents(role), role).toBe(true);
    }
    for (const role of ["teacher", "parent", "student", "finance_officer", "hr_admin", null]) {
      expect(canManageStudents(role), String(role)).toBe(false);
    }
  });
});

describe("canManageTermReports", () => {
  // The screen hides the principal's comment box and the release button from
  // everyone else; is_academic_manager() in SQL is what actually refuses them.
  // They must name the same roles, or the screen offers what RLS refuses.
  it("names exactly the roles is_academic_manager() admits", () => {
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    const definitions = fs.readdirSync(dir).sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .flatMap((sql) => sql.match(/FUNCTION public\.is_academic_manager[\s\S]*?\$\$;/g) ?? []);
    expect(definitions.length).toBeGreaterThan(0);
    const latest = definitions[definitions.length - 1];
    const sqlRoles = [...latest.matchAll(/'([a-z_]+)'::app_role/g)].map((m) => m[1]);
    // has_role() treats super_admin as holding every role but student.
    const expected = new Set([...sqlRoles, "super_admin"]);

    for (const { value } of ROLES) {
      expect(canManageTermReports(value), value).toBe(expected.has(value));
    }
  });

  it("leaves out the bursar, who manages the school but not its results", () => {
    expect(canManageTermReports("bursar")).toBe(false);
    expect(canManageTermReports("teacher")).toBe(false);
    expect(canManageTermReports(null)).toBe(false);
  });
});

describe("canApproveAdjustments", () => {
  it("names exactly the roles can_approve_adjustments() admits", () => {
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    const definitions = fs.readdirSync(dir).sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .flatMap((sql) => sql.match(/FUNCTION public\.can_approve_adjustments[\s\S]*?\$\$;/g) ?? []);
    expect(definitions.length).toBeGreaterThan(0);
    const sqlRoles = [...definitions[definitions.length - 1].matchAll(/'([a-z_]+)'::app_role/g)].map((m) => m[1]);
    const expected = new Set([...sqlRoles, "super_admin"]);
    for (const { value } of ROLES) {
      expect(canApproveAdjustments(value), value).toBe(expected.has(value));
    }
  });

  it("leaves out the bursar, who asks for adjustments but does not grant them", () => {
    expect(canApproveAdjustments("bursar")).toBe(false);
    expect(canApproveAdjustments("finance_officer")).toBe(false);
  });
});

describe("unknown app-shell paths", () => {
  it("refuses paths that match no nav item", () => {
    expect(canAccessPath("proprietor", "/not-a-real-page")).toBe(false);
    expect(canAccessPath("teacher", "/secret")).toBe(false);
  });
});

/**
 * The role map is keyed by string, so a typo in it typechecks cleanly and simply
 * drops the page from that role's menu — a link that silently never appears.
 * `support_staff` was written with a "notices" key that does not exist, and this
 * is what found it.
 */
describe("the role → nav map", () => {
  const { NAV_KEY_BY_ROLE } = _internals;
  const realKeys = new Set(NAV_ITEMS.map((i) => i.key));

  it("names only keys that exist in NAV_ITEMS", () => {
    for (const [role, keys] of Object.entries(NAV_KEY_BY_ROLE)) {
      for (const key of keys as string[]) {
        expect(realKeys.has(key), `${role} names "${key}", which is not a nav item`).toBe(true);
      }
    }
  });

  it("gives every role in the union a map entry, so nobody signs in to nothing", () => {
    for (const role of ROLES.map((r) => r.value)) {
      expect(navItemsForRole(role).length, `${role} can reach no page at all`).toBeGreaterThan(0);
    }
  });

  it("keeps support staff out of anything with money or personnel in it", () => {
    const reachable = navItemsForRole("support_staff").map((i) => i.url);
    for (const forbidden of [
      "/fees", "/invoices", "/payments", "/arrears", "/payroll",
      "/approvals", "/reports", "/users", "/roles", "/audit-log", "/billing",
    ]) {
      expect(reachable, `support staff should not reach ${forbidden}`).not.toContain(forbidden);
    }
    expect(canAccessPath("support_staff", "/invoices")).toBe(false);
    expect(canAccessPath("support_staff", "/payroll")).toBe(false);
    expect(canAccessPath("support_staff", "/users")).toBe(false);
    // But the office does need the people and the day.
    expect(canAccessPath("support_staff", "/students")).toBe(true);
    expect(canAccessPath("support_staff", "/timetable")).toBe(true);
  });
});

describe("canReleaseResults", () => {
  it("matches public.can_release_results() in the migration", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260927190100_withhold_results_until_paid.sql"),
      "utf8",
    );
    const body = sql.match(/FUNCTION public\.can_release_results\([\s\S]*?\$\$([\s\S]*?)\$\$/)![1];
    const inSql = [...body.matchAll(/has_role\(auth\.uid\(\), '([a-z_]+)'::app_role\)/g)].map((m) => m[1]);
    expect(inSql.length).toBeGreaterThan(0);
    expect(["super_admin", ...inSql].sort()).toEqual([...RESULT_RELEASERS].sort());
  });

  it("keeps teachers, support staff and families out", () => {
    for (const role of ["teacher", "support_staff", "hr_admin", "parent", "student", null]) {
      expect(canReleaseResults(role), String(role)).toBe(false);
    }
  });
});
