import { describe, it, expect } from "vitest";
import {
  canAssignRole,
  PEER_ASSIGNABLE,
  ROLE_RANK,
} from "../../supabase/functions/_shared/caller-roles.ts";
import { ROLES, ROLE_RANK as UI_ROLE_RANK, ADMIN_ROLES } from "@/lib/roles";

/**
 * Who may appoint whom.
 *
 * This is the authority rule behind every role grant in the invite-user edge
 * function, and the User Management screen reads the same function, so these
 * assertions are the actual security boundary rather than a description of one.
 */
describe("canAssignRole", () => {
  it("lets a senior role appoint anyone below it", () => {
    expect(canAssignRole("proprietor", "school_admin")).toBe(true);
    expect(canAssignRole("school_admin", "teacher")).toBe(true);
    expect(canAssignRole("principal", "bursar")).toBe(true);
    expect(canAssignRole("hr_admin", "support_staff")).toBe(true);
  });

  it("refuses to let anyone appoint above themselves", () => {
    expect(canAssignRole("school_admin", "group_admin")).toBe(false);
    expect(canAssignRole("principal", "school_admin")).toBe(false);
    expect(canAssignRole("bursar", "principal")).toBe(false);
    expect(canAssignRole("teacher", "hr_admin")).toBe(false);
  });

  // The change: a school can have two people who run it.
  it("lets the roles that run a school appoint their own peers", () => {
    expect(canAssignRole("school_admin", "school_admin")).toBe(true);
    expect(canAssignRole("principal", "principal")).toBe(true);
  });

  // The change is narrow on purpose — a blanket `>=` would have done this too.
  it("still refuses every other role the power to clone itself", () => {
    for (const role of ["bursar", "finance_officer", "hr_admin", "support_staff", "teacher", "parent", "student"]) {
      expect(canAssignRole(role, role), `${role} should not appoint a ${role}`).toBe(false);
    }
  });

  describe("super_admin", () => {
    it("can be granted by a super admin, and by nobody else", () => {
      expect(canAssignRole("super_admin", "super_admin")).toBe(true);
      for (const role of Object.keys(ROLE_RANK).filter((r) => r !== "super_admin")) {
        expect(canAssignRole(role, "super_admin"), `${role} must not mint a super admin`).toBe(false);
      }
    });

    it("can still appoint every other role", () => {
      for (const role of Object.keys(ROLE_RANK).filter((r) => r !== "super_admin")) {
        expect(canAssignRole("super_admin", role), `super_admin should appoint a ${role}`).toBe(true);
      }
    });
  });

  it("refuses roles it has never heard of, in either position", () => {
    expect(canAssignRole("super_admin", "root")).toBe(false);
    expect(canAssignRole("root", "teacher")).toBe(false);
    expect(canAssignRole("", "")).toBe(false);
  });

  it("names only roles that exist as peer-assignable", () => {
    for (const role of PEER_ASSIGNABLE) {
      expect(ROLE_RANK[role], `${role} is peer-assignable but has no rank`).toBeDefined();
    }
  });
});

/**
 * The edge function and the browser must agree on seniority. When they drift, a
 * caller is gated one way by invite-user and another by the UI, and the screen
 * offers a role the server then refuses.
 */
describe("the rank table the UI uses", () => {
  it("matches the shared one exactly, both directions", () => {
    expect(UI_ROLE_RANK).toEqual(ROLE_RANK);
  });

  it("gives every role the UI lists a rank", () => {
    for (const role of ROLES) {
      expect(ROLE_RANK[role.value], `${role.value} has no rank`).toBeDefined();
    }
  });

  it("lists every ranked role in the UI, so none is unassignable by omission", () => {
    for (const role of Object.keys(ROLE_RANK)) {
      expect(ROLES.map((r) => r.value), `${role} is ranked but absent from ROLES`).toContain(role);
    }
  });

  it("keeps ADMIN_ROLES to roles that outrank a teacher", () => {
    for (const role of ADMIN_ROLES) {
      expect(ROLE_RANK[role]).toBeLessThan(ROLE_RANK.teacher);
    }
  });
});
