import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { runAiInsight, AiAddonError } from "@/lib/ai-insights";

beforeEach(() => invoke.mockReset());

describe("runAiInsight", () => {
  it("sends the analysis type, summary and school to the edge function", async () => {
    invoke.mockResolvedValue({
      data: { result: "Maths is the weakest subject.", usage: { used_this_month: 3, monthly_limit: 200 } },
      error: null,
    });

    const result = await runAiInsight("academic_performance", { classAverage: 62 }, "school-1");

    expect(invoke).toHaveBeenCalledWith("ai-insights", {
      body: {
        analysis_type: "academic_performance",
        summary: { classAverage: 62 },
        school_id: "school-1",
      },
    });
    expect(result.result).toBe("Maths is the weakest subject.");
    expect(result.usage.used_this_month).toBe(3);
  });

  it("passes a null school rather than dropping the key", async () => {
    invoke.mockResolvedValue({ data: { result: "x", usage: {} }, error: null });
    await runAiInsight("finance", {});
    expect(invoke.mock.calls[0][1].body.school_id).toBeNull();
  });

  it("surfaces the entitlement code so the UI can distinguish an upsell from a failure", async () => {
    // supabase-js reports any non-2xx as a generic error, so the real reason has
    // to be read out of the response body.
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(
          JSON.stringify({ error: "The AI analysis add-on is not enabled for your organisation.", code: "addon_disabled" }),
          { status: 402 }
        ),
      },
    });

    await expect(runAiInsight("finance", {})).rejects.toMatchObject({
      name: "AiAddonError",
      code: "addon_disabled",
      message: "The AI analysis add-on is not enabled for your organisation.",
    });
  });

  it("reports the monthly limit being reached", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(
          JSON.stringify({ error: "Your organisation has used all 200 AI analyses for this month.", code: "limit_reached" }),
          { status: 429 }
        ),
      },
    });

    await expect(runAiInsight("staff", {})).rejects.toMatchObject({ code: "limit_reached" });
  });

  it("falls back to the transport message when the body is not JSON", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch", context: new Response("<html>502</html>", { status: 502 }) },
    });
    await expect(runAiInsight("finance", {})).rejects.toBeInstanceOf(AiAddonError);
  });

  it("treats an empty result as a failure rather than showing a blank panel", async () => {
    invoke.mockResolvedValue({ data: { result: "", usage: {} }, error: null });
    await expect(runAiInsight("finance", {})).rejects.toThrow(/came back empty/);
  });

  it("surfaces an error returned in a 200 body", async () => {
    invoke.mockResolvedValue({ data: { error: "The model declined to answer this request." }, error: null });
    await expect(runAiInsight("report_card_comments", {})).rejects.toThrow(/declined/);
  });
});
