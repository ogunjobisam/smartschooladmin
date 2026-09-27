import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tells a family why their child's results are not showing. Row-level security
 * already hides the marks while a pupil owes more than the school allows or is
 * on a hold; without this the results would simply be missing, with nothing to
 * say why or who to ask.
 */
export function WithheldNotice({ studentId, name }: { studentId: string; name?: string }) {
  const { data: message } = useQuery({
    queryKey: ["withheld-notice", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("withheld_notice", { _student_id: studentId });
      if (error) throw error;
      return data ?? null;
    },
  });

  if (!message) return null;

  return (
    <Card className="border-warning">
      <CardContent className="flex items-start gap-3 py-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{name ? `${name}'s results are withheld` : "Results are withheld"}</p>
          <p className="text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
