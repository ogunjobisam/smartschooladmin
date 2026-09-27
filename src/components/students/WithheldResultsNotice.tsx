import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/use-currency";
import { useWithheldResults } from "@/hooks/use-withheld-results";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";

interface WithheldResultsNoticeProps {
  studentId: string;
  /** Whose screen this is on, which decides the wording. */
  audience: "student" | "parent" | "staff";
  /** Staff who may release results for a term regardless of fees. */
  canRelease?: boolean;
  schoolId?: string | null;
}

export function WithheldResultsNotice({ studentId, audience, canRelease = false, schoolId }: WithheldResultsNoticeProps) {
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const { data: periods = [] } = useWithheldResults(studentId);

  const release = useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await supabase.from("result_releases").insert({
        school_id: schoolId!,
        student_id: studentId,
        academic_period_id: periodId,
        reason: "Released by staff",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Results released for this term");
      queryClient.invalidateQueries({ queryKey: ["withheld-results", studentId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not release results")),
  });

  if (periods.length === 0) return null;

  const lead =
    audience === "student"
      ? "Some of your results are being held until school fees are paid."
      : audience === "parent"
        ? "Some results are being held until school fees are paid."
        : "This pupil's family cannot see these results until fees are paid.";

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        {lead}
      </p>
      <ul className="space-y-1.5 pl-6">
        {periods.map((p) => (
          <li key={p.academic_period_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {p.period_name}:{" "}
              <span className="font-mono tabular-nums">{formatMoney(p.outstanding)}</span> outstanding
            </span>
            {audience === "staff" && canRelease && schoolId && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={release.isPending}
                onClick={() => release.mutate(p.academic_period_id)}
              >
                {release.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Release anyway
              </Button>
            )}
          </li>
        ))}
      </ul>
      {audience !== "staff" && (
        <p className="pl-6 text-xs text-muted-foreground">
          They will appear here as soon as the balance is cleared. Contact the school if you have already paid.
        </p>
      )}
    </div>
  );
}
