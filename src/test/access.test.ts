import { describe, it, expect } from "vitest";
import { canAccessPath, navItemsForRole, portalPathForRole, profileLinkForRole } from "@/lib/access";

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
