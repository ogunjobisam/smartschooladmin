import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WithheldPeriod } from "@/hooks/use-withheld-results";

let periods: WithheldPeriod[] = [];
let hold: { id: string; reason: string; family_message: string | null } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "insert", "delete"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: hold, error: null });
    return b;
  };
  return {
    supabase: {
      rpc: async () => ({ data: periods, error: null }),
      from: () => builder(),
    },
  };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ currency: "NGN" }) }));

import { WithheldResultsNotice } from "@/components/students/WithheldResultsNotice";

const renderNotice = (props: Partial<Parameters<typeof WithheldResultsNotice>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WithheldResultsNotice studentId="kemi" audience="parent" {...props} />
    </QueryClientProvider>
  );

const feeTerm: WithheldPeriod = {
  academic_period_id: "t1", period_name: "First Term", outstanding: 30000, held: false, message: null, note: null,
};

beforeEach(() => { periods = []; hold = null; });

describe("WithheldResultsNotice", () => {
  it("tells a family how much is owed for a fee-withheld term", async () => {
    periods = [feeTerm];
    renderNotice();
    expect(await screen.findByText(/held until school fees are paid/)).toBeInTheDocument();
    expect(screen.getByText(/30,000/)).toBeInTheDocument();
  });

  it("tells a family the school's message for a hold, and never the internal reason", async () => {
    periods = [{ ...feeTerm, outstanding: 0, held: true, message: "Please see the principal.", note: null }];
    renderNotice();
    expect(await screen.findByText("Please see the principal.")).toBeInTheDocument();
    expect(screen.getByText(/being held by the school/)).toBeInTheDocument();
    expect(screen.queryByText(/owed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reason/)).not.toBeInTheDocument();
  });

  it("shows staff the reason and lets them lift the hold, not release it as if it were fees", async () => {
    periods = [{ ...feeTerm, held: true, message: "Please see the principal.", note: "Library books" }];
    hold = { id: "h1", reason: "Library books", family_message: "Please see the principal." };
    renderNotice({ audience: "staff", canRelease: true, schoolId: "school" });
    expect(await screen.findByText(/Reason \(staff only\): Library books/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /lift hold/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /release anyway/i })).not.toBeInTheDocument();
  });

  it("offers staff a way to hold a pupil who is not withheld at all", async () => {
    renderNotice({ audience: "staff", canRelease: true, schoolId: "school" });
    expect(await screen.findByText(/Hold this pupil's results/)).toBeInTheDocument();
  });

  it("shows families nothing when nothing is withheld", async () => {
    const { container } = renderNotice();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
