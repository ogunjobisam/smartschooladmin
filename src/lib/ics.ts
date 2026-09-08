/**
 * iCalendar (ICS) generation for school events.
 *
 * Written by hand rather than with a library: the format needed here is a
 * handful of fields, and every calendar app (Google, Apple, Outlook) reads it.
 */

export interface IcsEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean | null;
}

const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const stamp = (date: Date) => `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
const dateOnly = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");

/** Lines longer than 75 octets must be folded, or strict parsers reject the file. */
const fold = (line: string) => {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  parts.push(rest);
  return parts.join("\r\n ");
};

export function buildIcs(events: IcsEvent[], calendarName = "School Events"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartSchoolAdmin//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Tells subscribing clients how often to look for changes.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const event of events) {
    const start = new Date(event.starts_at);
    const end = event.ends_at
      ? new Date(event.ends_at)
      : new Date(start.getTime() + (event.all_day ? 24 : 1) * 60 * 60 * 1000);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}@smartschooladmin`);
    lines.push(`DTSTAMP:${stamp(new Date())}`);
    if (event.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`);
      // All-day DTEND is exclusive, so a one-day event ends the following day.
      lines.push(`DTEND;VALUE=DATE:${dateOnly(new Date(end.getTime() + 24 * 60 * 60 * 1000))}`);
    } else {
      lines.push(`DTSTART:${stamp(start)}`);
      lines.push(`DTEND:${stamp(end)}`);
    }
    lines.push(fold(`SUMMARY:${escapeText(event.title)}`));
    if (event.location) lines.push(fold(`LOCATION:${escapeText(event.location)}`));
    if (event.description) lines.push(fold(`DESCRIPTION:${escapeText(event.description)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(events: IcsEvent[], fileName: string, calendarName?: string) {
  const blob = new Blob([buildIcs(events, calendarName)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".ics") ? fileName : `${fileName}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A "one click" alternative for people who live in Google Calendar. */
export function googleCalendarUrl(event: IcsEvent): string {
  const start = new Date(event.starts_at);
  const end = event.ends_at
    ? new Date(event.ends_at)
    : new Date(start.getTime() + (event.all_day ? 24 : 1) * 60 * 60 * 1000);
  const dates = event.all_day
    ? `${dateOnly(start)}/${dateOnly(new Date(end.getTime() + 24 * 60 * 60 * 1000))}`
    : `${stamp(start)}/${stamp(end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
    ...(event.description ? { details: event.description } : {}),
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
