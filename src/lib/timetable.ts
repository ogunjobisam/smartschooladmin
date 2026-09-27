/**
 * Shared timetable helpers.
 *
 * A timetable is a *weekly pattern* — one row per class, term, weekday and
 * period — plus one-off exceptions that cancel or move a single lesson on a
 * given date. Nothing is duplicated per week, so a term's schedule stays a
 * handful of rows and a change to the pattern is instantly visible everywhere.
 */

import { addDays, format, startOfWeek } from "date-fns";

/** ISO weekday numbers: 1 = Monday .. 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const DAY_SHORT: Record<number, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

export interface TimetablePeriod {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
  is_break: boolean;
}

export interface TimetableEntry {
  id: string;
  class_id: string;
  subject_id: string | null;
  staff_id: string | null;
  timetable_period_id: string;
  day_of_week: number;
  room: string | null;
  notes: string | null;
  academic_period_id: string;
  subjects?: { name: string } | null;
  staff?: { first_name: string; last_name: string } | null;
  classes?: { name: string } | null;
}

export interface TimetableException {
  id: string;
  entry_id: string;
  date: string;
  status: "cancelled" | "moved";
  new_date: string | null;
  new_timetable_period_id: string | null;
  new_staff_id: string | null;
  new_room: string | null;
  reason: string | null;
}

/** Monday of the week containing `date`. */
export function weekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** The calendar date a weekday column falls on for a given week. */
export function dateForDay(monday: Date, dayOfWeek: number): string {
  return format(addDays(monday, dayOfWeek - 1), "yyyy-MM-dd");
}

/** "08:00" from a Postgres time value such as "08:00:00". */
export function shortTime(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

export function periodLabel(p: TimetablePeriod): string {
  return `${p.name} · ${shortTime(p.start_time)}–${shortTime(p.end_time)}`;
}

export function entryTeacherName(entry: TimetableEntry): string | null {
  if (!entry.staff) return null;
  return `${entry.staff.first_name} ${entry.staff.last_name}`.trim();
}

/** What a single slot shows for one week, once exceptions are applied. */
export interface SlotLesson {
  entry: TimetableEntry;
  /** The date this lesson falls on in the week being viewed. */
  date: string;
  state: "normal" | "cancelled" | "moved-away" | "moved-here";
  exception?: TimetableException;
}

/**
 * Build a lookup of `periodId|dayOfWeek` -> lessons for the week starting at
 * `monday`, folding in cancellations and moves.
 */
export function buildWeekGrid(
  entries: TimetableEntry[],
  exceptions: TimetableException[],
  monday: Date
): Map<string, SlotLesson[]> {
  const grid = new Map<string, SlotLesson[]>();
  const push = (periodId: string, day: number, lesson: SlotLesson) => {
    const key = `${periodId}|${day}`;
    const list = grid.get(key) ?? [];
    list.push(lesson);
    grid.set(key, list);
  };

  const dayForDate = new Map<string, number>();
  for (const day of ALL_DAYS) dayForDate.set(dateForDay(monday, day), day);

  for (const entry of entries) {
    const date = dateForDay(monday, entry.day_of_week);
    const exception = exceptions.find((e) => e.entry_id === entry.id && e.date === date);

    if (!exception) {
      push(entry.timetable_period_id, entry.day_of_week, { entry, date, state: "normal" });
      continue;
    }

    if (exception.status === "cancelled") {
      push(entry.timetable_period_id, entry.day_of_week, { entry, date, state: "cancelled", exception });
      continue;
    }

    push(entry.timetable_period_id, entry.day_of_week, { entry, date, state: "moved-away", exception });

    const targetDate = exception.new_date ?? date;
    const targetDay = dayForDate.get(targetDate);
    const targetPeriod = exception.new_timetable_period_id ?? entry.timetable_period_id;
    if (targetDay) {
      push(targetPeriod, targetDay, { entry, date: targetDate, state: "moved-here", exception });
    }
  }

  return grid;
}

/** A sensible starting bell schedule for a school that has none yet. */
export const DEFAULT_PERIODS: Array<Omit<TimetablePeriod, "id">> = [
  { name: "Period 1", start_time: "08:00", end_time: "08:45", sort_order: 1, is_break: false },
  { name: "Period 2", start_time: "08:45", end_time: "09:30", sort_order: 2, is_break: false },
  { name: "Period 3", start_time: "09:30", end_time: "10:15", sort_order: 3, is_break: false },
  { name: "Break", start_time: "10:15", end_time: "10:35", sort_order: 4, is_break: true },
  { name: "Period 4", start_time: "10:35", end_time: "11:20", sort_order: 5, is_break: false },
  { name: "Period 5", start_time: "11:20", end_time: "12:05", sort_order: 6, is_break: false },
  { name: "Lunch", start_time: "12:05", end_time: "12:45", sort_order: 7, is_break: true },
  { name: "Period 6", start_time: "12:45", end_time: "13:30", sort_order: 8, is_break: false },
  { name: "Period 7", start_time: "13:30", end_time: "14:15", sort_order: 9, is_break: false },
];
