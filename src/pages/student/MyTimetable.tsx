import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, Printer } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { displayClassName } from "@/lib/sections";
import {
  ALL_DAYS, WEEKDAYS, buildWeekGrid, dateForDay, weekStart,
  type TimetableEntry, type TimetableException, type TimetablePeriod,
} from "@/lib/timetable";

/** A student's own weekly schedule, with this week's cancellations and moves. */
export default function MyTimetable() {
  const { user } = useAuth();
  const [monday, setMonday] = useState<Date>(() => weekStart(new Date()));

  const { data: enrolment, isLoading: enrolmentLoading } = useQuery({
    queryKey: ["my-timetable-enrolment", user?.id],
    queryFn: async () => {
      const { data: student } = await supabase
        .from("students")
        .select("id, school_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!student) return null;
      const { data } = await supabase
        .from("enrolments")
        .select("class_id, academic_period_id, classes(name), academic_periods(name, is_current, start_date)")
        .eq("student_id", student.id);
      const rows = data || [];
      const current = rows.find((r) => (r.academic_periods as { is_current?: boolean } | null)?.is_current);
      const chosen = current ?? rows[rows.length - 1];
      if (!chosen) return null;
      return {
        schoolId: student.school_id as string,
        classId: chosen.class_id as string,
        academicPeriodId: chosen.academic_period_id as string,
        className: (chosen.classes as { name: string } | null)?.name ?? "",
        termName: (chosen.academic_periods as { name: string } | null)?.name ?? "",
      };
    },
    enabled: !!user?.id,
  });

  const { data: bellPeriods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ["my-timetable-periods", enrolment?.schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_periods")
        .select("id, name, start_time, end_time, sort_order, is_break")
        .eq("school_id", enrolment!.schoolId)
        .order("sort_order");
      return (data || []) as TimetablePeriod[];
    },
    enabled: !!enrolment?.schoolId,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["my-timetable-entries", enrolment?.classId, enrolment?.academicPeriodId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_entries")
        .select("id, class_id, subject_id, staff_id, timetable_period_id, day_of_week, room, notes, academic_period_id, subjects(name), staff(first_name, last_name), classes(name)")
        .eq("class_id", enrolment!.classId)
        .eq("academic_period_id", enrolment!.academicPeriodId);
      return (data || []) as unknown as TimetableEntry[];
    },
    enabled: !!enrolment?.classId,
  });

  const weekBegin = dateForDay(monday, 1);
  const weekEnd = dateForDay(monday, 7);

  const { data: exceptions = [] } = useQuery({
    queryKey: ["my-timetable-exceptions", enrolment?.classId, weekBegin],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_exceptions")
        .select("id, entry_id, date, status, new_date, new_timetable_period_id, new_staff_id, new_room, reason")
        .or(`and(date.gte.${weekBegin},date.lte.${weekEnd}),and(new_date.gte.${weekBegin},new_date.lte.${weekEnd})`);
      return (data || []) as TimetableException[];
    },
    enabled: !!enrolment?.classId,
  });

  const grid = useMemo(() => buildWeekGrid(entries, exceptions, monday), [entries, exceptions, monday]);

  const usedDays = useMemo(() => {
    const days = new Set<number>(WEEKDAYS);
    for (const e of entries) days.add(e.day_of_week);
    return ALL_DAYS.filter((d) => days.has(d));
  }, [entries]);

  const changes = useMemo(
    () => exceptions.filter((ex) => entries.some((e) => e.id === ex.entry_id)),
    [exceptions, entries]
  );

  if (enrolmentLoading || periodsLoading || entriesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enrolment) {
    return (
      <div className="space-y-6">
        <PageHeader title="My timetable" description="Your weekly lessons." />
        <EmptyState
          icon={CalendarRange}
          title="No class yet"
          description="Once you are placed in a class your weekly lessons appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My timetable"
        description={`${displayClassName(enrolment.className)} · ${enrolment.termName} · ${format(monday, "d MMM")} – ${format(new Date(weekEnd), "d MMM yyyy")}`}
      >
        <Button variant="outline" size="icon" onClick={() => setMonday((m) => addWeeks(m, -1))} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonday(weekStart(new Date()))}>This week</Button>
        <Button variant="outline" size="icon" onClick={() => setMonday((m) => addWeeks(m, 1))} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </PageHeader>

      {bellPeriods.length === 0 || entries.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No lessons published yet"
          description="Your school has not published a timetable for your class this term."
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <TimetableGrid periods={bellPeriods} days={usedDays} monday={monday} grid={grid} />
          </CardContent>
        </Card>
      )}

      {changes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Changes this week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {changes.map((ex) => {
              const entry = entries.find((e) => e.id === ex.entry_id);
              return (
                <div key={ex.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {entry?.subjects?.name ?? "Lesson"} on {format(new Date(ex.date), "EEEE d MMM")}
                  </span>
                  <span>
                    {ex.status === "cancelled"
                      ? "is cancelled"
                      : `has moved to ${ex.new_date ? format(new Date(ex.new_date), "EEEE d MMM") : "another slot"}`}
                    {ex.reason ? ` — ${ex.reason}` : ""}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
