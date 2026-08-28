import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public iCalendar feed of a school's events, so anyone can subscribe from
 * their own calendar app.
 *
 * Only events for everyone (`audience = 'all'`) are published: staff-only and
 * class-specific items stay behind the login. The school is addressed by its
 * public admissions slug, never by an internal id.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const stamp = (date: Date) => `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
const dateOnly = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("school") || "").trim().toLowerCase();
    if (!slug) {
      return new Response("Missing school", { status: 400, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: school } = await admin
      .from("schools")
      .select("id, name, org_id")
      .eq("admissions_slug", slug)
      .maybeSingle();

    if (!school) {
      return new Response("Unknown school", { status: 404, headers: corsHeaders });
    }

    // A rolling window: everything from a month ago onwards, so a subscriber
    // keeps recent history without the feed growing without bound.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events } = await admin
      .from("school_events")
      .select("id, title, description, location, starts_at, ends_at, all_day")
      .eq("org_id", school.org_id)
      .or(`school_id.eq.${school.id},school_id.is.null`)
      .eq("audience", "all")
      .gte("starts_at", since)
      .order("starts_at")
      .limit(500);

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SmartSchool Admin//Events//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(school.name)}`,
      "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
      "X-PUBLISHED-TTL:PT12H",
    ];

    for (const event of events || []) {
      const start = new Date(event.starts_at);
      const end = event.ends_at
        ? new Date(event.ends_at)
        : new Date(start.getTime() + (event.all_day ? 24 : 1) * 60 * 60 * 1000);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${event.id}@smartschooladmin`);
      lines.push(`DTSTAMP:${stamp(new Date())}`);
      if (event.all_day) {
        lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`);
        lines.push(`DTEND;VALUE=DATE:${dateOnly(new Date(end.getTime() + 24 * 60 * 60 * 1000))}`);
      } else {
        lines.push(`DTSTART:${stamp(start)}`);
        lines.push(`DTEND:${stamp(end)}`);
      }
      lines.push(`SUMMARY:${escapeText(event.title)}`);
      if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
      if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${slug}-events.ics"`,
        "Cache-Control": "public, max-age=1800",
      },
    });
  } catch (err) {
    console.error("events-ics error:", err);
    return new Response("Could not build the calendar", { status: 500, headers: corsHeaders });
  }
});
