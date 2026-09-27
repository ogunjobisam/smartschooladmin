import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Printer, Send, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";
import { canManageTermReports } from "@/lib/access";
import { sortBySection } from "@/lib/sections";
import { getErrorMessage } from "@/lib/errors";
import { openDocument } from "@/lib/document-theme";
import { DEFAULT_RUBRIC, gradeFromRubric } from "@/lib/performance";
import { runAiInsight } from "@/lib/ai-insights";
import {
  AFFECTIVE_TRAITS, PSYCHOMOTOR_TRAITS, RATING_SCALE, fetchTermReport, ordinal, termReportHtml, weightStatus,
  type RatingDomain, type TermComments, type TermRating, type TermReport as TermReportData,
} from "@/lib/term-report";

interface Pupil {
  id: string;
  name: string;
  idNumber: string | null;
}

/**
 * One arm's term report: every pupil's combined CA-and-exam total per subject,
 * their average and positions, and the report cards built from them — with the
 * class teacher's and principal's comments, the ratings, and the release that
 * lets families see it.
 */
export default function TermReport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { schoolId, orgId, userRole } = useAuth();
  const { branding } = useSchoolBranding();
  const isManager = canManageTermReports(userRole);

  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [editing, setEditing] = useState<Pupil | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId, "term-report"],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name, level_name, arm, section, level_order")
        .eq("school_id", schoolId!)
        .order("level_order");
      return sortBySection(data || []);
    },
    enabled: !!schoolId,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["term-report-periods", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, start_date, end_date, is_current, academic_years!inner(org_id, name)")
        .eq("academic_years.org_id", orgId!)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!orgId,
  });

  // Start on the current term and the first class, so the page shows something.
  useEffect(() => {
    if (!periodId && periods.length > 0) setPeriodId((periods.find((p) => p.is_current) ?? periods[0]).id);
  }, [periods, periodId]);
  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id);
  }, [classes, classId]);

  const cls = classes.find((c) => c.id === classId);
  const period = periods.find((p) => p.id === periodId);
  const ready = !!classId && !!periodId;

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["term-report", classId, periodId],
    queryFn: () => fetchTermReport(classId, periodId),
    enabled: ready,
  });

  const { data: pupils = [] } = useQuery({
    queryKey: ["term-report-pupils", classId, periodId],
    queryFn: async () => {
      const { data } = await supabase
        .from("enrolments")
        .select("students!inner(id, first_name, last_name, student_id_number, status)")
        .eq("class_id", classId)
        .eq("academic_period_id", periodId);
      return (data || [])
        .map((e) => e.students)
        .filter((s) => s.status === "active")
        .map((s): Pupil => ({ id: s.id, name: `${s.first_name} ${s.last_name}`, idNumber: s.student_id_number }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: ready,
  });
  const pupilIds = pupils.map((p) => p.id);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id, name, short_code").eq("school_id", schoolId!).order("name");
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["term-report-comments", periodId, pupilIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("term_report_comments")
        .select("student_id, kind, body")
        .eq("academic_period_id", periodId)
        .in("student_id", pupilIds);
      return data || [];
    },
    enabled: ready && pupilIds.length > 0,
  });

  const { data: ratings = [] } = useQuery({
    queryKey: ["term-report-ratings", periodId, pupilIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("term_report_ratings")
        .select("student_id, domain, trait, rating")
        .eq("academic_period_id", periodId)
        .in("student_id", pupilIds);
      return data || [];
    },
    enabled: ready && pupilIds.length > 0,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["term-report-attendance", classId, period?.start_date, period?.end_date],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("class_id", classId)
        .gte("date", period!.start_date)
        .lte("date", period!.end_date);
      return data || [];
    },
    enabled: ready && !!period?.start_date && !!period?.end_date,
  });

  const subjectNames = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const commentsByPupil = useMemo(() => {
    const map = new Map<string, TermComments>();
    for (const c of comments) {
      const entry = map.get(c.student_id) ?? {};
      if (c.kind === "principal") entry.principal = c.body;
      else entry.classTeacher = c.body;
      map.set(c.student_id, entry);
    }
    return map;
  }, [comments]);
  const ratingsByPupil = useMemo(() => {
    const map = new Map<string, TermRating[]>();
    for (const r of ratings) {
      map.set(r.student_id, [...(map.get(r.student_id) ?? []), { domain: r.domain as RatingDomain, trait: r.trait, rating: r.rating }]);
    }
    return map;
  }, [ratings]);
  const attendanceByPupil = useMemo(() => {
    const map = new Map<string, { present: number; total: number }>();
    for (const r of attendance) {
      const entry = map.get(r.student_id) ?? { present: 0, total: 0 };
      entry.total += 1;
      if (r.status === "present" || r.status === "late") entry.present += 1;
      map.set(r.student_id, entry);
    }
    return map;
  }, [attendance]);

  const data: TermReportData | undefined = report;
  const resultByPupil = useMemo(() => new Map((data?.students ?? []).map((s) => [s.student_id, s])), [data]);
  const subjectColumns = useMemo(() => {
    const ids = [...new Set((data?.subjects ?? []).map((s) => s.subject_id))];
    return ids.sort((a, b) => (subjectNames.get(a) ?? "").localeCompare(subjectNames.get(b) ?? ""));
  }, [data, subjectNames]);
  const cell = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data?.subjects ?? []) map.set(`${s.student_id}:${s.subject_id}`, s.percent);
    return map;
  }, [data]);

  const weights = weightStatus(data?.components ?? []);
  const showLevel = !!cls?.level_name && cls.level_name !== cls.name;

  const openReportCards = (list: Pupil[]) => {
    if (!data || !cls || !period) return;
    openDocument(termReportHtml({
      school: { name: branding.name, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, accentColor: branding.accentColor },
      className: cls.name,
      levelName: cls.level_name,
      periodName: `${period.name}${period.academic_years?.name ? ` · ${period.academic_years.name}` : ""}`,
      report: data,
      subjectNames,
      pupils: list,
      comments: commentsByPupil,
      ratings: ratingsByPupil,
      attendance: attendanceByPupil,
    }));
  };

  const setReleased = async (release: boolean) => {
    setReleasing(true);
    const { error } = release
      ? await supabase.from("term_report_releases").insert({ class_id: classId, academic_period_id: periodId })
      : await supabase.from("term_report_releases").delete().eq("class_id", classId).eq("academic_period_id", periodId);
    setReleasing(false);
    setConfirmRelease(false);
    if (error) { toast.error(getErrorMessage(error, "Could not update the release.")); return; }
    toast.success(release ? "Released to parents and pupils" : "Withdrawn from parents and pupils");
    queryClient.invalidateQueries({ queryKey: ["term-report", classId, periodId] });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Term report" description="CA and exam combined into one term total, with positions, comments and report cards.">
        <Button variant="outline" size="sm" onClick={() => navigate("/exams")}>
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Exams
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Term" /></SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.academic_years?.name ? ` · ${p.academic_years.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data && (
          <Badge variant={data.released ? "default" : "secondary"}>
            {data.released ? "Released to families" : "Not released"}
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openReportCards(pupils)} disabled={!data || pupils.length === 0}>
            <Printer className="mr-2 h-3.5 w-3.5" /> Print all report cards
          </Button>
          {isManager && data && (
            data.released ? (
              <Button variant="outline" size="sm" onClick={() => setReleased(false)} disabled={releasing}>
                <Undo2 className="mr-2 h-3.5 w-3.5" /> Withdraw
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirmRelease(true)} disabled={releasing || (data.students.length === 0)}>
                <Send className="mr-2 h-3.5 w-3.5" /> Release to families
              </Button>
            )
          )}
        </div>
      </div>

      {data && data.components.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <span className="font-medium">Made up of</span>
            {data.components.map((c) => (
              <Badge key={c.exam_id} variant="outline">{c.name} · {c.term_weight}%</Badge>
            ))}
            {weights.message && <span className="text-warning">{weights.message}</span>}
          </CardContent>
        </Card>
      )}

      {!ready || reportLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !data || data.components.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={FileText}
              title="Nothing counts toward this term yet"
              description={weights.message ?? "Give this class's CA and exam a term weight to build its term report."}
              actionLabel="Go to exams"
              onAction={() => navigate("/exams")}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          {data.arm_size !== undefined && (
            <p className="border-b px-4 py-2 text-xs text-muted-foreground">
              {data.arm_size} pupils with results · class average {data.arm_average ?? "—"}%
              {showLevel && ` · ${data.level_size} across ${cls?.level_name}`}
            </p>
          )}
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[180px] bg-card">Pupil</TableHead>
                  {subjectColumns.map((id) => {
                    const s = subjects.find((x) => x.id === id);
                    return <TableHead key={id} className="min-w-[70px] text-center">{s?.short_code || s?.name || "—"}</TableHead>;
                  })}
                  <TableHead className="text-center">Average</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Position</TableHead>
                  {showLevel && <TableHead className="text-center">In {cls?.level_name}</TableHead>}
                  <TableHead className="text-center">Comments</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pupils.map((p) => {
                  const r = resultByPupil.get(p.id);
                  const c = commentsByPupil.get(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="sticky left-0 z-10 bg-card font-medium">{p.name}</TableCell>
                      {subjectColumns.map((id) => (
                        <TableCell key={id} className="text-center tabular-nums">{cell.get(`${p.id}:${id}`)?.toFixed(1) ?? "—"}</TableCell>
                      ))}
                      <TableCell className="text-center font-medium tabular-nums">{r ? r.average.toFixed(1) : "—"}</TableCell>
                      <TableCell className="text-center">{r ? gradeFromRubric(r.average, DEFAULT_RUBRIC) : "—"}</TableCell>
                      <TableCell className="text-center">{r ? ordinal(r.arm_position) : "—"}</TableCell>
                      {showLevel && <TableCell className="text-center">{r ? ordinal(r.level_position) : "—"}</TableCell>}
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {[c?.classTeacher && "Teacher", c?.principal && "Principal"].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="p-1 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>Report card</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editing && data && (
        <ReportCardEditor
          pupil={editing}
          periodId={periodId}
          className={cls?.name ?? ""}
          report={data}
          subjectNames={subjectNames}
          comments={commentsByPupil.get(editing.id) ?? {}}
          ratings={ratingsByPupil.get(editing.id) ?? []}
          attendance={attendanceByPupil.get(editing.id)}
          isManager={isManager}
          schoolId={schoolId}
          onClose={() => setEditing(null)}
          onPrint={() => openReportCards([editing])}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["term-report-comments", periodId] });
            queryClient.invalidateQueries({ queryKey: ["term-report-ratings", periodId] });
          }}
        />
      )}

      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {cls?.name}'s term report?</AlertDialogTitle>
            <AlertDialogDescription>
              Parents and pupils in {cls?.name} will be able to see their report card, position,
              comments and ratings for {period?.name}. You can withdraw it again.
              {!weights.complete && weights.message ? ` Note: ${weights.message}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setReleased(true)}>Release</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReportCardEditor({
  pupil, periodId, className, report, subjectNames, comments, ratings, attendance, isManager, schoolId,
  onClose, onPrint, onSaved,
}: {
  pupil: Pupil;
  periodId: string;
  className: string;
  report: TermReportData;
  subjectNames: Map<string, string>;
  comments: TermComments;
  ratings: TermRating[];
  attendance?: { present: number; total: number };
  isManager: boolean;
  schoolId: string | null;
  onClose: () => void;
  onPrint: () => void;
  onSaved: () => void;
}) {
  const [teacherComment, setTeacherComment] = useState(comments.classTeacher ?? "");
  const [principalComment, setPrincipalComment] = useState(comments.principal ?? "");
  const [draft, setDraft] = useState<Map<string, number>>(
    () => new Map(ratings.map((r) => [`${r.domain}:${r.trait}`, r.rating]))
  );
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const result = report.students.find((s) => s.student_id === pupil.id);
  const subjects = report.subjects.filter((s) => s.student_id === pupil.id);

  const draftWithAi = async () => {
    setDrafting(true);
    try {
      const { result: text } = await runAiInsight("report_card_comments", {
        student: pupil.name,
        class: className,
        overallAverage: result?.average ?? null,
        position: result ? `${ordinal(result.arm_position)} of ${report.arm_size}` : null,
        subjects: subjects.map((s) => ({
          subject: subjectNames.get(s.subject_id) ?? "Subject",
          average: s.percent,
          grade: gradeFromRubric(s.percent, DEFAULT_RUBRIC),
          position: ordinal(s.position),
          classAverage: s.class_average,
        })),
        attendance: attendance && attendance.total > 0 ? { present: attendance.present, days: attendance.total } : null,
      }, schoolId);
      setTeacherComment(text.trim());
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not draft a comment."));
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const writes = [];
      const comment = async (kind: "class_teacher" | "principal", body: string, before?: string | null) => {
        if (body.trim() === (before ?? "").trim()) return;
        const { error } = body.trim()
          ? await supabase.from("term_report_comments").upsert(
              { student_id: pupil.id, academic_period_id: periodId, kind, body: body.trim(), updated_at: new Date().toISOString() },
              { onConflict: "student_id,academic_period_id,kind" }
            )
          : await supabase.from("term_report_comments").delete()
              .eq("student_id", pupil.id).eq("academic_period_id", periodId).eq("kind", kind);
        if (error) throw error;
      };
      writes.push(comment("class_teacher", teacherComment, comments.classTeacher));
      if (isManager) writes.push(comment("principal", principalComment, comments.principal));

      const rows = [...draft.entries()].map(([key, rating]) => {
        const [domain, trait] = key.split(":");
        return { student_id: pupil.id, academic_period_id: periodId, domain, trait, rating, updated_at: new Date().toISOString() };
      });
      if (rows.length > 0) {
        writes.push((async () => {
          const { error } = await supabase.from("term_report_ratings")
            .upsert(rows, { onConflict: "student_id,academic_period_id,domain,trait" });
          if (error) throw error;
        })());
      }
      await Promise.all(writes);
      toast.success("Report card saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save the report card."));
    } finally {
      setSaving(false);
    }
  };

  const ratingGrid = (title: string, domain: RatingDomain, traits: { key: string; label: string }[]) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {traits.map((t) => {
        const key = `${domain}:${t.key}`;
        return (
          <div key={t.key} className="flex items-center justify-between gap-2">
            <span className="text-sm">{t.label}</span>
            <Select
              value={draft.has(key) ? String(draft.get(key)) : ""}
              onValueChange={(v) => setDraft((prev) => new Map(prev).set(key, Number(v)))}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {RATING_SCALE.map((r) => <SelectItem key={r.value} value={String(r.value)}>{r.value} · {r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pupil.name}</DialogTitle>
          <DialogDescription>
            {result
              ? `Average ${result.average.toFixed(1)}% · ${ordinal(result.arm_position)} of ${report.arm_size} in ${className}`
              : "No results for this term yet."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="teacher-comment">Class teacher's comment</Label>
              <Button variant="ghost" size="sm" onClick={draftWithAi} disabled={drafting || !result}>
                {drafting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                Draft with AI
              </Button>
            </div>
            <Textarea id="teacher-comment" rows={3} maxLength={2000} value={teacherComment} onChange={(e) => setTeacherComment(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="principal-comment">Principal's comment</Label>
            {isManager ? (
              <Textarea id="principal-comment" rows={2} maxLength={2000} value={principalComment} onChange={(e) => setPrincipalComment(e.target.value)} />
            ) : (
              <p className="text-sm text-muted-foreground">{comments.principal || "Written by the principal."}</p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {ratingGrid("Affective", "affective", AFFECTIVE_TRAITS)}
            {ratingGrid("Psychomotor", "psychomotor", PSYCHOMOTOR_TRAITS)}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onPrint}><Printer className="mr-2 h-3.5 w-3.5" /> Preview saved</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
