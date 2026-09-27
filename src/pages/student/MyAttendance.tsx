import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { displayClassName } from "@/lib/sections";

const ALL_PERIODS = "__all__";

/**
 * A student's own day-by-day attendance register, with the term filter the
 * school office uses. Row-level security already limits this to their rows.
 */
export default function MyAttendance() {
  const { user } = useAuth();
  const [periodId, setPeriodId] = useState<string>(ALL_PERIODS);

  const { data: studentId, isLoading: studentLoading } = useQuery({
    queryKey: ["my-attendance-student", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!user?.id,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["my-attendance-periods"],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, start_date, end_date")
        .order("start_date", { ascending: false });
      return data || [];
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["my-attendance-records", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("id, date, status, classes(name)")
        .eq("student_id", studentId!)
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!studentId,
  });

  const filtered = useMemo(() => {
    if (periodId === ALL_PERIODS) return records;
    const period = periods.find((p) => p.id === periodId);
    if (!period) return records;
    return records.filter((r) => r.date >= period.start_date && r.date <= period.end_date);
  }, [records, periodId, periods]);

  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of filtered) t[r.status as keyof typeof t] += 1;
    return t;
  }, [filtered]);

  if (studentLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My attendance" description="Your day-by-day register.">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All terms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PERIODS}>All terms</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Present", totals.present],
          ["Absent", totals.absent],
          ["Late", totals.late],
          ["Excused", totals.excused],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Class</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No attendance recorded in this period.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-sm">
                      {new Date(r.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-sm">{displayClassName(r.classes?.name) || "—"}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {records.length === 0 && !isLoading && (
        <EmptyState
          icon={CalendarCheck}
          title="Nothing recorded yet"
          description="Your attendance will appear here once your teachers start taking the register."
        />
      )}
    </div>
  );
}
