import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let rows: Record<string, unknown>[] = [];
const rpc = vi.fn(async () => ({ data: "adj-1", error: null }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return b;
  };
  return { supabase: { from: () => builder(), rpc: (...args: unknown[]) => rpc(...(args as [])) } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ currency: "NGN" }) }));

import { InvoiceAdjustments } from "@/components/finance/InvoiceAdjustments";

const renderIt = (props: Partial<Parameters<typeof InvoiceAdjustments>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoiceAdjustments invoiceId="inv-1" outstanding={40000} canRequest {...props} />
    </QueryClientProvider>
  );

// Radix Select calls these, and jsdom does not implement them.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

beforeEach(() => { rows = []; rpc.mockClear(); });

describe("InvoiceAdjustments", () => {
  it("shows a pending request as awaiting approval, not as applied", async () => {
    rows = [{ id: "a", kind: "discount", amount: 5000, percent: 10, reason: "Sibling", status: "pending", created_at: "", decided_at: null, decision_notes: null }];
    renderIt();
    expect(await screen.findByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.getByText(/discount \(10%\): Sibling/i)).toBeInTheDocument();
  });

  it("offers only what is left once pending requests are counted", async () => {
    rows = [{ id: "a", kind: "waiver", amount: 15000, percent: null, reason: "Hardship", status: "pending", created_at: "", decided_at: null, decision_notes: null }];
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /request/i }));
    expect(await screen.findByText(/Up to .*25,000 can still be written off/)).toBeInTheDocument();
  });

  it("sends a percentage as a percentage, for the database to price", async () => {
    renderIt();
    fireEvent.click(await screen.findByRole("button", { name: /request/i }));
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: /percentage/i }));
    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Sibling discount" } });
    fireEvent.click(screen.getByRole("button", { name: /send for approval/i }));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("request_invoice_adjustment", {
      _invoice_id: "inv-1", _kind: "discount", _amount: null, _percent: 10, _reason: "Sibling discount",
    });
  });

  it("does not offer requests to someone who cannot make them, and hides an empty card", async () => {
    const { container } = renderIt({ canRequest: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
