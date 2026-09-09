import { displayClassName } from "@/lib/sections";
import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gradeScoreFromRubric, type RubricBand } from "@/lib/performance";
import { ExamRubricEditor } from "@/components/exams/ExamRubricEditor";
import { canManageStudents } from "@/lib/access";
import { notifySchoolAdmins } from "@/lib/school-updates";
import { sendResultsPublishedAlerts } from "@/lib/family-alerts";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Printer, ArrowLeft, BookOpen, FileDown, Send, MoreHorizontal } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ReportCardView } from "@/components/exams/ReportCardView";
import { documentTheme } from "@/lib/document-theme";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";

interface ScoreEntry {
  studentId: string;
  subjectId: string;
  score: string;
  existingId?: string;
}

export default function ExamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { schoolId, orgId, user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Map<string, ScoreEntry>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reportCardStudent, setReportCardStudent] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { branding } = useSchoolBranding();

  const handlePrintAllReportCards = () => {
    if (!exam || students.length === 0) return;
    const win = window.open("", "_blank");
    if (!win) return;

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));

    const pages = students.map((student) => {
      const studentScores = Array.from(scores.values())
        .filter((s) => s.studentId === student.id && s.score !== "" && subjectMap.has(s.subjectId))
        .map((s) => ({
          subjectId: s.subjectId,
          score: parseFloat(s.score),
          max: maxFor(s.subjectId),
          grade: gradeFor(parseFloat(s.score), maxFor(s.subjectId)),
        }));

      const totalScore = studentScores.reduce((sum, s) => sum + s.score, 0);
      const pct = weightedPercent(student.id) ?? 0;
      const overallGrade = studentScores.length > 0 ? gradeFromPercent(pct) : "N/A";

      const rows = studentScores.map((s, idx) => {
        const sub = subjectMap.get(s.subjectId);
        const p = ((s.score / s.max) * 100).toFixed(1);
        return `<tr><td>${idx + 1}</td><td>${sub?.name || "Unknown"}</td><td class="text-center">${s.score}</td><td class="text-center">${s.max}</td><td class="text-center">${p}%</td><td class="text-center">${s.grade}</td></tr>`;
      }).join("");


      return `
        <div class="page">
          <div class="brand-bar"></div>
          <div class="header">
            ${branding.logoUrl ? `<img class="crest" src="${branding.logoUrl}" alt="" />` : ""}
            <h1>${branding.name}</h1>
            ${branding.tagline ? `<p>${branding.tagline}</p>` : ""}
            <p style="font-weight:600;margin-top:4px">STUDENT REPORT CARD</p>
            <p>${exam.name} • ${exam.academic_periods?.name || ""}</p>
          </div>
          <div class="student-info">
            <div><span class="label">Student Name: </span><strong>${student.first_name} ${student.last_name}</strong></div>
            <div><span class="label">Student ID: </span><strong>${student.student_id_number || "N/A"}</strong></div>
            <div><span class="label">Class: </span><strong>${displayClassName(exam.classes?.name) || "—"}</strong></div>
            <div><span class="label">Term/Period: </span><strong>${exam.academic_periods?.name || "—"}</strong></div>
          </div>
          <table><thead><tr><th>#</th><th>Subject</th><th class="text-center">Score</th><th class="text-center">Max</th><th class="text-center">%</th><th class="text-center">Grade</th></tr></thead><tbody>${rows}</tbody></table>
          <div class="summary"><div class="summary-grid">
            <div><div class="summary-value">${totalScore}</div><div class="summary-label">Total Score</div></div>
            <div><div class="summary-value">${pct.toFixed(1)}%</div><div class="summary-label">Weighted Average</div></div>
            <div><div class="summary-value">${overallGrade}</div><div class="summary-label">Overall Grade</div></div>
          </div></div>
          <div class="footer"><div><div class="sign-line">Class Teacher's Signature</div></div><div><div class="sign-line">Principal's Signature & Stamp</div></div></div>
        </div>`;
    }).join("");

    const theme = documentTheme({
      name: branding.name,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
    });

    win.document.write(`<html><head><title>Report Cards - ${exam.name}</title><style>
      @page { size: A4; margin: 14mm; }
      :root { --brand: ${theme.primary}; --brand-accent: ${theme.accent}; --brand-soft: ${theme.soft}; --brand-border: ${theme.border}; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 0; }
      .page { padding: 30px 28px; max-width: 840px; margin: 0 auto; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .brand-bar { height: 5px; border-radius: 4px; margin-bottom: 18px;
        background: linear-gradient(90deg, var(--brand) 0%, var(--brand) 58%, var(--brand-accent) 58%, var(--brand-accent) 100%); }
      .crest { height: 54px; width: 54px; object-fit: contain; border-radius: 12px; display: block; margin: 0 auto 8px; }
      .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--brand-border); }
      .header h1 { font-size: 23px; margin: 0 0 4px; color: var(--brand); }
      .header p { font-size: 12px; color: #64748b; margin: 2px 0; }
      .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 13px; }
      .label { color: #64748b; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: var(--brand-soft); color: var(--brand); padding: 9px 12px; text-align: left; font-size: 11px;
           font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border: 1px solid var(--brand-border); }
      td { padding: 8px 12px; border: 1px solid #e6ebf1; font-size: 13px; }
      .text-center { text-align: center; }
      .summary { background: var(--brand-soft); border: 1px solid var(--brand-border); padding: 18px; border-radius: 12px; margin-bottom: 20px; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; text-align: center; }
      .summary-value { font-size: 26px; font-weight: 800; color: var(--brand); }
      .summary-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
      .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 12px; }
      .sign-line { border-top: 1px solid #0f172a; padding-top: 4px; margin-top: 40px; }
      @media print { .page { padding: 0 0 8px; } }
    </style></head><body>${pages}</body></html>`);
    win.document.close();
    win.print();
  };

  // Fetch exam
  const { data: exam, isLoading: examLoading } = useQuery({
    queryKey: ["exam", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("exams")
        .select("*, classes(name), academic_periods(name)")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  // The term's date range bounds the attendance figures below.
  const { data: period } = useQuery({
    queryKey: ["exam-period", exam?.academic_period_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("name, start_date, end_date")
        .eq("id", exam!.academic_period_id!)
        .maybeSingle();
      return data;
    },
    enabled: !!exam?.academic_period_id,
  });

  // Fetch subjects assigned to the exam's class (falls back to all school subjects)
  const { data: classSubjectList = [] } = useQuery({

    queryKey: ["exam-subjects", exam?.class_id, schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      
      // If exam has a class, get only class-assigned subjects
      if (exam?.class_id) {
        const { data: classSubjects } = await supabase
          .from("class_subjects")
          .select("subject_id")
          .eq("class_id", exam.class_id);
        
        if (classSubjects && classSubjects.length > 0) {
          const subjectIds = (classSubjects ?? []).map((cs) => cs.subject_id);
          const { data } = await supabase
            .from("subjects")
            .select("*")
            .in("id", subjectIds)
            .eq("is_active", true)
            .order("name");
          return data || [];
        }
      }
      
      // Fallback: all school subjects
      const { data } = await supabase.from("subjects").select("*").eq("school_id", schoolId).eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!schoolId && !!exam,
  });

  // Per-exam scoring setup: which subjects count, their maximum score and weight.
  const { data: subjectConfig = [] } = useQuery({
    queryKey: ["exam-subject-config", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_subjects")
        .select("subject_id, max_score, weight")
        .eq("exam_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  // The exam's own grade rubric; empty means fall back to the default bands.
  const { data: gradeBands = [] } = useQuery({
    queryKey: ["exam-grade-bands", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_grade_bands")
        .select("label, min_percent, remark")
        .eq("exam_id", id!)
        .order("min_percent", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const rubric: RubricBand[] = useMemo(
    () => gradeBands.map((b) => ({ label: b.label, minPercent: Number(b.min_percent), remark: b.remark })),
    [gradeBands]
  );

  const configMap = useMemo(
    () => new Map(subjectConfig.map((c) => [c.subject_id, c])),
    [subjectConfig]
  );

  // Once an exam is configured, only the configured subjects are scored.
  const subjects = useMemo(
    () => (configMap.size > 0 ? classSubjectList.filter((s) => configMap.has(s.id)) : classSubjectList),
    [classSubjectList, configMap]
  );

  const maxFor = (subjectId: string) => Number(configMap.get(subjectId)?.max_score ?? exam?.max_score ?? 100);
  const weightFor = (subjectId: string) => Number(configMap.get(subjectId)?.weight ?? 1);
  const gradeFor = (score: number | null, max: number) => gradeScoreFromRubric(score, max, rubric);
  const gradeFromPercent = (percent: number | null) =>
    gradeScoreFromRubric(percent, 100, rubric);



  // Fetch enrolled students for the exam's class
  const { data: students = [] } = useQuery({
    queryKey: ["exam-students", exam?.class_id, exam?.academic_period_id],
    queryFn: async () => {
      if (!exam?.class_id) return [];
      let q = supabase
        .from("enrolments")
        .select("student_id, students!inner(id, first_name, last_name, student_id_number, status, user_id)")
        .eq("class_id", exam.class_id);
      if (exam.academic_period_id) q = q.eq("academic_period_id", exam.academic_period_id);
      const { data } = await q;
      return (data || [])
        .map((e) => e.students)
        .filter((s) => s.status === "active")
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
    },
    enabled: !!exam?.class_id,
  });

  // Fetch existing scores
  const { data: existingScores = [] } = useQuery({
    queryKey: ["exam-scores", id],
    queryFn: async () => {
      const { data } = await supabase.from("student_scores").select("*").eq("exam_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  // Attendance for the exam's class over the exam's term, so results can be read
  // alongside how often each student actually attended.
  const { data: attendance = [] } = useQuery({
    queryKey: ["exam-attendance", exam?.class_id, exam?.academic_period_id],
    queryFn: async () => {
      if (!exam?.class_id) return [];
      let q = supabase
        .from("attendance_records")
        .select("student_id, status, date")
        .eq("class_id", exam.class_id);
      if (period?.start_date && period?.end_date) {
        q = q.gte("date", period.start_date).lte("date", period.end_date);
      }
      const { data } = await q;
      return data || [];
    },
    enabled: !!exam?.class_id,
  });

  // Approvals raised against this exam (e.g. score changes needing sign-off).
  const { data: approvals = [] } = useQuery({
    queryKey: ["exam-approvals", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_requests")
        .select("id, type, description, status, amount, created_at, review_notes")
        .eq("reference_type", "exam")
        .eq("reference_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const attendanceByStudent = useMemo(() => {
    const map: Record<string, { present: number; total: number }> = {};
    for (const r of attendance) {
      if (!map[r.student_id]) map[r.student_id] = { present: 0, total: 0 };
      map[r.student_id].total += 1;
      if (r.status === "present" || r.status === "late") map[r.student_id].present += 1;
    }
    return map;
  }, [attendance]);

  // Initialize scores map from existing data
  useEffect(() => {
    const map = new Map<string, ScoreEntry>();
    existingScores.forEach((s) => {
      const key = `${s.student_id}-${s.subject_id}`;
      map.set(key, {
        studentId: s.student_id,
        subjectId: s.subject_id,
        score: s.score != null ? String(s.score) : "",
        existingId: s.id,
      });
    });
    setScores(map);
    setDirty(false);
  }, [existingScores]);

  const updateScore = (studentId: string, subjectId: string, value: string) => {
    const key = `${studentId}-${subjectId}`;
    setScores((prev) => {
      const next = new Map(prev);
      const existing = prev.get(key);
      next.set(key, {
        studentId,
        subjectId,
        score: value,
        existingId: existing?.existingId,
      });
      return next;
    });
    setDirty(true);
  };

  const getScore = (studentId: string, subjectId: string) => {
    return scores.get(`${studentId}-${subjectId}`)?.score || "";
  };

  const handleSave = async () => {
    if (!id || !user) return;
    setSaving(true);

    const entries = Array.from(scores.values()).filter((s) => s.score !== "");

    const records = entries.map((e) => ({
      exam_id: id,
      student_id: e.studentId,
      subject_id: e.subjectId,
      score: parseFloat(e.score) || 0,
      grade: gradeFor(parseFloat(e.score) || 0, maxFor(e.subjectId)),

      entered_by: user.id,
      updated_at: new Date().toISOString(),
    }));

    // Delete existing and re-insert (upsert pattern)
    await supabase.from("student_scores").delete().eq("exam_id", id);
    const { error } = await supabase.from("student_scores").insert(records);

    setSaving(false);
    if (error) toast.error("Failed to save scores: " + error.message);
    else {
      toast.success(`Saved scores for ${entries.length} entries`);
      setDirty(false);
      if (orgId && schoolId) {
        notifySchoolAdmins({
          orgId,
          schoolId,
          area: "exam_results",
          summary: `${entries.length} results were entered for ${exam?.name ?? "an exam"}.`,
          link: `/exams/${id}`,
          entityType: "exam",
          entityId: id,
          excludeUserId: user.id,
        }).catch(console.error);
      }
      queryClient.invalidateQueries({ queryKey: ["exam-scores", id] });
    }
  };

  // Weighted average percentage per student, honouring each subject's own
  // maximum score and weight from the exam's scoring setup.
  const weightedPercent = (studentId: string): number | null => {
    let weightSum = 0;
    let acc = 0;
    scores.forEach((entry) => {
      if (entry.studentId !== studentId || entry.score === "") return;
      const max = maxFor(entry.subjectId);
      if (!(max > 0)) return;
      const weight = weightFor(entry.subjectId);
      acc += ((parseFloat(entry.score) || 0) / max) * 100 * weight;
      weightSum += weight;
    });
    if (weightSum === 0) return null;
    return acc / weightSum;
  };

  // Raw totals, still useful on the report card summary.
  const studentAverages = useMemo(() => {
    const avgs: Record<string, { total: number; count: number }> = {};
    scores.forEach((entry) => {
      if (entry.score === "") return;
      if (!avgs[entry.studentId]) avgs[entry.studentId] = { total: 0, count: 0 };
      avgs[entry.studentId].total += parseFloat(entry.score) || 0;
      avgs[entry.studentId].count += 1;
    });
    return avgs;
  }, [scores]);


  if (examLoading) return <div className="space-y-4 p-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (!exam) return (
    <EmptyState
      icon={BookOpen}
      title="Exam not found"
      description="This exam doesn't exist, or you don't have access to it."
      actionLabel="Back to exams"
      onAction={() => navigate("/exams")}
    />
  );

  // Releasing results: the exam is marked published and every family is told.
  /** Mistakes and end-of-term wrap-up both need a way back out of "published". */
  const setExamStatus = async (status: "draft" | "published" | "closed", message: string) => {
    if (!id) return;
    const { error } = await supabase.from("exams").update({ status }).eq("id", id);
    if (error) { toast.error(getErrorMessage(error, "Could not update this exam.")); return; }
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ["exam", id] });
    queryClient.invalidateQueries({ queryKey: ["exams"] });
  };

  const handleDeleteExam = async () => {
    if (!id) return;
    setDeleteOpen(false);
    const { error: scoreError } = await supabase.from("exam_scores").delete().eq("exam_id", id);
    if (scoreError) { toast.error(getErrorMessage(scoreError, "Could not delete this exam's scores.")); return; }
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) { toast.error(getErrorMessage(error, "Could not delete this exam.")); return; }
    toast.success("Exam deleted");
    queryClient.invalidateQueries({ queryKey: ["exams"] });
    navigate("/exams");
  };

  const handlePublishResults = async () => {
    if (!exam || !id || !orgId || !schoolId) return;
    setPublishing(true);
    const { error } = await supabase.from("exams").update({ status: "published" }).eq("id", id);
    if (error) {
      setPublishing(false);
      toast.error("Could not publish results: " + error.message);
      return;
    }
    try {
      const result = await sendResultsPublishedAlerts({
        orgId,
        schoolId,
        examId: id,
        examName: exam.name,
        className: displayClassName(exam.classes?.name) || "your class",
        termName: exam.academic_periods?.name ?? null,
        students: students.map((s) => ({ id: s.id, userId: s.user_id ?? null })),
      });
      toast.success(
        result.queued > 0
          ? `Results published — ${result.queued} email${result.queued === 1 ? "" : "s"} sent to families`
          : "Results published",
      );
    } catch (alertError) {
      console.error(alertError);
      toast.success("Results published, but some alerts could not be sent");
    }
    setPublishing(false);
    queryClient.invalidateQueries({ queryKey: ["exam", id] });
  };

  // Show report card view
  if (reportCardStudent) {
    const student = students.find((s) => s.id === reportCardStudent);
    // A stale id (the student was withdrawn while the grid was open) finds
    // nobody; fall back to the grid rather than rendering a report card for
    // no one.
    if (!student) {
      setReportCardStudent(null);
      return null;
    }
    const studentScores = Array.from(scores.values()).filter(
      (s) => s.studentId === reportCardStudent && s.score !== ""
    );
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setReportCardStudent(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Scores
        </Button>
        <ReportCardView
          student={student}
          exam={exam}
          subjects={subjects}
          scores={studentScores.map((s) => ({
            subjectId: s.subjectId,
            score: parseFloat(s.score),
            grade: gradeFor(parseFloat(s.score), maxFor(s.subjectId)),
          }))}
          maxScore={exam.max_score}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={exam.name}
        description={`${displayClassName(exam.classes?.name) || "All Classes"} • ${exam.academic_periods?.name || ""} • Max Score: ${exam.max_score}`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/exams")}>
            <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
          </Button>
          {students.length > 0 && (
            <Button variant="outline" size="sm" onClick={handlePrintAllReportCards}>
              <FileDown className="mr-2 h-3.5 w-3.5" /> Print All Reports
            </Button>
          )}
          {canManageStudents(userRole) && students.length > 0 && exam.status !== "published" && (
            <Button variant="secondary" size="sm" onClick={handlePublishResults} disabled={publishing || dirty}>
              {publishing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
              Publish Results
            </Button>
          )}
          {exam.status === "published" && <Badge variant="secondary">Results published</Badge>}
          {exam.status === "closed" && <Badge variant="outline">Closed</Badge>}
          {canManageStudents(userRole) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Exam actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exam.status === "published" && (
                  <>
                    <DropdownMenuItem onClick={() => setExamStatus("draft", "Results unpublished")}>
                      Unpublish results
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExamStatus("closed", "Exam closed")}>
                      Close exam
                    </DropdownMenuItem>
                  </>
                )}
                {exam.status === "closed" && (
                  <DropdownMenuItem onClick={() => setExamStatus("published", "Exam reopened")}>
                    Reopen exam
                  </DropdownMenuItem>
                )}
                {exam.status !== "published" && (
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
                    Delete exam
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Save Scores
            </Button>
          )}
        </div>
      </PageHeader>

      {id && (
        <ExamRubricEditor
          examId={id}
          examMaxScore={exam.max_score}
          subjects={classSubjectList}
          canEdit={canManageStudents(userRole) || userRole === "teacher"}
        />
      )}



      {subjects.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={BookOpen}
              title="No subjects assigned to this class"
              description="Assign subjects to this class before entering scores."
              actionLabel="Open subject settings"
              onAction={() => navigate("/settings?tab=subjects")}
            />
          </CardContent>
        </Card>
      ) : !exam.class_id ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={BookOpen} title="No class assigned" description="This exam needs a class assigned before scores can be entered. Edit the exam to assign a class." />
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={BookOpen}
              title="No students enrolled"
              description="No students are enrolled in this class for the selected period. Enrol students, or check the current term in Settings."
              actionLabel="Go to Students"
              onAction={() => navigate("/students")}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Student</TableHead>
                  {subjects.map((sub) => (
                    <TableHead key={sub.id} className="min-w-[90px] text-center">
                      {sub.short_code || sub.name}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        /{maxFor(sub.id)} × {weightFor(sub.id)}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[90px]">Weighted %</TableHead>
                  <TableHead className="text-center min-w-[60px]">Grade</TableHead>
                  <TableHead className="text-center min-w-[110px]">Attendance</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => {
                  const percent = weightedPercent(student.id);
                  const grade = percent != null ? gradeFromPercent(percent) : "—";

                  return (
                    <TableRow key={student.id}>
                      <TableCell className="sticky left-0 bg-card z-10 font-medium">
                        {student.last_name}, {student.first_name}
                      </TableCell>
                      {subjects.map((sub) => (
                        <TableCell key={sub.id} className="p-1">
                          <Input
                            type="number"
                            min="0"
                            max={maxFor(sub.id)}
                            className="h-8 w-full text-center text-sm"
                            value={getScore(student.id, sub.id)}
                            onChange={(e) => updateScore(student.id, sub.id, e.target.value)}
                            placeholder="—"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-medium">
                        {percent != null ? `${percent.toFixed(1)}%` : "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge variant="secondary" className={
                          grade === "A+" || grade === "A" ? "status-paid" :
                          grade === "B" || grade === "C" ? "status-pending" :
                          grade === "F" ? "status-overdue" : ""
                        }>
                          {grade}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {(() => {
                          const att = attendanceByStudent[student.id];
                          if (!att || att.total === 0) return "—";
                          return `${Math.round((att.present / att.total) * 100)}% (${att.present}/${att.total})`;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setReportCardStudent(student.id)}>
                          <Printer className="mr-1 h-3 w-3" /> Report
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Linked Approvals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {approvals.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No approval requests are linked to this exam.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Raised</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate("/approvals")}>
                      <TableCell className="capitalize">{a.type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-muted-foreground">{a.description}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={
                          a.status === "approved" ? "status-paid" : a.status === "rejected" ? "status-overdue" : "status-pending"
                        }>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              {exam.name} and every score recorded against it will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDeleteExam(); }}
            >
              Delete exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
