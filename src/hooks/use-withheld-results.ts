import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface WithheldPeriod {
  academic_period_id: string;
  period_name: string;
  outstanding: number;
}

/**
 * The terms whose results a pupil's family cannot see until fees are paid.
 *
 * Row-level security already hides the scores; this only explains the gap.
 * Without it a withheld term looks like a term with no results, and the school
 * office gets the call. Empty for anyone not entitled to know what the family
 * owes, which the database decides.
 */
export function useWithheldResults(studentId: string | null | undefined) {
  return useQuery({
    queryKey: ["withheld-results", studentId],
    queryFn: async (): Promise<WithheldPeriod[]> => {
      const { data, error } = await supabase.rpc("withheld_results", { _student_id: studentId! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
  });
}
