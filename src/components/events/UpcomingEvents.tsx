import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The next few events, for a portal front page.
 *
 * Row-level security already filters by audience, so this asks for everything
 * upcoming and shows what comes back.
 */
export function UpcomingEvents({ limit = 4 }: { limit?: number }) {
  const { orgId } = useAuth();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["upcoming-events", orgId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_events")
        .select("id, title, location, starts_at, all_day")
        .eq("org_id", orgId!)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-accent" /> Coming up
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs text-accent" asChild>
          <Link to="/events">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-3 px-6 py-3">
            <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md border bg-muted/50">
              <span className="text-[9px] uppercase text-muted-foreground">
                {format(parseISO(event.starts_at), "MMM")}
              </span>
              <span className="font-mono text-sm font-semibold leading-none tabular-nums">
                {format(parseISO(event.starts_at), "d")}
              </span>
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.all_day
                  ? format(parseISO(event.starts_at), "EEEE")
                  : format(parseISO(event.starts_at), "EEEE, HH:mm")}
                {event.location && (
                  <span className="inline-flex items-center gap-1">
                    {" · "}<MapPin className="h-3 w-3" />{event.location}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
