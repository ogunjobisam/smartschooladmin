import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addWeeks, format } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, Clock, Printer } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { LessonDialog } from "@/components/timetable/LessonDialog";
import { PeriodsDialog } from "@/components/timetable/PeriodsDialog";
import { TimetableGrid } from "@/components/timetable/TimetableGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { displayClassName, sortBySection } from "@/lib/sections";
import {
  ALL_DAYS, WEEKDAYS, buildWeekGrid, dateForDay, weekStart,
  type SlotLesson, type TimetableEntry, type TimetableException, type TimetablePeriod,
} from "@/lib/timetable";

const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal"];

/**
 * The school timetable: a weekly pattern per class per term, with one-off
 * changes for a single date. Managers edit any class; teachers edit the classes
 * they are assigned to. Everyone else reads.
 */
export default function Timetable() {
  const { schoolId, orgId, user, userRole } = useAuth();
  const isManager = MANAGER_ROLES.includes(userRole || "");

  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [monday, setMonday] = useState<Date>(() => weekStart(new Date()));
  const [showPeriods, setShowPeriods] = useState(false);
  const [slot, setSlot] = useState<{ periodId: string; day: number; lesson: SlotLesson | null } | null>(null);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["timetable-classes", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId!).order("level_order");
      return sortBySection(data || []);
    },
    enabled: !!schoolId,
  });

  const { data: terms = [] } = useQuery({
    queryKey: ["timetable-terms", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, is_current, start_date, academic_years!inner(org_id)")
        .eq("academic_years.org_id", orgId!)
        .order("start_date");
      return data || [];
    },
    enabled: !!orgId,
  });

  const currentTerm = terms.find((t) => t.is_current) ?? terms[terms.length - 1];
  const activeTermId = periodId || currentTerm?.id || "";
  const activeClassId = classId || classes[0]?.id || "";

  const { data: bellPeriods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ["timetable-periods", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_periods")
        .select("id, name, start_time, end_time, sort_order, is_break")
        .eq("school_id", schoolId!)
        .order("sort_order");
      return (data || []) as TimetablePeriod[];
    },
    enabled: !!schoolId,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["timetable-subjects", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name").eq("school_id", schoolId!).order("name");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["timetable-teachers", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId!)
        .order("first_name");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: myStaffId } = useQuery({
    queryKey: ["timetable-my-staff", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("staff").select("id").eq("user_id", user!.id).maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!user?.id,
  });

  const { data: myClassIds = [] } = useQuery({
    queryKey: ["timetable-my-classes", myStaffId],
    queryFn: async () => {
      const { data } = await supabase.from("class_teachers").select("class_id").eq("staff_id", myStaffId!);
      return (data || []).map((r) => r.class_id as string);
    },
    enabled: !!myStaffId,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["timetable-entries", activeClassId, activeTermId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_entries")
        .select("id, class_id, subject_id, staff_id, timetable_period_id, day_of_week, room, notes, academic_period_id, subjects(name), staff(first_name, last_name), classes(name)")
        .eq("class_id", activeClassId)
        .eq("academic_period_id", activeTermId);
      return (data || []) as unknown as TimetableEntry[];
    },
    enabled: !!activeClassId && !!activeTermId,
  });

  const { data: myEntries = [] } = useQuery({
    queryKey: ["timetable-entries", "mine", myStaffId, activeTermId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_entries")
        .select("id, class_id, subject_id, staff_id, timetable_period_id, day_of_week, room, notes, academic_period_id, subjects(name), staff(first_name, last_name), classes(name)")
        .eq("staff_id", myStaffId!)
        .eq("academic_period_id", activeTermId);
      return (data || []) as unknown as TimetableEntry[];
    },
    enabled: !!myStaffId && !!activeTermId,
  });

  const weekEnd = dateForDay(monday, 7);
  const weekBegin = dateForDay(monday, 1);

  const { data: exceptions = [] } = useQuery({
    queryKey: ["timetable-exceptions", schoolId, weekBegin],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_exceptions")
        .select("id, entry_id, date, status, new_date, new_timetable_period_id, new_staff_id, new_room, reason")
        .eq("school_id", schoolId!)
        .or(`and(date.gte.${weekBegin},date.lte.${weekEnd}),and(new_date.gte.${weekBegin},new_date.lte.${weekEnd})`);
      return (data || []) as TimetableException[];
    },
    enabled: !!schoolId,
  });

  const canEditActiveClass = isManager || myClassIds.includes(activeClassId);

  const classGrid = useMemo(() => buildWeekGrid(entries, exceptions, monday), [entries, exceptions, monday]);
  const myGrid = useMemo(() => buildWeekGrid(myEntries, exceptions, monday), [myEntries, exceptions, monday]);

  const usedDays = useMemo(() => {
    const days = new Set<number>(WEEKDAYS);
    for (const e of [...entries, ...myEntries]) days.add(e.day_of_week);
    return ALL_DAYS.filter((d) => days.has(d));
  }, [entries, myEntries]);

  const loading = classesLoading || periodsLoading;

  const weekLabel = `${format(monday, "d MMM")} – ${format(new Date(dateForDay(monday, 7)), "d MMM yyyy")}`;

  const weekNav = (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" onClick={() => setMonday((m) => addWeeks(m, -1))} aria-label="Previous week">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => setMonday(weekStart(new Date()))}>This week</Button>
      <Button variant="outline" size="icon" onClick={() => setMonday((m) => addWeeks(m, 1))} aria-label="Next week">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" description={`Weekly lessons · ${weekLabel}`}>
        {isManager && (
          <Button variant="outline" size="sm" onClick={() => setShowPeriods(true)}>
            <Clock className="mr-2 h-4 w-4" /> Daily periods
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print
        </Button>
      </PageHeader>

      {bellPeriods.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Set the school day first"
          description="Divide the day into named periods (Period 1, Break and so on). Every class timetable slots into them."
          actionLabel={isManager ? "Set daily periods" : undefined}
          onAction={isManager ? () => setShowPeriods(true) : undefined}
        />
      ) : (
        <Tabs defaultValue="class">
          <TabsList>
            <TabsTrigger value="class">Class timetable</TabsTrigger>
            {myStaffId && <TabsTrigger value="mine">My lessons</TabsTrigger>}
          </TabsList>

          <TabsContent value="class" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Select value={activeClassId} onValueChange={setClassId}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{displayClassName(c.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={activeTermId} onValueChange={setPeriodId}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Term" /></SelectTrigger>
                    <SelectContent>
                      {terms.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {weekNav}
              </CardHeader>
              <CardContent>
                {!activeClassId || !activeTermId ? (
                  <EmptyState
                    icon={CalendarRange}
                    title="Choose a class and term"
                    description="Classes and terms are set up in Settings."
                  />
                ) : entriesLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <>
                    <TimetableGrid
                      periods={bellPeriods}
                      days={usedDays}
                      monday={monday}
                      grid={classGrid}
                      editable={canEditActiveClass}
                      onSelectSlot={(pid, day, lesson) => setSlot({ periodId: pid, day, lesson })}
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                      {canEditActiveClass
                        ? "Tap a slot to add a lesson, or a lesson to change it, cancel it or move it for this week only."
                        : "You can view this class timetable but not change it."}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {myStaffId && (
            <TabsContent value="mine" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">My teaching week</CardTitle>
                    <CardDescription>Every lesson you are down to teach this term.</CardDescription>
                  </div>
                  {weekNav}
                </CardHeader>
                <CardContent>
                  {myEntries.length === 0 ? (
                    <EmptyState
                      icon={CalendarRange}
                      title="No lessons scheduled for you yet"
                      description="Once lessons are assigned to you they appear here for every week of the term."
                    />
                  ) : (
                    <TimetableGrid
                      periods={bellPeriods}
                      days={usedDays}
                      monday={monday}
                      grid={myGrid}
                      showClassName
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}

      {schoolId && (
        <PeriodsDialog
          open={showPeriods}
          onOpenChange={setShowPeriods}
          schoolId={schoolId}
          periods={bellPeriods}
        />
      )}

      {slot && schoolId && activeClassId && activeTermId && (
        <LessonDialog
          open={!!slot}
          onOpenChange={(open) => !open && setSlot(null)}
          schoolId={schoolId}
          academicPeriodId={activeTermId}
          classId={activeClassId}
          periodId={slot.periodId}
          day={slot.day}
          date={slot.lesson?.date ?? dateForDay(monday, slot.day)}
          lesson={slot.lesson}
          subjects={subjects}
          teachers={teachers}
          periods={bellPeriods}
        />
      )}
    </div>
  );
}
