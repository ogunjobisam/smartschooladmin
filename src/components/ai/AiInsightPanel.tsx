import { useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAiAddon } from "@/hooks/use-ai-addon";
import { runAiInsight, type AnalysisType } from "@/lib/ai-insights";
import { getErrorMessage } from "@/lib/errors";
import { Markdown } from "./Markdown";

interface Props {
  analysisType: AnalysisType;
  title: string;
  description: string;
  /** Aggregated data to analyse. Returned lazily so nothing is computed until asked. */
  buildSummary: () => unknown;
  schoolId?: string | null;
  /** Disable when the page has nothing worth analysing yet. */
  disabledReason?: string;
}

/**
 * The AI add-on's single UI surface.
 *
 * The add-on is sold separately, so this renders one of three states: an upsell
 * when the organisation has not bought it, the monthly allowance when it has,
 * and the generated analysis once run.
 */
export function AiInsightPanel({
  analysisType,
  title,
  description,
  buildSummary,
  schoolId,
  disabledReason,
}: Props) {
  const { entitlement, isLoading: entitlementLoading, refetch } = useAiAddon();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await runAiInsight(analysisType, buildSummary(), schoolId);
      setResult(response.result);
      refetch();
    } catch (err) {
      setError(getErrorMessage(err, "Could not generate the analysis."));
    } finally {
      setRunning(false);
    }
  };

  if (entitlementLoading) return null;

  if (!entitlement.enabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="mt-0.5 h-fit rounded-md bg-accent/10 p-2">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">
                {description} Available with the AI Analysis add-on.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit shrink-0">Add-on</Badge>
        </CardContent>
      </Card>
    );
  }

  const outOfAllowance = entitlement.remaining <= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-accent" /> {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {entitlement.remaining} of {entitlement.monthlyLimit}
            {entitlement.hasAddon ? "" : " free"} left this month
          </span>
          <Button
            size="sm"
            variant={result ? "outline" : "default"}
            onClick={run}
            disabled={running || outOfAllowance || !!disabledReason}
            className="gap-1.5"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : result ? <RotateCcw className="h-3.5 w-3.5" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {running ? "Analysing…" : result ? "Regenerate" : "Analyse"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : outOfAllowance ? (
          <p className="text-sm text-muted-foreground">
            This organisation has used all {entitlement.monthlyLimit}{" "}
            {entitlement.hasAddon ? "" : "free "}analyses for this month. The allowance resets at
            the start of next month
            {entitlement.hasAddon
              ? "."
              : ", or add the AI Analysis add-on for a larger monthly allowance."}
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : result ? (
          <>
            <Markdown content={result} />
            <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
              Generated from this school's own data. Check anything you plan to act on —
              it can be wrong.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing generated yet. Analyse to get a written read of what this data shows.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
