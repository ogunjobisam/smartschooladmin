import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import type { Enums } from "@/integrations/supabase/types";

type RsvpStatus = Enums<"event_rsvp_status">;

const OPTIONS: { value: RsvpStatus; label: string; icon: typeof Check }[] = [
  { value: "going", label: "Going", icon: Check },
  { value: "maybe", label: "Maybe", icon: HelpCircle },
  { value: "not_going", label: "Can't make it", icon: X },
];

const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal"];

/**
 * Attendance response for one event, answered straight from the card.
 *
 * One row per person per event, scoped to the event's organisation and school
 * so responses never cross a tenant boundary. School managers additionally see
 * the tally, which is the point of collecting them.
 */
export function EventRsvp({
  eventId,
  eventSchoolId,
  compact = false,
}: {
  eventId: string;
  eventSchoolId?: string | null;
  compact?: boolean;
}) {
  const { user, orgId, schoolId, userRole } = useAuth();
  const queryClient = useQueryClient();
  const canSeeTally = MANAGER_ROLES.includes(userRole || "");

  const { data: rows = [] } = useQuery({
    queryKey: ["event-rsvps", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_rsvps")
        .select("id, user_id, status")
        .eq("event_id", eventId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId && !!user,
  });

  const mine = rows.find((r) => r.user_id === user?.id);

  const respond = useMutation({
    mutationFn: async (status: RsvpStatus) => {
      if (!user || !orgId) throw new Error("Please sign in again");
      const { error } = await supabase.from("event_rsvps").upsert(
        {
          event_id: eventId,
          org_id: orgId,
          school_id: eventSchoolId ?? schoolId ?? null,
          user_id: user.id,
          status,
        },
        { onConflict: "event_id,user_id" },
      );
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      toast.success(
        status === "going" ? "Marked as going" : status === "maybe" ? "Marked as maybe" : "Marked as not attending",
      );
      queryClient.invalidateQueries({ queryKey: ["event-rsvps", eventId] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not save your response")),
  });

  const count = (status: RsvpStatus) => rows.filter((r) => r.status === status).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact && <span className="text-xs text-muted-foreground">Are you coming?</span>}
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = mine?.status === option.value;
        return (
          <Button
            key={option.value}
            size="sm"
            variant={active ? "default" : "outline"}
            className="h-7 gap-1 px-2 text-xs"
            disabled={respond.isPending}
            onClick={() => respond.mutate(option.value)}
          >
            {respond.isPending && respond.variables === option.value ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            {option.label}
          </Button>
        );
      })}
      {canSeeTally && rows.length > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          {count("going")} going · {count("maybe")} maybe · {count("not_going")} no
        </Badge>
      )}
    </div>
  );
}
