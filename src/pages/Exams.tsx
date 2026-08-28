import { displayClassName } from "@/lib/sections";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Pencil, BookOpen, Search, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CreateExamDialog } from "@/components/exams/CreateExamDialog";

const ALL = "all";

export default function Exams() {
  const { schoolId } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [periodFilter, setPeriodFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["exams", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("exams")
        .select("*, classes(name), academic_periods(name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!schoolId,
  });

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "status-paid",
    closed: "status-void",
  };

  // Filter options come from the exams themselves, so a school never sees a
  // filter that would return nothing.
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exams) {
      if (e.class_id) map.set(e.class_id, displayClassName(e.classes?.name) || "Unnamed class");
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  const periodOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exams) {
      if (e.academic_period_id) map.set(e.academic_period_id, e.academic_periods?.name || "Unnamed period");
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  const statusOptions = useMemo(
    () => Array.from(new Set(exams.map((e) => e.status).filter(Boolean))).sort(),
    [exams]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (classFilter !== ALL && e.class_id !== classFilter) return false;
      if (periodFilter !== ALL && e.academic_period_id !== periodFilter) return false;
      if (statusFilter !== ALL && e.status !== statusFilter) return false;
      return true;
    });
  }, [exams, search, classFilter, periodFilter, statusFilter]);

  const filtersActive =
    !!search.trim() || classFilter !== ALL || periodFilter !== ALL || statusFilter !== ALL;

  const clearFilters = () => {
    setSearch("");
    setClassFilter(ALL);
    setPeriodFilter(ALL);
    setStatusFilter(ALL);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Exams & Grades" description="Create exams, enter scores, and generate report cards.">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> New Exam
        </Button>
      </PageHeader>

      {exams.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exam name..."
              className="pl-9"
              aria-label="Search exams by name"
            />
          </div>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="sm:w-[170px]" aria-label="Filter by class">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classes</SelectItem>
              {classOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="sm:w-[170px]" aria-label="Filter by term">
              <SelectValue placeholder="All terms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All terms</SelectItem>
              {periodOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-[150px]" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : exams.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={BookOpen}
                title="No exams yet"
                description="Create your first exam to start entering student scores."
                actionLabel="Create exam"
                onAction={() => setCreateOpen(true)}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exam Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Max Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        No exams match these filters.
                        <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((exam) => (
                      <TableRow key={exam.id} className="cursor-pointer" onClick={() => navigate(`/exams/${exam.id}`)}>
                        <TableCell className="font-medium">{exam.name}</TableCell>
                        <TableCell className="text-muted-foreground">{displayClassName(exam.classes?.name) || "All"}</TableCell>
                        <TableCell className="text-muted-foreground">{exam.academic_periods?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{exam.exam_date ? format(new Date(exam.exam_date), "dd MMM yyyy") : "—"}</TableCell>
                        <TableCell>{exam.max_score}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusColor[exam.status] || ""}>
                            {exam.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={(e) => { e.stopPropagation(); navigate(`/exams/${exam.id}`); }}
                          >
                            <Pencil className="mr-1 h-3 w-3" /> Scores
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateExamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
