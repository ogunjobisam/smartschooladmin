import { useQuery } from "@tanstack/react-query";
import { Bus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";

interface TransportRiderCardProps {
  /** The students whose bus arrangements to show — one for a student, several for a parent. */
  studentIds: string[];
  /** Names by student id, so a parent with two children can tell them apart. */
  nameById?: Record<string, string>;
}

/**
 * Read-only view of a rider's route, stop and pickup time. Row-level security
 * already limits this to the family concerned, so no extra filtering here.
 */
export function TransportRiderCard({ studentIds, nameById }: TransportRiderCardProps) {
  const key = [...studentIds].sort().join(",");
  const { formatMoney } = useCurrency();

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["transport-rider", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_transport")
        .select("id, student_id, fee_override, transport_routes(name, driver_name, driver_phone), transport_stops(name, pickup_time, dropoff_time)")
        .in("student_id", studentIds);
      if (error) throw error;
      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  // A family that does not use the bus should not see an empty transport card.
  if (isLoading || assignments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Bus className="h-4 w-4" /> School bus</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.map((a) => {
          const name = nameById?.[a.student_id];
          const stop = a.transport_stops;
          return (
            <div key={a.id} className="space-y-0.5 text-sm">
              {name && <p className="text-xs font-medium text-muted-foreground">{name}</p>}
              <p className="font-medium">{a.transport_routes?.name || "Route"}</p>
              <p className="text-muted-foreground">
                {stop?.name ? `Stop: ${stop.name}` : "No stop set"}
                {stop?.pickup_time ? ` · pickup ${stop.pickup_time.slice(0, 5)}` : ""}
                {stop?.dropoff_time ? ` · drop-off ${stop.dropoff_time.slice(0, 5)}` : ""}
              </p>
              {a.transport_routes?.driver_name && (
                <p className="text-muted-foreground">
                  Driver: {a.transport_routes.driver_name}
                  {a.transport_routes.driver_phone ? ` · ${a.transport_routes.driver_phone}` : ""}
                </p>
              )}
              {a.fee_override != null && (
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatMoney(a.fee_override)}/term
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
