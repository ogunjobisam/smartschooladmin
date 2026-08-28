import { displayClassName } from "@/lib/sections";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, Pencil, BookOpen, Search, X, Download, Bookmark, Trash2, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
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
const STATUS_OPTIONS = ["draft", "published", "closed"];
const PAGE_SIZES = [25, 50, 100];

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
  pageSize?: number;
}

interface ExamRow {
  id: string;
  name: string;
  status: string;
  exam_date: string | null;
  max_score: number;
  weight: number | null;
  updated_at: string | null;
  class_id: string | null;
  academic_period_id: string | null;
  classes: { name: string } | null;
  academic_periods: { name: string } | null;
}

const PRESET_KEY = "exam-filter-presets";

/**
 * Saved views are per school AND per role: a bursar and a teacher looking at the
 * same school care about different slices of the exam list.
 */
function presetKey(schoolId: string | null, role: string | null): string | null {
  if (!schoolId) return null;
  return `${PRESET_KEY}:${schoolId}:${role ?? "unknown"}`;
}

function loadPresets(schoolId: string | null, role: string | null): ExamPreset[] {
  const key = presetKey(schoolId, role);
  if (!key) return [];
  try {
    // Fall back to the pre-role key so views saved earlier are not lost.
    const raw = localStorage.getItem(key) ?? localStorage.getItem(`${PRESET_KEY}:${schoolId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ExamPreset[]) : [];
  } catch {
    return [];
  }
}

/** Keeps the select string out of the type checker's query parser. */
const sel = (s: string): string => s;

const EXAM_SELECT =
  "id, name, status, exam_date, max_score, weight, updated_at, class_id, academic_period_id, classes(name), academic_periods(name)";

const CSV_HEADERS = [
  "Exam Name", "Class", "Term", "Exam Date", "Max Score", "Weight", "Status", "Last Updated",
];

function csvRow(e: ExamRow): string[] {
  return [
    e.name,
    displayClassName(e.classes?.name) || "All classes",
    e.academic_periods?.name || "",
    e.exam_date ? format(new Date(e.exam_date), "yyyy-MM-dd") : "",
    String(e.max_score ?? ""),
    String(e.weight ?? ""),
    e.status || "",
    e.updated_at ? format(new Date(e.updated_at), "yyyy-MM-dd HH:mm") : "",
  ];
}

export default function Exams() {
  const { schoolId, userRole } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [periodFilter, setPeriodFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [presets, setPresets] = useState<ExamPreset[]>([]);
  const [activePreset, setActivePreset] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  // Typing shouldn't fire a request per keystroke now that filtering is server-side.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPresets(loadPresets(schoolId, userRole));
    setActivePreset("");
  }, [schoolId, userRole]);

  // Any filter or sort change returns to the first page.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, classFilter, periodFilter, statusFilter, sortKey, sortDir, pageSize]);

  const persistPresets = (next: ExamPreset[]) => {
    setPresets(next);
    const key = presetKey(schoolId, userRole);
    if (key) localStorage.setItem(key, JSON.stringify(next));
  };

  /** Applies the current filters to a fresh exams query. */
  const buildQuery = (from: number | null, to: number | null, withCount: boolean) => {
    let q = supabase
      .from("exams")
      .select(sel(EXAM_SELECT), withCount ? { count: "exact" } : undefined)
      .eq("school_id", schoolId!);

    if (debouncedSearch) q = q.ilike("name", `%${debouncedSearch}%`);
    if (classFilter !== ALL) q = q.eq("class_id", classFilter);
    if (periodFilter !== ALL) q = q.eq("academic_period_id", periodFilter);
    if (statusFilter !== ALL) q = q.eq("status", statusFilter);

    const asc = sortDir === "asc";
    if (sortKey === "class") q = q.order("name", { referencedTable: "classes", ascending: asc, nullsFirst: false });
    else if (sortKey === "period") q = q.order("name", { referencedTable: "academic_periods", ascending: asc, nullsFirst: false });
    else if (sortKey === "date") q = q.order("exam_date", { ascending: asc, nullsFirst: false });
    else if (sortKey === "status") q = q.order("status", { ascending: asc });
    else if (sortKey === "name") q = q.order("name", { ascending: asc });
    else q = q.order("updated_at", { ascending: asc, nullsFirst: false });

    if (from !== null && to !== null) q = q.range(from, to);
    return q.returns<ExamRow[]>();
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "exams", schoolId, debouncedSearch, classFilter, periodFilter, statusFilter,
      sortKey, sortDir, page, pageSize,
    ],
    queryFn: async () => {
      if (!schoolId) return { rows: [] as ExamRow[], count: 0 };
      const from = page * pageSize;
      const { data: rows, count, error } = await buildQuery(from, from + pageSize - 1, true);
      if (error) throw error;
      return { rows: rows ?? [], count: count ?? 0 };
    },
    enabled: !!schoolId,
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;

  // Do any exams exist at all? Distinguishes "no exams yet" from "no matches".
  const { data: anyExams = 0 } = useQuery({
    queryKey: ["exams-any", schoolId],
    queryFn: async () => {
      if (!schoolId) return 0;
      const { count } = await supabase
        .from("exams")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId);
      return count ?? 0;
    },
    enabled: !!schoolId,
  });

  // Filter options come from the school's own classes and terms.
  const { data: classOptions = [] } = useQuery({
    queryKey: ["exam-filter-classes", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, level_order")
        .eq("school_id", schoolId!)
        .order("level_order", { nullsFirst: false });
      return (data ?? []).map((c) => ({ id: c.id, name: displayClassName(c.name) || "Unnamed class" }));
    },
    enabled: !!schoolId,
  });

  const { data: periodOptions = [] } = useQuery({
    queryKey: ["exam-filter-periods", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, start_date")
        .order("start_date", { ascending: false });
      return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
    },
    enabled: !!schoolId,
  });

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "status-paid",
    closed: "status-void",
  };

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

  /** Exports just this page. */
  const handleExportPage = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export — no exams match these filters.");
      return;
    }
    exportToCsv(`exams-page-${page + 1}-${format(new Date(), "yyyy-MM-dd")}`, CSV_HEADERS, rows.map(csvRow));
    toast.success(`Exported ${rows.length} exam${rows.length === 1 ? "" : "s"} from this page.`);
  };

  /** Exports every exam matching the current term/class/status/search filters. */
  const handleExportAll = async () => {
    if (total === 0) {
      toast.error("Nothing to export — no exams match these filters.");
      return;
    }
    setExporting(true);
    const all: ExamRow[] = [];
    const chunk = 1000;
    try {
      for (let from = 0; from < total; from += chunk) {
        const { data: batch, error } = await buildQuery(from, from + chunk - 1, false);
        if (error) throw error;
        all.push(...(batch ?? []));
        if (!batch || batch.length === 0) break;
      }
      exportToCsv(`exams-all-${format(new Date(), "yyyy-MM-dd")}`, CSV_HEADERS, all.map(csvRow));
      toast.success(`Exported ${all.length} exam${all.length === 1 ? "" : "s"} across all pages.`);
    } catch (err) {
      toast.error("Export failed: " + (err instanceof Error ? err.message : "unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const savePreset = () => {
    const name = window.prompt("Name this view (e.g. 'Term 2 drafts')")?.trim();
    if (!name) return;
    const preset: ExamPreset = { name, search, classFilter, periodFilter, statusFilter, sortKey, sortDir, pageSize };
    persistPresets([...presets.filter((p) => p.name !== name), preset]);
    setActivePreset(name);
    toast.success(`Saved view "${name}" for your role.`);
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
    if (preset.pageSize) setPageSize(preset.pageSize);
    setActivePreset(name);
  };

  const deleteActivePreset = () => {
    if (!activePreset) return;
    persistPresets(presets.filter((p) => p.name !== activePreset));
    setActivePreset("");
    toast.success("View removed.");
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="space-y-6">
      <PageHeader title="Exams & Grades" description="Create exams, enter scores, and generate report cards.">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPage} disabled={rows.length === 0}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export page
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll} disabled={total === 0 || exporting}>
            {exporting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
            Export all matches
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Exam
          </Button>
        </div>
      </PageHeader>

      {anyExams > 0 && (
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
                {STATUS_OPTIONS.map((s) => (
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
            <span className="text-xs text-muted-foreground">
              Saved views {userRole ? `(${userRole.replace(/_/g, " ")})` : ""}:
            </span>
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
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
              Showing {rangeStart}–{rangeEnd} of {total}
            </span>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : anyExams === 0 ? (
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
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        No exams match these filters.
                        <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((exam) => (
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

      {anyExams > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[80px] text-xs" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
              disabled={page + 1 >= pageCount || isFetching}
            >
              Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <CreateExamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
