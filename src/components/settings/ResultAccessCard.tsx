import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";

interface ResultAccessCardProps {
  schoolId: string | null;
  canManage: boolean;
}

/**
 * The switch that holds back report cards until fees are paid. Enforced by
 * row-level security on student_scores; this only flips the school's setting.
 */
export function ResultAccessCard({ schoolId, canManage }: ResultAccessCardProps) {
  const queryClient = useQueryClient();

  const { data: school, isLoading } = useQuery({
    queryKey: ["school-result-access", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, withhold_results_until_paid, withhold_overdue_only")
        .eq("id", schoolId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  type Change = { withhold_results_until_paid: boolean } | { withhold_overdue_only: boolean };

  const save = useMutation({
    mutationFn: async (change: Change) => {
      // .select() so a write that row-level security quietly blocked shows up
      // as zero rows instead of a false "saved".
      const { data, error } = await supabase
        .from("schools")
        .update(change)
        .eq("id", schoolId!)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You do not have permission to change this setting");
    },
    onSuccess: (_, change) => {
      toast.success(
        "withhold_overdue_only" in change
          ? change.withhold_overdue_only
            ? "Only overdue bills will hold back results"
            : "Every unpaid bill will hold back results"
          : change.withhold_results_until_paid
            ? "Results will be held until fees are paid"
            : "Results are visible to all families"
      );
      queryClient.invalidateQueries({ queryKey: ["school-result-access"] });
      queryClient.invalidateQueries({ queryKey: ["withheld-results"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not save the setting")),
  });

  if (!schoolId) return null;
  if (isLoading || !school) return <Skeleton className="h-32 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" /> Results and fees
        </CardTitle>
        <CardDescription>
          Hold back a term's results from pupils and parents until that term's fees, and any
          earlier term's, are paid.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Withhold results until fees are paid</p>
            <p className="text-xs text-muted-foreground">
              Families see how much is outstanding instead of their results. Staff still see
              everything, and can release one pupil's results for a term from the pupil's Grades tab.
            </p>
          </div>
          <Switch
            checked={school.withhold_results_until_paid}
            disabled={!canManage || save.isPending}
            onCheckedChange={(checked) => save.mutate({ withhold_results_until_paid: checked })}
          />
        </div>
        {school.withhold_results_until_paid && (
          <div className="mt-3 flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Only count bills that are overdue</p>
              <p className="text-xs text-muted-foreground">
                A bill does not hold back results until its due date has passed, so releasing reports
                the week fees go out does not hide every child's. Bills with no due date always count.
              </p>
            </div>
            <Switch
              checked={school.withhold_overdue_only}
              disabled={!canManage || save.isPending}
              onCheckedChange={(checked) => save.mutate({ withhold_overdue_only: checked })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
