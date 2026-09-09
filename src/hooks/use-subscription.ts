import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Subscription {
  planCode: string;
  planName: string;
  pricePerStudentTerm: number;
  studentLimit: number | null;
  aiEnabled: boolean;
  payrollEnabled: boolean;
  multiSchool: boolean;
  storageLimitMb: number;
  status: string;
  smsBalance: number;
  studentCount: number;
  currentPeriodId: string | null;
}

const EMPTY: Subscription = {
  planCode: "free",
  planName: "Free",
  pricePerStudentTerm: 0,
  studentLimit: 50,
  aiEnabled: false,
  payrollEnabled: false,
  multiSchool: false,
  storageLimitMb: 512,
  status: "active",
  smsBalance: 0,
  studentCount: 0,
  currentPeriodId: null,
};

/**
 * The signed-in organisation's billing plan, SMS credit balance and current
 * billable student count — all read through one SECURITY DEFINER function so
 * the client needs no direct access to the subscription tables.
 */
export function useSubscription() {
  const { orgId } = useAuth();

  const query = useQuery({
    queryKey: ["my-subscription", orgId],
    queryFn: async (): Promise<Subscription> => {
      const { data, error } = await supabase.rpc("my_subscription");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return EMPTY;
      return {
        planCode: row.plan_code ?? "free",
        planName: row.plan_name ?? "Free",
        pricePerStudentTerm: Number(row.price_per_student_term ?? 0),
        studentLimit: row.student_limit ?? null,
        aiEnabled: !!row.ai_enabled,
        payrollEnabled: !!row.payroll_enabled,
        multiSchool: !!row.multi_school,
        storageLimitMb: row.storage_limit_mb ?? 512,
        status: row.status ?? "active",
        smsBalance: row.sms_balance ?? 0,
        studentCount: row.student_count ?? 0,
        currentPeriodId: row.current_period_id ?? null,
      };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return {
    subscription: query.data ?? EMPTY,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
