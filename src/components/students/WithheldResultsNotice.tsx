import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/hooks/use-currency";
import { useWithheldResults } from "@/hooks/use-withheld-results";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";

interface WithheldResultsNoticeProps {
  studentId: string;
  /** Whose screen this is on, which decides the wording. */
  audience: "student" | "parent" | "staff";
  /** Staff who may release results for a term regardless of fees, or hold them. */
  canRelease?: boolean;
  schoolId?: string | null;
}

export function WithheldResultsNotice({ studentId, audience, canRelease = false, schoolId }: WithheldResultsNoticeProps) {
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const { data: periods = [] } = useWithheldResults(studentId);
  const manages = audience === "staff" && canRelease && !!schoolId;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["withheld-results", studentId] });
    queryClient.invalidateQueries({ queryKey: ["result-hold", studentId] });
  };

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
      refresh();
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not release results")),
  });

  if (periods.length === 0 && !manages) return null;

  const held = periods.some((p) => p.held);
  const lead = held
    ? audience === "staff"
      ? "This pupil's results are held. Their family cannot see them."
      : audience === "student"
        ? "Your results are being held by the school."
        : "These results are being held by the school."
    : audience === "student"
      ? "Some of your results are being held until school fees are paid."
      : audience === "parent"
        ? "Some results are being held until school fees are paid."
        : "This pupil's family cannot see these results until fees are paid.";

  return (
    <div className="space-y-2">
      {periods.length > 0 && (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-start gap-2 text-sm font-medium">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            {lead}
          </p>
          {held ? (
            <div className="space-y-1 pl-6 text-sm">
              <p>{periods.find((p) => p.held)?.message}</p>
              {audience === "staff" && periods.find((p) => p.held)?.note && (
                <p className="text-xs text-muted-foreground">Reason (staff only): {periods.find((p) => p.held)?.note}</p>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5 pl-6">
              {periods.map((p) => (
                <li key={p.academic_period_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {p.period_name}:{" "}
                    <span className="font-mono tabular-nums">{formatMoney(p.outstanding)}</span> owed
                  </span>
                  {manages && (
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
          )}
          {audience !== "staff" && (
            <p className="pl-6 text-xs text-muted-foreground">
              {held
                ? "Contact the school to find out more."
                : "They will appear here as soon as the balance is cleared. Contact the school if you have already paid."}
            </p>
          )}
        </div>
      )}

      {manages && <ResultHoldControl studentId={studentId} schoolId={schoolId!} onChanged={refresh} />}
    </div>
  );
}

/**
 * Holding one pupil's results by hand, for a reason of the school's own. It
 * applies whatever the fee position, and a payment-plan release does not lift
 * it. The reason stays with staff; the family sees only the message.
 */
function ResultHoldControl({ studentId, schoolId, onChanged }: { studentId: string; schoolId: string; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  const { data: hold, isLoading } = useQuery({
    queryKey: ["result-hold", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("result_holds").select("id, reason, family_message").eq("student_id", studentId).maybeSingle();
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (place: boolean) => {
      const { error } = place
        ? await supabase.from("result_holds").insert({
            school_id: schoolId,
            student_id: studentId,
            reason: reason.trim(),
            family_message: message.trim() || null,
          })
        : await supabase.from("result_holds").delete().eq("student_id", studentId);
      if (error) throw error;
    },
    onSuccess: (_, place) => {
      toast.success(place ? "Results held" : "Hold lifted");
      setReason("");
      setMessage("");
      onChanged();
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not change the hold")),
  });

  if (isLoading) return null;

  if (hold) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
        <span className="text-muted-foreground">Held by hand: {hold.reason}</span>
        <Button size="sm" variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
          Lift hold
        </Button>
      </div>
    );
  }

  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Hold this pupil's results</summary>
      <div className="mt-3 space-y-2">
        <Input
          placeholder="Reason, for staff only (e.g. library books not returned)"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Input
          placeholder="What the family sees (optional)"
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={() => save.mutate(true)} disabled={save.isPending || !reason.trim()}>
          {save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Hold results
        </Button>
      </div>
    </details>
  );
}
