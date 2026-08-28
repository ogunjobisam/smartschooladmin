import { CalendarPlus, Download, ExternalLink, Rss } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadIcs, googleCalendarUrl, type IcsEvent } from "@/lib/ics";

/** Public, subscribable feed for a school — the same URL a calendar app polls. */
export function eventsFeedUrl(slug: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const origin = base || (projectId ? `https://${projectId}.supabase.co` : "");
  return `${origin}/functions/v1/events-ics?school=${encodeURIComponent(slug)}`;
}

/** "Add to calendar" for one event: download the .ics or open Google Calendar. */
export function AddToCalendarButton({ event, compact }: { event: IcsEvent; compact?: boolean }) {
  const fileName = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
          <CalendarPlus className="h-3 w-3" />
          {compact ? "Add" : "Add to calendar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadIcs([event], fileName, event.title)}>
          <Download className="mr-2 h-3.5 w-3.5" /> Download .ics
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Google Calendar
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Whole-calendar actions: a one-off download of what is coming up, or a
 * subscription URL that keeps updating as the school adds events.
 */
export function SubscribeCalendarButton({
  events,
  calendarName,
  feedSlug,
}: {
  events: IcsEvent[];
  calendarName: string;
  feedSlug?: string | null;
}) {
  const feed = feedSlug ? eventsFeedUrl(feedSlug) : null;

  const copyFeed = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Calendar link copied — paste it into your calendar app");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CalendarPlus className="h-4 w-4" /> Add to calendar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          One-off download
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => downloadIcs(events, "school-events", calendarName)}
          disabled={events.length === 0}
        >
          <Download className="mr-2 h-3.5 w-3.5" /> Download upcoming events
        </DropdownMenuItem>
        {feed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Keep in sync
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => copyFeed(feed)}>
              <Rss className="mr-2 h-3.5 w-3.5" /> Copy subscription link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={feed.replace(/^https?:/, "webcal:")}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Subscribe in calendar app
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
