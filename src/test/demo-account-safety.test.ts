import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An anonymous visitor could delete any account on the platform:
 *
 *   1. start-demo hands out a proprietor session for a fresh sandbox org;
 *   2. invite_guardian / invite_student attached an *existing* account found by
 *      email to that org, with no "belongs to another organisation" check;
 *   3. "End demo" deleted every auth user holding a role in the sandbox.
 *
 * Both halves are guarded now. The edge functions run under Deno, so these
 * tests read the source rather than execute it.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../../supabase/functions", p), "utf8");

/**
 * The existing-user branch of one action: from its email lookup to its role
 * insert. Bounded at both ends, so a check in a later action cannot satisfy it.
 */
function existingUserBranch(src: string, name: string): string {
  const start = src.indexOf(`if (action === "${name}")`);
  expect(start, `action ${name} not found`).toBeGreaterThan(-1);
  const lookup = src.indexOf("findUserByEmail", start);
  const insert = src.indexOf('from("user_roles").insert', lookup);
  expect(lookup).toBeGreaterThan(-1);
  expect(insert).toBeGreaterThan(lookup);
  return src.slice(lookup, insert);
}

const OTHER_ORG_REFUSAL = /r\.org_id\s*&&\s*r\.org_id\s*!==\s*org_id/;

describe("invite-user never attaches an account from another organisation", () => {
  const src = read("invite-user/index.ts");

  it.each(["invite_guardian", "invite_student"])("%s refuses an existing user in another org", (action) => {
    const block = existingUserBranch(src, action);
    expect(block).toMatch(OTHER_ORG_REFUSAL);
    expect(block).toMatch(/belongs to another organisation/);
  });

  it("the staff invite keeps its refusal", () => {
    const tail = src.slice(src.lastIndexOf("findUserByEmail(adminClient, email)"));
    expect(tail).toMatch(OTHER_ORG_REFUSAL);
  });
});

describe("ending a demo deletes only throwaway demo logins", () => {
  const src = read("start-demo/index.ts");
  const start = src.indexOf("async function destroyDemoOrg");
  const body = src.slice(start, src.indexOf("\n}\n", start));

  it("checks the reserved demo email domain before deleting a user", () => {
    expect(body).toMatch(/DEMO_EMAIL_DOMAIN/);
    expect(body.indexOf("DEMO_EMAIL_DOMAIN")).toBeLessThan(body.indexOf("deleteUser"));
  });

  it("skips a user who holds a role in any other organisation", () => {
    expect(body).toMatch(/\.neq\("org_id", orgId\)/);
  });
});
