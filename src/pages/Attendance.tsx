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
import { useNavigate } from "react-router-dom";
import { rosterForPeriod } from "@/lib/roster";
import { sortBySection } from "@/lib/sections";
import { notifySchoolAdmins } from "@/lib/school-updates";

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
  present: { label: "Present", icon: Check, className: "border-success/30 bg-success/10 text-success hover:bg-success/20" },
  absent: { label: "Absent", icon: X, className: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20" },
  late: { label: "Late", icon: Clock, className: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20" },
  excused: { label: "Excused", icon: ShieldOff, className: "border-border bg-muted text-muted-foreground hover:bg-muted/80" },
};

const statusOrder: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export default function Attendance() {
  const navigate = useNavigate();
  const { schoolId, orgId, user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
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
      return sortBySection(data || []);
    },
    enabled: !!schoolId,
  });

  // Every term in the org, so the register can be taken for a term other than
  // the current one. Attendance was previously pinned to whichever term was
  // marked current, and a class whose enrolments sat in a different term looked
  // simply empty with no way to tell why.
  const { data: periods = [] } = useQuery({
    queryKey: ["attendance-periods", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, is_current, start_date, academic_years!inner(org_id, name)")
        .eq("academic_years.org_id", orgId!)
        .order("start_date");
      return data || [];
    },
    enabled: !!orgId,
  });

  const currentPeriod = periods.find((p) => p.is_current) ?? periods[periods.length - 1];
  const activePeriodId = selectedPeriodId || currentPeriod?.id || "";

  // Fetch every enrolment for the class, across all terms, plus the day's
  // register. Filtering by term happens below so the page can tell the
  // difference between "nobody is in this class" and "nobody is in this class
  // *this term*" — two problems with very different fixes.
  const { data: studentData, isLoading: studentsLoading } = useQuery({
    queryKey: ["attendance-students", selectedClassId, dateStr],
    queryFn: async () => {
      if (!selectedClassId || !schoolId) return { enrolments: [], records: [] };

      const [{ data: enrolments }, { data: records }] = await Promise.all([
        supabase
          .from("enrolments")
          .select("student_id, academic_period_id, students!inner(id, first_name, last_name, student_id_number, status)")
          .eq("class_id", selectedClassId),
        supabase
          .from("attendance_records")
          .select("*")
          .eq("class_id", selectedClassId)
          .eq("date", dateStr),
      ]);

      return {
        enrolments: (enrolments || []).filter((e) => e.students?.status === "active"),
        records: records || [],
      };
    },
    enabled: !!selectedClassId && !!schoolId,
  });

  const roster = rosterForPeriod(studentData?.enrolments ?? [], activePeriodId);

  // When the term being viewed is empty, name the terms the class *is* enrolled
  // in so the teacher can switch rather than guess.
  const otherTerms = roster.otherPeriodIds
    .map((id) => periods.find((p) => p.id === id))
    .filter((p): p is (typeof periods)[number] => !!p);

  // Build rows when data changes
  useEffect(() => {
    if (!studentData) return;
    const records = studentData.records;
    const students = roster.students;
    const recordMap = new Map(records.map((r) => [r.student_id, r]));

    const newRows: StudentRow[] = students.map((s) => {
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
    // termEnrolments is derived from studentData and activePeriodId, so those
    // two are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentData, activePeriodId]);

  const setStatus = (index: number, status: AttendanceStatus) => {
    setRows((prev) => {
      if (prev[index].status === status) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], status };
      return updated;
    });
    setDirty(true);
  };

  const setAllStatus = (status: AttendanceStatus) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!schoolId || !selectedClassId || !user || rows.length === 0) return;
    setSaving(true);

    const records = rows.map((r) => ({
      school_id: schoolId,
      class_id: selectedClassId,
      student_id: r.studentId,
      date: dateStr,
      status: r.status,
      marked_by: user.id,
      updated_at: new Date().toISOString(),
    }));

    // Upsert rather than delete-then-insert. The old order wiped the day's
    // register first, so a failing insert (a policy denial, a dropped
    // connection) left the class with no attendance at all.
    // The conflict target matches the table's UNIQUE(student_id, date): a
    // student has one attendance record per day, whichever class marks it.
    const { error } = await supabase
      .from("attendance_records")
      .upsert(records, { onConflict: "student_id,date" });

    setSaving(false);
    if (error) {
      toast.error("Failed to save attendance: " + error.message);
    } else {
      toast.success(`Attendance saved for ${rows.length} students`);
      setDirty(false);
      if (orgId) {
        const className = classes.find((c) => c.id === selectedClassId)?.name ?? "a class";
        const absent = rows.filter((r) => r.status === "absent").length;
        notifySchoolAdmins({
          orgId,
          schoolId,
          area: "attendance",
          summary: `The register for ${className} on ${format(date, "d MMM yyyy")} was marked: ${rows.length} pupils, ${absent} absent.`,
          link: "/attendance",
          entityType: "attendance",
          entityId: selectedClassId,
          excludeUserId: user.id,
        }).catch(console.error);
      }
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
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activePeriodId} onValueChange={setSelectedPeriodId}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="Select term" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.is_current ? " (current)" : ""}
              </SelectItem>
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
            {statusOrder.map((s) => {
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
              ? `${classes.find((c) => c.id === selectedClassId)?.name || "Class"} — ${format(date, "EEEE, dd MMMM yyyy")}`
              : "Select a class to begin"}
          </CardTitle>
          {rows.length > 0 && (
            <div className="flex items-center gap-2">
              {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Save Attendance
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {classes.length === 0 && !classesLoading ? (
            // A teacher only sees classes they are assigned to, so an empty list
            // means nobody has assigned them one — not that the school has none.
            <EmptyState
              icon={Users}
              title={userRole === "teacher" ? "No classes assigned to you" : "No classes yet"}
              description={
                userRole === "teacher"
                  ? "You can only take the register for classes you are assigned to. Ask your school admin to assign you under Settings → Classes."
                  : "Create classes before attendance can be marked."
              }
              {...(userRole === "teacher"
                ? {}
                : { actionLabel: "Open class settings", onAction: () => navigate("/settings?tab=classes") })}
            />
          ) : !selectedClassId ? (
            <EmptyState icon={Users} title="No class selected" description="Choose a class from the dropdown above to mark attendance." />
          ) : studentsLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            otherTerms.length > 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title={`Nobody is in this class for ${periods.find((p) => p.id === activePeriodId)?.name ?? "this term"}`}
                description={`This class has students enrolled in ${otherTerms.map((t) => t.name).join(", ")}. Switch the term above to take the register, or promote them into this term from the Students page.`}
                actionLabel={`Switch to ${otherTerms[0].name}`}
                onAction={() => setSelectedPeriodId(otherTerms[0].id)}
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No students in this class"
                description="Nobody is enrolled in this class yet. Students are put into a class when you add them, or through Promote — students added by CSV import need a class chosen during the import."
                actionLabel="Go to Students"
                onAction={() => navigate("/students")}
              />
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{row.lastName}, {row.firstName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.studentIdNumber || "—"}</TableCell>
                    <TableCell>
                      {/* One tap sets any status. This used to be a single
                          button that cycled through all four, so correcting a
                          mistap meant clicking three more times. */}
                      <div
                        role="radiogroup"
                        aria-label={`Attendance for ${row.firstName} ${row.lastName}`}
                        className="flex justify-end gap-1"
                      >
                        {statusOrder.map((status) => {
                          const config = statusConfig[status];
                          const Icon = config.icon;
                          const selected = row.status === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              title={config.label}
                              onClick={() => setStatus(idx, status)}
                              className={cn(
                                "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                                selected
                                  ? config.className
                                  : "border-transparent text-muted-foreground hover:bg-muted"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{config.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
