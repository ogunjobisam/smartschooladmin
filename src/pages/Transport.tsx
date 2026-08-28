import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, Loader2, MapPin, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";

const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal", "bursar"];

export default function Transport() {
  const { schoolId, userRole } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const canManage = MANAGER_ROLES.includes(userRole || "");

  const [routeOpen, setRouteOpen] = useState(false);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [capacity, setCapacity] = useState("");

  const [stopFor, setStopFor] = useState<string | null>(null);
  const [stopName, setStopName] = useState("");
  const [pickupTime, setPickupTime] = useState("");

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ["transport-routes", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_routes")
        .select("*, transport_stops(id, name, stop_order, pickup_time), student_transport(id)")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const riders = routes.reduce((sum, r) => sum + (r.student_transport?.length ?? 0), 0);
  const termRevenue = routes.reduce(
    (sum, r) => sum + (r.student_transport?.length ?? 0) * (r.fee_per_term || 0),
    0
  );

  const resetRoute = () => {
    setName(""); setFee(""); setDriverName(""); setDriverPhone(""); setVehicle(""); setCapacity("");
  };

  const createRoute = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("No school selected");
      if (!name.trim()) throw new Error("Give the route a name");
      const parsedFee = fee.trim() === "" ? 0 : Number(fee.replace(/,/g, ""));
      if (!Number.isFinite(parsedFee) || parsedFee < 0) throw new Error("Enter a valid termly fee");

      const { error } = await supabase.from("transport_routes").insert({
        school_id: schoolId,
        name: name.trim(),
        fee_per_term: Math.round(parsedFee),
        driver_name: driverName.trim() || null,
        driver_phone: driverPhone.trim() || null,
        vehicle_registration: vehicle.trim() || null,
        capacity: capacity.trim() ? Number(capacity) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Route added");
      queryClient.invalidateQueries({ queryKey: ["transport-routes"] });
      setRouteOpen(false);
      resetRoute();
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not add the route")),
  });

  const addStop = useMutation({
    mutationFn: async (routeId: string) => {
      if (!stopName.trim()) throw new Error("Give the stop a name");
      const route = routes.find((r) => r.id === routeId);
      const nextOrder = (route?.transport_stops?.length ?? 0) + 1;

      const { error } = await supabase.from("transport_stops").insert({
        route_id: routeId,
        name: stopName.trim(),
        stop_order: nextOrder,
        pickup_time: pickupTime || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stop added");
      queryClient.invalidateQueries({ queryKey: ["transport-routes"] });
      setStopFor(null); setStopName(""); setPickupTime("");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not add the stop")),
  });

  const removeRoute = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transport_routes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Route removed");
      queryClient.invalidateQueries({ queryKey: ["transport-routes"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not remove the route")),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Transport" description="Bus routes, stops and who rides them.">
        {canManage && (
          <Dialog open={routeOpen} onOpenChange={(v) => { setRouteOpen(v); if (!v) resetRoute(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Route</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add a route</DialogTitle>
                <DialogDescription>
                  The termly fee is charged to each student assigned to this route, unless
                  their assignment overrides it.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="route-name">Route name</Label>
                  <Input id="route-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Owode Ede – Main Gate" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="route-fee">Fee per term</Label>
                  <Input id="route-fee" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="route-capacity">Capacity <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="route-capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="route-driver">Driver</Label>
                  <Input id="route-driver" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="route-phone">Driver phone</Label>
                  <Input id="route-phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="route-vehicle">Vehicle registration</Label>
                  <Input id="route-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setRouteOpen(false)}>Cancel</Button>
                <Button onClick={() => createRoute.mutate()} disabled={createRoute.isPending} className="gap-1.5">
                  {createRoute.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add route
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : routes.length === 0 ? (
        <EmptyState
          icon={Bus}
          title="No routes yet"
          description="Add the routes your buses run, their stops, and the termly fee for riding them."
          {...(canManage ? { actionLabel: "Add a route", onAction: () => setRouteOpen(true) } : {})}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Routes" value={routes.length.toString()} icon={Bus} />
            <StatCard title="Students riding" value={riders.toString()} icon={Users} />
            <StatCard title="Transport per term" value={formatMoney(termRevenue)} icon={MapPin} mono subtitle="At current assignments" />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Routes</CardTitle></CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {routes.map((route) => {
                  const stops = [...(route.transport_stops ?? [])].sort((a, b) => a.stop_order - b.stop_order);
                  const riderCount = route.student_transport?.length ?? 0;
                  const overCapacity = route.capacity != null && riderCount > route.capacity;

                  return (
                    <AccordionItem key={route.id} value={route.id}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pr-3 text-left">
                          <span className="font-medium">{route.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {riderCount} {riderCount === 1 ? "rider" : "riders"}
                            {route.capacity != null && ` / ${route.capacity}`}
                          </Badge>
                          {overCapacity && (
                            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
                              Over capacity
                            </Badge>
                          )}
                          <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                            {formatMoney(route.fee_per_term)}/term
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4">
                        <div className="grid gap-2 text-sm sm:grid-cols-3">
                          <div><span className="text-muted-foreground">Driver: </span>{route.driver_name || "—"}</div>
                          <div><span className="text-muted-foreground">Phone: </span>{route.driver_phone || "—"}</div>
                          <div><span className="text-muted-foreground">Vehicle: </span>{route.vehicle_registration || "—"}</div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stops</p>
                          {stops.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No stops on this route yet.</p>
                          ) : (
                            <ol className="space-y-1.5">
                              {stops.map((stop, i) => (
                                <li key={stop.id} className="flex items-center gap-3 text-sm">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px]">
                                    {i + 1}
                                  </span>
                                  <span>{stop.name}</span>
                                  {stop.pickup_time && (
                                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                      {stop.pickup_time.slice(0, 5)}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>

                        {canManage && (
                          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                            {stopFor === route.id ? (
                              <>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`stop-${route.id}`} className="text-xs">Stop name</Label>
                                  <Input
                                    id={`stop-${route.id}`}
                                    className="h-8 w-48 text-sm"
                                    value={stopName}
                                    onChange={(e) => setStopName(e.target.value)}
                                    placeholder="e.g. Orisunbare Junction"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor={`pickup-${route.id}`} className="text-xs">Pickup</Label>
                                  <Input
                                    id={`pickup-${route.id}`}
                                    type="time"
                                    className="h-8 w-32 text-sm"
                                    value={pickupTime}
                                    onChange={(e) => setPickupTime(e.target.value)}
                                  />
                                </div>
                                <Button size="sm" onClick={() => addStop.mutate(route.id)} disabled={addStop.isPending}>
                                  Add
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setStopFor(null); setStopName(""); setPickupTime(""); }}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setStopFor(route.id)}>
                                <Plus className="h-3.5 w-3.5" /> Add stop
                              </Button>
                            )}

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" /> Remove route
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove &ldquo;{route.name}&rdquo;?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Its stops and the {riderCount} student
                                    {riderCount === 1 ? "" : "s"} assigned to it will be unassigned.
                                    This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeRoute.mutate(route.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
