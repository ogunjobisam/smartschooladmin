import { displayClassName } from "@/lib/sections";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Pencil, BookOpen, Search, X, Download, Bookmark, Trash2, ArrowUp, ArrowDown } from "lucide-react";
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
import { exportToCsv } from "@/lib/csv-export";
import { toast } from "sonner";

const ALL = "all";

type SortKey = "name" | "class" | "period" | "status" | "updated" | "date";
type SortDir = "asc" | "desc";

interface ExamPreset {
  name: string;
  search: string;
  classFilter: string;
  periodFilter: string;
  statusFilter: string;
  sortKey: SortKey;
  sortDir: SortDir;
}

const PRESET_KEY = "exam-filter-presets";

function loadPresets(schoolId: string | null): ExamPreset[] {
  if (!schoolId) return [];
  try {
    const raw = localStorage.getItem(`${PRESET_KEY}:${schoolId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ExamPreset[]) : [];
  } catch {
    return [];
  }
}

export default function Exams() {
  const { schoolId } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [periodFilter, setPeriodFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [presets, setPresets] = useState<ExamPreset[]>([]);
  const [activePreset, setActivePreset] = useState<string>("");

  // Saved views live in the browser: they are a personal convenience, not shared config.
  useEffect(() => {
    setPresets(loadPresets(schoolId));
    setActivePreset("");
  }, [schoolId]);

  const persistPresets = (next: ExamPreset[]) => {
    setPresets(next);
    if (schoolId) localStorage.setItem(`${PRESET_KEY}:${schoolId}`, JSON.stringify(next));
  };

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
    const rows = exams.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (classFilter !== ALL && e.class_id !== classFilter) return false;
      if (periodFilter !== ALL && e.academic_period_id !== periodFilter) return false;
      if (statusFilter !== ALL && e.status !== statusFilter) return false;
      return true;
    });

    const value = (e: (typeof rows)[number]): string => {
      switch (sortKey) {
        case "class": return displayClassName(e.classes?.name) || "";
        case "period": return e.academic_periods?.name || "";
        case "status": return e.status || "";
        case "date": return e.exam_date || "";
        case "updated": return e.updated_at || e.created_at || "";
        default: return e.name || "";
      }
    };

    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Blanks always sort last, whichever direction is chosen.
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      return av.localeCompare(bv) * factor;
    });
  }, [exams, search, classFilter, periodFilter, statusFilter, sortKey, sortDir]);

  const filtersActive =
    !!search.trim() || classFilter !== ALL || periodFilter !== ALL || statusFilter !== ALL;

  const clearFilters = () => {
    setSearch("");
    setClassFilter(ALL);
    setPeriodFilter(ALL);
    setStatusFilter(ALL);
    setActivePreset("");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "updated" || key === "date" ? "desc" : "asc");
    }
  };

  const SortHead = ({ label, sortBy, className }: { label: string; sortBy: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {sortKey === sortBy && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export — no exams match these filters.");
      return;
    }
    exportToCsv(
      `exams-${format(new Date(), "yyyy-MM-dd")}`,
      ["Exam Name", "Class", "Term", "Exam Date", "Max Score", "Weight", "Status", "Last Updated"],
      filtered.map((e) => [
        e.name,
        displayClassName(e.classes?.name) || "All classes",
        e.academic_periods?.name || "",
        e.exam_date ? format(new Date(e.exam_date), "yyyy-MM-dd") : "",
        String(e.max_score ?? ""),
        String(e.weight ?? ""),
        e.status || "",
        e.updated_at ? format(new Date(e.updated_at), "yyyy-MM-dd HH:mm") : "",
      ])
    );
    toast.success(`Exported ${filtered.length} exam${filtered.length === 1 ? "" : "s"}.`);
  };

  const savePreset = () => {
    const name = window.prompt("Name this view (e.g. 'Term 2 drafts')")?.trim();
    if (!name) return;
    const preset: ExamPreset = { name, search, classFilter, periodFilter, statusFilter, sortKey, sortDir };
    persistPresets([...presets.filter((p) => p.name !== name), preset]);
    setActivePreset(name);
    toast.success(`Saved view "${name}".`);
  };

  const applyPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (!preset) return;
    setSearch(preset.search);
    setClassFilter(preset.classFilter);
    setPeriodFilter(preset.periodFilter);
    setStatusFilter(preset.statusFilter);
    setSortKey(preset.sortKey);
    setSortDir(preset.sortDir);
    setActivePreset(name);
  };

  const deleteActivePreset = () => {
    if (!activePreset) return;
    persistPresets(presets.filter((p) => p.name !== activePreset));
    setActivePreset("");
    toast.success("View removed.");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Exams & Grades" description="Create exams, enter scores, and generate report cards.">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exams.length === 0}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Exam
          </Button>
        </div>
      </PageHeader>

      {exams.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActivePreset(""); }}
                placeholder="Search exam name..."
                className="pl-9"
                aria-label="Search exams by name"
              />
            </div>

            <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setActivePreset(""); }}>
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

            <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); setActivePreset(""); }}>
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

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setActivePreset(""); }}>
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Saved views:</span>
            {presets.length > 0 ? (
              <Select value={activePreset} onValueChange={applyPreset}>
                <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Apply a saved view">
                  <SelectValue placeholder="Choose a saved view" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-muted-foreground">none yet</span>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={savePreset}>
              <Bookmark className="mr-1 h-3.5 w-3.5" /> Save current view
            </Button>
            {activePreset && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={deleteActivePreset}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove "{activePreset}"
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Showing {filtered.length} of {exams.length}
            </span>
          </div>
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
                    <SortHead label="Exam Name" sortBy="name" />
                    <SortHead label="Class" sortBy="class" />
                    <SortHead label="Term" sortBy="period" />
                    <SortHead label="Date" sortBy="date" />
                    <TableHead>Max Score</TableHead>
                    <SortHead label="Status" sortBy="status" />
                    <SortHead label="Updated" sortBy="updated" />
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
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
                        <TableCell className="text-muted-foreground">
                          {exam.updated_at ? format(new Date(exam.updated_at), "dd MMM yyyy") : "—"}
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
