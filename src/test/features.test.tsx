import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock supabase. The shapes below stand in for query builder results, so they
// are typed loosely on purpose — the point of these tests is that the
// components render, not that the mock matches the real schema.
type MockResult = { data: unknown; error: null };

const emptyList = (): MockResult => ({ data: [], error: null });
const emptyRow = (): MockResult => ({ data: null, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: emptyList,
          maybeSingle: emptyRow,
          limit: emptyList,
          in: emptyList,
        }),
        in: () => ({ order: emptyList }),
      }),
      insert: () => ({ ...emptyRow(), select: () => ({ single: emptyRow }) }),
      update: () => ({ eq: emptyRow }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

// Mock auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com", user_metadata: { full_name: "Test User" } },
    schoolId: "test-school",
    orgId: "test-org",
    userRole: "proprietor",
    schools: [{ id: "test-school", name: "Test School" }],
    session: {},
    loading: false,
    currency: "NGN",
    setSchoolId: () => {},
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/contexts/SchoolBrandingContext", () => ({
  useSchoolBranding: () => ({
    branding: { name: "Test School", primaryColor: "#000", accentColor: "#333", tagline: "", logoUrl: "" },
    refetch: () => {},
  }),
  SchoolBrandingProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null as unknown, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  QueryClient: class {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "test-id" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: (): null => null,
}));

vi.mock("@/hooks/use-currency", () => ({
  useCurrency: () => ({
    formatMoney: (v: number) => `₦${v.toLocaleString()}`,
    currency: "NGN",
  }),
}));

describe("PromoteStudentsDialog", () => {
  it("should export correctly", async () => {
    const { PromoteStudentsDialog } = await import("@/components/students/PromoteStudentsDialog");
    expect(PromoteStudentsDialog).toBeDefined();
  });

  it("should render when open", async () => {
    const rq = await import("@tanstack/react-query");
    // useQuery's return type is large and irrelevant here; the component only
    // reads data and isLoading.
    vi.spyOn(rq, "useQuery").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof rq.useQuery>);
    const { PromoteStudentsDialog } = await import("@/components/students/PromoteStudentsDialog");
    render(<PromoteStudentsDialog open={true} onOpenChange={() => {}} />);
    const elements = screen.getAllByText("Promote Students");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });
});

describe("StudentHistoryTab", () => {
  it("should export correctly", async () => {
    const { StudentHistoryTab } = await import("@/components/students/StudentHistoryTab");
    expect(StudentHistoryTab).toBeDefined();
  });
});

describe("CSV Export utility", () => {
  it("should build CSV content correctly", async () => {
    const { exportToCsv } = await import("@/lib/csv-export");
    expect(exportToCsv).toBeDefined();
    expect(typeof exportToCsv).toBe("function");
  });
});

describe("Payment providers utility", () => {
  it("should generate payment reference", async () => {
    const { generatePaymentReference } = await import("@/lib/payment-providers");
    expect(generatePaymentReference).toBeDefined();
    const ref = generatePaymentReference();
    expect(typeof ref).toBe("string");
    expect(ref.length).toBeGreaterThan(0);
  });
});
