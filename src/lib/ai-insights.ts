import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";

export type AnalysisType =
  | "academic_performance"
  | "report_card_comments"
  | "finance"
  | "staff";

export interface AiInsightResult {
  result: string;
  usage: { used_this_month: number; monthly_limit: number };
}

/** Raised when the org has not bought the add-on or has used its allowance. */
export class AiAddonError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "AiAddonError";
  }
}

/**
 * Run one AI analysis.
 *
 * `summary` is the already-aggregated view of the caller's own data — the raw
 * rows never leave the browser, and the edge function re-checks the caller's
 * role, organisation and remaining allowance before spending anything.
 */
export async function runAiInsight(
  analysisType: AnalysisType,
  summary: unknown,
  schoolId?: string | null
): Promise<AiInsightResult> {
  const { data, error } = await supabase.functions.invoke("ai-insights", {
    body: { analysis_type: analysisType, summary, school_id: schoolId ?? null },
  });

  // supabase-js surfaces a non-2xx as a generic FunctionsHttpError, so the real
  // message and code have to be read off the response body.
  if (error) {
    const body = await readErrorBody(error);
    throw new AiAddonError(body.message ?? getErrorMessage(error, "AI analysis failed"), body.code);
  }
  if (data?.error) throw new AiAddonError(data.error, data.code);
  if (!data?.result) throw new AiAddonError("The analysis came back empty. Try again.");

  return { result: data.result, usage: data.usage };
}

async function readErrorBody(error: unknown): Promise<{ message?: string; code?: string }> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const parsed = await context.json();
      return { message: parsed?.error, code: parsed?.code };
    } catch {
      return {};
    }
  }
  return {};
}
