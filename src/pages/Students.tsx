import { useState } from "react";
import { GraduationCap, Plus, Search, Download, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AddStudentDialog } from "@/components/forms/AddStudentDialog";
import { exportToCsv } from "@/lib/csv-export";
import { CsvImportDialog } from "@/components/import/CsvImportDialog";

const PAGE_SIZE = 20;

export default function Students() {
  const navigate = useNavigate();
  const { schoolId } = useAuth();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["students", schoolId, search, classFilter, statusFilter, page],
    queryFn: async () => {
      if (!schoolId) return { students: [], count: 0 };

      let query = supabase
        .from("students")
        .select("id, first_name, last_name, student_id_number, status, gender, student_type, enrolments(class_id, classes(name))", { count: "exact" })
        .eq("school_id", schoolId)
        .order("last_name")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id_number.ilike.%${search}%`);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }

      const { data: students, count } = await query;

      // Filter by class if needed (client-side since it's a nested relation)
      let filtered = students || [];
      if (classFilter !== "all" && classes) {
        const classId = classes.find(c => c.name.toLowerCase() === classFilter)?.id;
        if (classId) {
          filtered = filtered.filter((s: any) => s.enrolments?.some((e: any) => e.class_id === classId));
        }
      }

      return { students: filtered, count: count || 0 };
    },
    enabled: !!schoolId,
  });

  const getClassName = (student: any) => {
    const enrolment = student.enrolments?.[0];
    return enrolment?.classes?.name || "—";
  };

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Students" description="Manage student records and enrolments.">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
          if (!data?.students?.length) return;
          exportToCsv("students", ["Student ID", "First Name", "Last Name", "Class", "Type", "Status"],
            data.students.map((s: any) => [s.student_id_number || "", s.first_name, s.last_name, getClassName(s), s.student_type || "", s.status]));
        }}><Download className="h-4 w-4" /> Export CSV</Button>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Student</Button>
      </PageHeader>
      <AddStudentDialog open={showAdd} onOpenChange={setShowAdd} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search students…" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes?.map(c => (
              <SelectItem key={c.id} value={c.name.toLowerCase()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Student ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.students?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No students found.</TableCell>
              </TableRow>
            ) : (
              data?.students?.map((s: any) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/students/${s.id}`)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.student_id_number || "—"}</TableCell>
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell>{getClassName(s)}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{s.student_type || "—"}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {Math.min((page * PAGE_SIZE) + 1, data?.count || 0)}–{Math.min((page + 1) * PAGE_SIZE, data?.count || 0)} of {data?.count || 0} students
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
