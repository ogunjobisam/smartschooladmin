import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { BookOpen, CalendarCheck, ClipboardList, GraduationCap, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SchoolSnapshot } from "@/components/dashboard/SchoolSnapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { displayClassName } from "@/lib/sections";

/**
 * What a member of teaching staff sees of their own work.
 *
 * Only the classes they are assigned to, the registers taken for those classes
 * and the results they are allowed to enter. Row-level security already limits
 * the rows; this page simply stops a teacher having to hunt through screens
 * built for the office.
 */
export default function StaffPortal() {
  const { user, schoolId, orgId } = useAuth();

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ["my-staff-basic", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, staff_id_number, school_id, schools(name)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const staffId = staff?.id ?? null;

  const { data: myClasses = [], isLoading: classesLoading } = useQuery({
    queryKey: ["my-classes", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_teachers")
        .select("class_id, classes(id, name, school_id)")
        .eq("staff_id", staffId!);
      if (error) throw error;
      return (data || [])
        .map((row) => row.classes)
        .filter((c): c is { id: string; name: string; school_id: string } => !!c);
    },
    enabled: !!staffId,
  });


  const classIds = useMemo(() => myClasses.map((c) => c.id), [myClasses]);

  // A pupil is enrolled once per term, so without pinning to the current term
  // the same child is counted again for every past term.
  const { data: currentPeriodId } = useQuery({
    queryKey: ["staff-current-period", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, academic_years!inner(org_id)")
        .eq("is_current", true)
        .eq("academic_years.org_id", orgId!)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!orgId,
  });

  const { data: enrolments = [] } = useQuery({
    queryKey: ["my-class-enrolments", classIds, currentPeriodId],
    queryFn: async () => {
      let query = supabase
        .from("enrolments")
        .select("id, class_id, student_id, students(first_name, last_name, student_id_number, status)")
        .in("class_id", classIds);
      if (currentPeriodId) query = query.eq("academic_period_id", currentPeriodId);
      const { data, error } = await query;
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((row) => {
        const key = `${row.class_id}|${row.student_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: classIds.length > 0,
  });

  const since = useMemo(() => format(subDays(new Date(), 30), "yyyy-MM-dd"), []);

  const { data: attendance = [] } = useQuery({
    queryKey: ["my-class-attendance", classIds, since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, class_id, date, status")
        .in("class_id", classIds)
        .gte("date", since)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: classIds.length > 0,
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["my-class-exams", classIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, name, class_id, exam_date, status, max_score")
        .in("class_id", classIds)
        .order("exam_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: classIds.length > 0,
  });

  const examIds = useMemo(() => exams.map((e) => e.id), [exams]);

  const { data: scores = [] } = useQuery({
    queryKey: ["my-class-scores", examIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select("id, exam_id, score")
        .in("exam_id", examIds);
      if (error) throw error;
      return data || [];
    },
    enabled: examIds.length > 0,
  });

  const className = (id: string | null) => {
    const found = myClasses.find((c) => c.id === id);
    return found ? displayClassName(found.name) : "—";
  };

  const attendanceRate = useMemo(() => {
    if (attendance.length === 0) return null;
    const present = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    return Math.round((present / attendance.length) * 100);
  }, [attendance]);

  const recentRegisters = useMemo(() => {
    const byKey = new Map<string, { date: string; classId: string | null; present: number; total: number }>();
    for (const row of attendance) {
      const key = `${row.date}|${row.class_id}`;
      const entry = byKey.get(key) ?? { date: row.date, classId: row.class_id, present: 0, total: 0 };
      entry.total += 1;
      if (row.status === "present" || row.status === "late") entry.present += 1;
      byKey.set(key, entry);
    }
    return [...byKey.values()].slice(0, 8);
  }, [attendance]);

  const examRows = useMemo(
    () =>
      exams.map((exam) => {
        const own = scores.filter((s) => s.exam_id === exam.id);
        const totals = own.reduce(
          (acc, s) => {
            const max = exam.max_score || 100;
            if (s.score === null || s.score === undefined) return acc;
            acc.sum += (Number(s.score) / max) * 100;
            acc.count += 1;
            return acc;
          },
          { sum: 0, count: 0 },
        );
        return {
          ...exam,
          entered: own.length,
          average: totals.count > 0 ? Math.round(totals.sum / totals.count) : null,
        };
      }),
    [exams, scores],
  );

  if (staffLoading || classesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="space-y-6">
        <PageHeader title="My teaching" description="Your classes, registers and results." />
        <EmptyState
          icon={GraduationCap}
          title="No staff record linked to your account"
          description="Ask the school office to link your account to your staff record, then this page will fill in."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My teaching"
        description={`${staff.first_name} ${staff.last_name}${staff.schools?.name ? ` · ${staff.schools.name}` : ""}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/attendance"><CalendarCheck className="h-4 w-4" /> Take register</Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/exams"><ClipboardList className="h-4 w-4" /> Enter results</Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="My classes" value={String(myClasses.length)} icon={BookOpen} />
        <StatCard title="My students" value={String(enrolments.length)} icon={Users} />
        <StatCard
          title="Attendance (30 days)"
          value={attendanceRate === null ? "—" : `${attendanceRate}%`}
          subtitle="Present or late"
          icon={CalendarCheck}
        />
        <StatCard
          title="Recent exams"
          value={String(exams.length)}
          subtitle={`${scores.length} result${scores.length === 1 ? "" : "s"} entered`}
          icon={ClipboardList}
        />
      </div>

      {/* The same attendance and results figures the school dashboard shows,
          narrowed by row-level security to the classes this teacher holds. */}
      <SchoolSnapshot />

      {myClasses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No classes assigned yet"
          description="Once the school assigns you to a class, its students, registers and results appear here."
        />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My classes</CardTitle>
              <CardDescription>Only the classes you are assigned to.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myClasses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{displayClassName(c.name)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {enrolments.filter((e) => e.class_id === c.id).length}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent registers</CardTitle>
                <CardDescription>Attendance you have recorded in the last 30 days.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {recentRegisters.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No registers taken yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Present</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRegisters.map((r) => (
                        <TableRow key={`${r.date}-${r.classId}`}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(parseISO(r.date), "d MMM yyyy")}
                          </TableCell>
                          <TableCell className="text-sm">{className(r.classId)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {r.present}/{r.total}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">My exams and grades</CardTitle>
                <CardDescription>Results for your classes only.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {examRows.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No exams set for your classes yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Exam</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Entered</TableHead>
                        <TableHead className="text-right">Average</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {examRows.map((e) => (
                        <TableRow key={e.id} className="cursor-pointer" onClick={() => window.location.assign(`/exams/${e.id}`)}>
                          <TableCell className="max-w-[180px]">
                            <p className="truncate text-sm font-medium">{displayClassName(e.name) || e.name}</p>
                            {e.status && (
                              <Badge variant="secondary" className="mt-1 text-[10px]">{e.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{className(e.class_id)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{e.entered}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {e.average === null ? "—" : `${e.average}%`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My students</CardTitle>
              <CardDescription>Everyone enrolled in the classes you teach{schoolId ? "" : ""}.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {enrolments.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No students enrolled in your classes yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead className="hidden sm:table-cell">ID</TableHead>
                      <TableHead>Class</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrolments.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm font-medium">
                          {e.students ? `${e.students.first_name} ${e.students.last_name}` : "—"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {e.students?.student_id_number || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{className(e.class_id)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
