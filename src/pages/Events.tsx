import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, parseISO } from "date-fns";
import { CalendarDays, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import type { Enums } from "@/integrations/supabase/types";

type Audience = Enums<"event_audience">;

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "staff", label: "Staff only" },
  { value: "parents", label: "Parents" },
  { value: "students", label: "Students" },
];

const audienceLabel = (a: Audience) => AUDIENCES.find((x) => x.value === a)?.label ?? a;

const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal"];

export default function Events() {
  const { orgId, schoolId, user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const canManage = MANAGER_ROLES.includes(userRole || "");

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [audience, setAudience] = useState<Audience>("all");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["school-events", orgId, schoolId],
    queryFn: async () => {
      // This school's events plus the group-wide ones. Row-level security
      // enforces the same rule; without the filter a group admin, who is not
      // tied to one school, would see every school's calendar at once.
      const { data, error } = await supabase
        .from("school_events")
        .select("*")
        .eq("org_id", orgId!)
        .or(`school_id.eq.${schoolId},school_id.is.null`)
        .order("starts_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId && !!schoolId,
  });

  // Past events stay visible but out of the way — a calendar that hides last
  // term's speech day is less useful than one that keeps it.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcoming = events.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= now);
    const past = events
      .filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() < now)
      .reverse();
    return { upcoming, past };
  }, [events]);

  const reset = () => {
    setTitle(""); setDescription(""); setLocation("");
    setStartsAt(""); setEndsAt(""); setAllDay(false); setAudience("all");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organisation");
      if (!title.trim()) throw new Error("Give the event a title");
      if (!startsAt) throw new Error("Choose when it starts");
      if (endsAt && endsAt < startsAt) throw new Error("The end cannot be before the start");

      const { error } = await supabase.from("school_events").insert({
        org_id: orgId,
        school_id: schoolId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        all_day: allDay,
        audience,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event added");
      queryClient.invalidateQueries({ queryKey: ["school-events"] });
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not add the event")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event removed");
      queryClient.invalidateQueries({ queryKey: ["school-events"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not remove the event")),
  });

  const when = (event: (typeof events)[number]) => {
    const start = parseISO(event.starts_at);
    if (event.all_day) {
      if (!event.ends_at || isSameDay(start, parseISO(event.ends_at))) {
        return format(start, "EEEE d MMMM yyyy");
      }
      return `${format(start, "d MMM")} – ${format(parseISO(event.ends_at), "d MMM yyyy")}`;
    }
    const startText = format(start, "EEE d MMM yyyy, HH:mm");
    if (!event.ends_at) return startText;
    const end = parseISO(event.ends_at);
    return isSameDay(start, end)
      ? `${startText} – ${format(end, "HH:mm")}`
      : `${startText} – ${format(end, "EEE d MMM yyyy, HH:mm")}`;
  };

  const EventRow = ({ event, muted }: { event: (typeof events)[number]; muted?: boolean }) => (
    <Card className={muted ? "opacity-70" : undefined}>
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border bg-muted/50">
            <span className="text-[10px] uppercase text-muted-foreground">
              {format(parseISO(event.starts_at), "MMM")}
            </span>
            <span className="font-mono text-sm font-semibold leading-none tabular-nums">
              {format(parseISO(event.starts_at), "d")}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{event.title}</p>
              {event.audience !== "all" && (
                <Badge variant="outline" className="text-[10px]">{audienceLabel(event.audience)}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{when(event)}</p>
            {event.location && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {event.location}
              </p>
            )}
            {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
          </div>
        </div>

        {canManage && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove &ldquo;{event.title}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  It will disappear from everyone's calendar. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => remove.mutate(event.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Events" description="Term dates, exams, meetings and everything else on the school calendar.">
        {canManage && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Event</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add an event</DialogTitle>
                <DialogDescription>
                  Everyone in the audience you choose will see it on their calendar.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="event-title">Title</Label>
                  <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Inter-House Sports" />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(v === true)} />
                  All day
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-start">Starts</Label>
                    <Input
                      id="event-start"
                      type={allDay ? "date" : "datetime-local"}
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-end">Ends <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      id="event-end"
                      type={allDay ? "date" : "datetime-local"}
                      value={endsAt}
                      min={startsAt || undefined}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="event-location">Location <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main Hall" />
                </div>

                <div className="space-y-1.5">
                  <Label>Who sees it</Label>
                  <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="event-description">Details <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea id="event-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-1.5">
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add event
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on the calendar yet"
          description="Add term dates, exams, sports days and parent meetings so everyone can see what is coming."
          {...(canManage ? { actionLabel: "Add an event", onAction: () => setOpen(true) } : {})}
        />
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Coming up</h2>
            {upcoming.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nothing coming up.
              </p>
            ) : (
              upcoming.map((event) => <EventRow key={event.id} event={event} />)
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Past</h2>
              {past.map((event) => <EventRow key={event.id} event={event} muted />)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
