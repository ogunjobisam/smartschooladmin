import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, GraduationCap, TrendingDown, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AiInsightPanel } from "@/components/ai/AiInsightPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { RiskBadge } from "@/components/performance/PerformanceSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useClassPerformanceData } from "@/hooks/use-performance-data";
import { classPosition, subjectBreakdown, summariseStudent } from "@/lib/performance";

export default function Performance() {
  const navigate = useNavigate();
  const { schoolId, orgId, userRole } = useAuth();
  const [classId, setClassId] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>("all");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes").select("id, name").eq("school_id", schoolId!).order("level_order");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["performance-periods", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id)")
        .eq("academic_years.org_id", orgId!)
        .order("start_date");
      return data || [];
    },
    enabled: !!orgId,
  });

  const effectiveClassId = classId || classes[0]?.id;
  const { students, scores, attendance, isLoading } = useClassPerformanceData(
    effectiveClassId,
    periodId === "all" ? undefined : periodId
  );

  const summaries = useMemo(
    () => students.map((s) => ({ student: s, performance: summariseStudent(s.id, scores, attendance) })),
    [students, scores, attendance]
  );

  const averagesByStudent = useMemo(
    () => new Map(summaries.map((s) => [s.student.id, s.performance.average])),
    [summaries]
  );

  const ranked = useMemo(
    () =>
      summaries
        .map((s) => ({ ...s, rank: classPosition(averagesByStudent, s.student.id) }))
        .sort((a, b) => (b.performance.average ?? -1) - (a.performance.average ?? -1)),
    [summaries, averagesByStudent]
  );

  const classAverage = useMemo(() => {
    const scored = summaries.map((s) => s.performance.average).filter((a): a is number => a !== null);
    if (scored.length === 0) return null;
    return Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10;
  }, [summaries]);

  const needingAttention = ranked.filter((r) => r.performance.risk.level !== "on_track");
  const subjectChart = useMemo(
    () =>
      subjectBreakdown(scores)
        .filter((s) => s.average !== null)
        .map((s) => ({ name: s.subjectName, average: s.average as number })),
    [scores]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Performance"
        description="How a class is doing by subject, who is improving, and who needs attention."
      >
        <Select value={effectiveClassId ?? ""} onValueChange={setClassId}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      {classes.length === 0 ? (
        userRole === "teacher" ? (
          <EmptyState
            icon={GraduationCap}
            title="No classes assigned to you"
            description="You see performance for the classes you are assigned to. Ask your school admin to assign you under Settings → Classes."
          />
        ) : (
          <EmptyState
            icon={GraduationCap}
            title="No classes yet"
            description="Create classes before performance can be tracked."
            actionLabel="Open class settings"
            onAction={() => navigate("/settings?tab=classes")}
          />
        )
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students in this class"
          description="Enrol students in this class, or choose a different term."
          actionLabel="Go to Students"
          onAction={() => navigate("/students")}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Class average"
              value={classAverage === null ? "—" : `${classAverage}%`}
              icon={BarChart3}
              mono
              subtitle={`${students.length} students`}
            />
            <StatCard
              title="Needing attention"
              value={needingAttention.length.toString()}
              icon={TrendingDown}
              subtitle="Watch or needs attention"
            />
            <StatCard
              title="Scores recorded"
              value={scores.length.toString()}
              icon={GraduationCap}
              subtitle={periodId === "all" ? "All terms" : "Selected term"}
            />
          </div>

          <AiInsightPanel
            analysisType="academic_performance"
            title="AI performance analysis"
            description="A written read of how this class is doing, which subjects need attention, and which students to look at first."
            schoolId={schoolId}
            disabledReason={scores.length === 0 ? "Enter some exam scores first — there is nothing to analyse yet." : undefined}
            buildSummary={() => ({
              class: classes.find((c) => c.id === effectiveClassId)?.name,
              term: periodId === "all" ? "All terms" : periods.find((p) => p.id === periodId)?.name,
              classAverage,
              studentCount: students.length,
              subjectAverages: subjectChart,
              students: ranked.map((r) => ({
                name: `${r.student.first_name} ${r.student.last_name}`,
                average: r.performance.average,
                grade: r.performance.grade,
                position: r.rank.position,
                attendanceRate: r.performance.attendance.rate,
                trend: r.performance.trend.direction,
                trendChange: r.performance.trend.change,
                weakestSubjects: r.performance.subjects.slice(-2).map((sub) => ({
                  subject: sub.subjectName,
                  average: sub.average,
                })),
                flag: r.performance.risk.level,
                flagReasons: r.performance.risk.reasons,
              })),
            })}
          />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Average by subject</CardTitle></CardHeader>
            <CardContent>
              {subjectChart.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No exam scores recorded for this class yet.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectChart} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value: number) => [`${value}%`, "Class average"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="average" radius={[4, 4, 0, 0]} className="fill-accent" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Students</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs text-right">Average</TableHead>
                    <TableHead className="text-xs">Grade</TableHead>
                    <TableHead className="text-xs text-right">Attendance</TableHead>
                    <TableHead className="text-xs">Trend</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map(({ student, performance, rank }) => (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/students/${student.id}`)}
                    >
                      <TableCell className="text-muted-foreground">{rank.position ?? "—"}</TableCell>
                      <TableCell className="font-medium">{student.last_name}, {student.first_name}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {performance.average === null ? "—" : `${performance.average}%`}
                      </TableCell>
                      <TableCell>{performance.grade}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {performance.attendance.rate === null ? "—" : `${performance.attendance.rate}%`}
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {performance.trend.direction === "unknown" ? "—" : performance.trend.direction}
                      </TableCell>
                      <TableCell><RiskBadge level={performance.risk.level} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
