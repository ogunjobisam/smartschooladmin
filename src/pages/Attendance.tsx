import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Check, X, Clock, ShieldOff, Save, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

interface StudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  studentIdNumber: string | null;
  status: AttendanceStatus;
  existingRecordId?: string;
}

const statusConfig: Record<AttendanceStatus, { label: string; icon: typeof Check; className: string }> = {
  present: { label: "Present", icon: Check, className: "bg-success/10 text-success hover:bg-success/20" },
  absent: { label: "Absent", icon: X, className: "bg-destructive/10 text-destructive hover:bg-destructive/20" },
  late: { label: "Late", icon: Clock, className: "bg-warning/10 text-warning hover:bg-warning/20" },
  excused: { label: "Excused", icon: ShieldOff, className: "bg-muted text-muted-foreground hover:bg-muted/80" },
};

const statusCycle: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export default function Attendance() {
  const { schoolId, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const dateStr = format(date, "yyyy-MM-dd");

  // Fetch classes
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Fetch current academic period
  const { data: currentPeriod } = useQuery({
    queryKey: ["current-period", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id")
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch enrolled students for selected class + existing attendance
  const { data: studentData, isLoading: studentsLoading } = useQuery({
    queryKey: ["attendance-students", selectedClassId, dateStr, currentPeriod?.id],
    queryFn: async () => {
      if (!selectedClassId || !schoolId) return { students: [], records: [] };

      // Get enrolled students
      let studentsQuery = supabase
        .from("enrolments")
        .select("student_id, students!inner(id, first_name, last_name, student_id_number, status)")
        .eq("class_id", selectedClassId);

      if (currentPeriod?.id) {
        studentsQuery = studentsQuery.eq("academic_period_id", currentPeriod.id);
      }

      const { data: enrolments } = await studentsQuery;

      // Get existing attendance for this date + class
      const { data: records } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("class_id", selectedClassId)
        .eq("date", dateStr);

      return {
        students: (enrolments || [])
          .map((e: any) => e.students)
          .filter((s: any) => s.status === "active"),
        records: records || [],
      };
    },
    enabled: !!selectedClassId && !!schoolId,
  });

  // Build rows when data changes
  useEffect(() => {
    if (!studentData) return;
    const { students, records } = studentData;
    const recordMap = new Map(records.map((r: any) => [r.student_id, r]));

    const newRows: StudentRow[] = students.map((s: any) => {
      const existing = recordMap.get(s.id);
      return {
        studentId: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        studentIdNumber: s.student_id_number,
        status: existing?.status || "present",
        existingRecordId: existing?.id,
      };
    });
    newRows.sort((a, b) => a.lastName.localeCompare(b.lastName));
    setRows(newRows);
    setDirty(false);
  }, [studentData]);

  const toggleStatus = (index: number) => {
    setRows((prev) => {
      const updated = [...prev];
      const current = updated[index].status;
      const nextIdx = (statusCycle.indexOf(current) + 1) % statusCycle.length;
      updated[index] = { ...updated[index], status: statusCycle[nextIdx] };
      return updated;
    });
    setDirty(true);
  };

  const setAllStatus = (status: AttendanceStatus) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!schoolId || !selectedClassId || !user) return;
    setSaving(true);

    // Upsert all attendance records
    const records = rows.map((r) => ({
      school_id: schoolId,
      class_id: selectedClassId,
      student_id: r.studentId,
      date: dateStr,
      status: r.status as any,
      marked_by: user.id,
      updated_at: new Date().toISOString(),
    }));

    // Delete existing for this class+date, then insert fresh
    await supabase
      .from("attendance_records")
      .delete()
      .eq("class_id", selectedClassId)
      .eq("date", dateStr);

    const { error } = await supabase.from("attendance_records").insert(records);

    setSaving(false);
    if (error) {
      toast.error("Failed to save attendance: " + error.message);
    } else {
      toast.success(`Attendance saved for ${rows.length} students`);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["attendance-students"] });
    }
  };

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    rows.forEach((r) => counts[r.status]++);
    return counts;
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark and review daily student attendance by class." />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Select class" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("h-9 w-[180px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {rows.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-muted-foreground mr-1">Mark all:</span>
            {statusCycle.map((s) => {
              const config = statusConfig[s];
              return (
                <Button key={s} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAllStatus(s)}>
                  {config.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.entries(summary) as [AttendanceStatus, number][]).map(([status, count]) => {
            const config = statusConfig[status];
            const Icon = config.icon;
            return (
              <div key={status} className={cn("flex items-center gap-3 rounded-lg border p-3", config.className.split(" ")[0])}>
                <Icon className="h-5 w-5" />
                <div>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs capitalize">{status}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Attendance Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            {selectedClassId
              ? `${classes.find((c: any) => c.id === selectedClassId)?.name || "Class"} — ${format(date, "EEEE, dd MMMM yyyy")}`
              : "Select a class to begin"}
          </CardTitle>
          {dirty && rows.length > 0 && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Save Attendance
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!selectedClassId ? (
            <EmptyState icon={Users} title="No class selected" description="Choose a class from the dropdown above to mark attendance." />
          ) : studentsLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} title="No students enrolled" description="This class has no enrolled students for the current academic period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const config = statusConfig[row.status];
                  const Icon = config.icon;
                  return (
                    <TableRow key={row.studentId}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{row.lastName}, {row.firstName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.studentIdNumber || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("h-8 gap-1.5 rounded-full px-3 text-xs font-medium", config.className)}
                          onClick={() => toggleStatus(idx)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {config.label}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
