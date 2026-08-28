import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { diagnoseError } from "@/lib/errors";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// The auth state under test. Each case rewrites this before rendering.
type AuthState = {
  user: { id: string } | null;
  loading: boolean;
  orgId: string | null;
  userRole: string | null;
  roleError: ReturnType<typeof diagnoseError> | null;
};

const auth: AuthState = {
  user: { id: "u1" }, loading: false, orgId: "org1", userRole: "proprietor", roleError: null,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ ...auth, retryRole: () => {}, signOut: async () => {} }),
}));

// Navigate renders nothing, so assert on where it was pointed instead.
const navigatedTo: string[] = [];
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Navigate: ({ to }: { to: string }): null => {
      navigatedTo.push(to);
      return null;
    },
  };
});

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <ProtectedRoute><div>the app</div></ProtectedRoute>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    navigatedTo.length = 0;
    Object.assign(auth, {
      user: { id: "u1" }, loading: false, orgId: "org1", userRole: "proprietor", roleError: null,
    } satisfies AuthState);
  });

  it("shows the app to a signed-in user with an organisation", () => {
    renderRoute();
    expect(screen.getByText("the app")).toBeTruthy();
  });

  it("sends someone who is not signed in to the login page", () => {
    Object.assign(auth, { user: null });
    renderRoute();
    expect(navigatedTo).toContain("/login");
  });

  it("sends a genuinely new user to onboarding", () => {
    // No role row at all and nothing went wrong: this really is someone with
    // nothing set up, and the wizard is the right place for them.
    Object.assign(auth, { orgId: null, userRole: null });
    renderRoute();
    expect(navigatedTo).toContain("/onboarding");
  });

  it("does not send someone to onboarding when the role lookup failed", () => {
    // The regression this guards: a failed lookup leaves orgId null, which used
    // to be read as "new user" and silently redirected a working account into
    // the org-creation wizard with nothing on screen to explain it.
    Object.assign(auth, {
      orgId: null,
      userRole: null,
      roleError: diagnoseError({ code: "42501", message: "permission denied for table user_roles" }),
    });
    renderRoute();
    expect(navigatedTo).not.toContain("/onboarding");
  });

  it("puts the failure code on screen where it can be read back", () => {
    Object.assign(auth, {
      orgId: null,
      userRole: null,
      roleError: diagnoseError({ code: "42P17", message: "infinite recursion detected in policy" }),
    });
    renderRoute();
    expect(screen.getByText(/42P17/)).toBeTruthy();
    expect(screen.getByText(/infinite recursion detected in policy/)).toBeTruthy();
  });

  it("does not offer onboarding to an account whose role has no organisation", () => {
    // setup-organisation only refuses a second organisation when the existing
    // role row carries an org_id, so onboarding here would actually build one.
    Object.assign(auth, { orgId: null, userRole: "teacher" });
    renderRoute();
    expect(navigatedTo).not.toContain("/onboarding");
    expect(screen.getByText(/isn.t attached to a school/i)).toBeTruthy();
  });

  it("shows a spinner rather than deciding anything while still loading", () => {
    Object.assign(auth, { loading: true, orgId: null, userRole: null });
    renderRoute();
    expect(navigatedTo).toHaveLength(0);
    expect(screen.queryByText("the app")).toBeNull();
  });
});
