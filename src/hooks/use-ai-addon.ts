import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AiEntitlement {
  enabled: boolean;
  used: number;
  monthlyLimit: number;
  remaining: number;
  /** True when the org bought the paid add-on (rather than the free monthly allowance). */
  hasAddon: boolean;
}

const DISABLED: AiEntitlement = {
  enabled: false,
  used: 0,
  monthlyLimit: 0,
  remaining: 0,
  hasAddon: false,
};

/**
 * Whether this organisation has the paid AI add-on, and how much of its monthly
 * allowance is left. Read through a SECURITY DEFINER function so the UI does not
 * need read access to the whole organisation row.
 */
export function useAiAddon() {
  const { orgId } = useAuth();

  const query = useQuery({
    queryKey: ["ai-entitlement", orgId],
    queryFn: async (): Promise<AiEntitlement> => {
      const { data, error } = await supabase.rpc("my_ai_entitlement");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return DISABLED;
      const used = row.used ?? 0;
      const monthlyLimit = row.monthly_limit ?? 0;
      return {
        enabled: !!row.enabled,
        used,
        monthlyLimit,
        remaining: Math.max(0, monthlyLimit - used),
      };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return { entitlement: query.data ?? DISABLED, isLoading: query.isLoading, refetch: query.refetch };
}
