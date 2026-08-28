import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";

const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar"];

/** Sentinel for the "not riding" option — Radix Select rejects an empty value. */
const NO_ROUTE = "__none__";
const NO_STOP = "__none__";

interface StudentTransportCardProps {
  studentId: string;
  schoolId: string | null;
}

export function StudentTransportCard({ studentId, schoolId }: StudentTransportCardProps) {
  const { userRole } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const canManage = MANAGER_ROLES.includes(userRole || "");

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ["transport-routes-picker", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_routes")
        .select("id, name, fee_per_term, driver_name, driver_phone, transport_stops(id, name, stop_order, pickup_time)")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: period } = useQuery({
    queryKey: ["current-period-transport"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_periods")
        .select("id, name")
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: assignment, isLoading: assignmentLoading } = useQuery({
    queryKey: ["student-transport", studentId, period?.id ?? null],
    queryFn: async () => {
      let query = supabase
        .from("student_transport")
        .select("id, route_id, stop_id, fee_override")
        .eq("student_id", studentId);
      query = period?.id ? query.eq("academic_period_id", period.id) : query.is("academic_period_id", null);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const [routeId, setRouteId] = useState<string>(NO_ROUTE);
  const [stopId, setStopId] = useState<string>(NO_STOP);
  const [feeOverride, setFeeOverride] = useState("");

  // Seed the form from the saved assignment once it arrives, and again whenever
  // it changes underneath us (a save, or switching student).
  useEffect(() => {
    setRouteId(assignment?.route_id ?? NO_ROUTE);
    setStopId(assignment?.stop_id ?? NO_STOP);
    setFeeOverride(assignment?.fee_override != null ? String(assignment.fee_override) : "");
  }, [assignment?.route_id, assignment?.stop_id, assignment?.fee_override]);

  const selectedRoute = routes.find((r) => r.id === routeId);
  const stops = [...(selectedRoute?.transport_stops ?? [])].sort((a, b) => a.stop_order - b.stop_order);
  const effectiveFee = feeOverride.trim() !== ""
    ? Number(feeOverride.replace(/,/g, ""))
    : selectedRoute?.fee_per_term ?? 0;

  const save = useMutation({
    mutationFn: async () => {
      if (routeId === NO_ROUTE) {
        if (!assignment) return;
        const { error } = await supabase.from("student_transport").delete().eq("id", assignment.id);
        if (error) throw error;
        return;
      }

      let override: number | null = null;
      if (feeOverride.trim() !== "") {
        const parsed = Number(feeOverride.replace(/,/g, ""));
        if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Enter a valid fee, or leave it blank to use the route fee");
        override = Math.round(parsed);
      }

      const row = {
        student_id: studentId,
        route_id: routeId,
        stop_id: stopId === NO_STOP ? null : stopId,
        academic_period_id: period?.id ?? null,
        fee_override: override,
      };

      const { error } = assignment
        ? await supabase.from("student_transport").update(row).eq("id", assignment.id)
        : await supabase.from("student_transport").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(routeId === NO_ROUTE ? "Removed from transport" : "Transport saved");
      queryClient.invalidateQueries({ queryKey: ["student-transport"] });
      queryClient.invalidateQueries({ queryKey: ["transport-routes"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not save the transport assignment")),
  });

  if (routesLoading || assignmentLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const assignedRoute = routes.find((r) => r.id === assignment?.route_id);

  // Nothing to assign to, and no staff rights to fix that.
  if (routes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Bus className="h-4 w-4" /> Transport</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No bus routes have been set up yet.{canManage ? " Add them under Transport, then come back to assign a route." : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Bus className="h-4 w-4" /> Transport</CardTitle>
        <CardDescription>
          {period?.name ? `For ${period.name}.` : "No current term is set, so this applies until one is."}{" "}
          The fee below is what transport adds to this student&rsquo;s bill each term.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage ? (
          assignment && assignedRoute ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{assignedRoute.name}</p>
              <p className="text-muted-foreground">
                {stops.find((s) => s.id === assignment.stop_id)?.name || "No stop set"} ·{" "}
                {formatMoney(assignment.fee_override ?? assignedRoute.fee_per_term)}/term
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not riding the school bus.</p>
          )
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Route</Label>
                <Select value={routeId} onValueChange={(v) => { setRouteId(v); setStopId(NO_STOP); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROUTE}>Not riding</SelectItem>
                    {routes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Stop</Label>
                <Select value={stopId} onValueChange={setStopId} disabled={routeId === NO_ROUTE || stops.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={stops.length === 0 ? "No stops on this route" : "Pick a stop"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STOP}>No stop set</SelectItem>
                    {stops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.pickup_time ? ` · ${s.pickup_time.slice(0, 5)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fee-override">Fee override</Label>
                <Input
                  id="fee-override"
                  inputMode="numeric"
                  value={feeOverride}
                  onChange={(e) => setFeeOverride(e.target.value)}
                  disabled={routeId === NO_ROUTE}
                  placeholder={selectedRoute ? String(selectedRoute.fee_per_term) : "0"}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {routeId !== NO_ROUTE && (
                <Badge variant="outline" className="font-mono text-xs tabular-nums">
                  {formatMoney(Number.isFinite(effectiveFee) ? effectiveFee : 0)}/term
                </Badge>
              )}
              {selectedRoute?.driver_name && (
                <span className="text-xs text-muted-foreground">
                  Driver: {selectedRoute.driver_name}
                  {selectedRoute.driver_phone ? ` · ${selectedRoute.driver_phone}` : ""}
                </span>
              )}
              <Button size="sm" className="ml-auto gap-1.5" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save transport
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
