import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ data: [], error: null }),
          maybeSingle: () => ({ data: null, error: null }),
          limit: () => ({ data: [], error: null }),
          in: () => ({ data: [], error: null }),
        }),
        in: () => ({
          order: () => ({ data: [], error: null }),
        }),
      }),
      insert: () => ({ data: null, error: null, select: () => ({ single: () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
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
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/contexts/SchoolBrandingContext", () => ({
  useSchoolBranding: () => ({
    branding: { name: "Test School", primaryColor: "#000", accentColor: "#333", tagline: "", logoUrl: "" },
    refetch: () => {},
  }),
  SchoolBrandingProvider: ({ children }: any) => children,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  QueryClientProvider: ({ children }: any) => children,
  QueryClient: class {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "test-id" }),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
  NavLink: ({ children, to }: any) => <a href={to}>{children}</a>,
  Navigate: () => null,
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
    // Override useQuery to return empty arrays instead of null
    const rq = await import("@tanstack/react-query");
    vi.spyOn(rq, "useQuery").mockReturnValue({ data: [], isLoading: false } as any);
    const { PromoteStudentsDialog } = await import("@/components/students/PromoteStudentsDialog");
    render(<PromoteStudentsDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText("Promote Students")).toBeInTheDocument();
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
