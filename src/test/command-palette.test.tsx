import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// cmdk measures its list and scrolls the active item into view; jsdom has
// neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

// The ⌘K palette against a fake backend: typing a name finds the record, and a
// role only sees what it can open.
let role = "proprietor";
const rows: Record<string, Record<string, unknown>[]> = {
  students: [{ id: "s1", first_name: "Ada", last_name: "Obi", student_id_number: "GA/001", status: "active" }],
  subjects: [{ id: "sub", name: "Adamawa Studies", short_code: "ADS" }],
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userRole: role, schoolId: "school-1", orgId: "org-1" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const q = {
        select: () => q, or: () => q, eq: () => q, limit: () => q,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null }),
      };
      return q;
    },
  },
}));

import { CommandPalette } from "@/components/layout/CommandPalette";

function openPalette() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    role = "proprietor";
  });

  it("finds records by name, not just pages", async () => {
    openPalette();
    fireEvent.change(screen.getByPlaceholderText(/search pupils/i), { target: { value: "ada" } });

    await waitFor(() => expect(screen.getByText("Ada Obi")).toBeInTheDocument());
    expect(screen.getByText("GA/001 · active")).toBeInTheDocument();
    expect(screen.getByText("Adamawa Studies")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getByText("Subjects")).toBeInTheDocument();
  });

  it("still finds pages by title", async () => {
    openPalette();
    fireEvent.change(screen.getByPlaceholderText(/search pupils/i), { target: { value: "fee sch" } });
    expect(screen.getByText("Fee Schedules")).toBeInTheDocument();
    expect(screen.queryByText("Payroll")).not.toBeInTheDocument();
  });

  it("offers a parent neither staff pages nor other people's records", async () => {
    role = "parent";
    openPalette();
    expect(screen.queryByText("Payroll")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search pupils/i), { target: { value: "ada" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByText("Ada Obi")).not.toBeInTheDocument();
  });
});
