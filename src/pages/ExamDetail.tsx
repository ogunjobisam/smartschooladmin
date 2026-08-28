import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gradeForScore as computeGrade } from "@/lib/performance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Printer, ArrowLeft, BookOpen, FileDown } from "lucide-react";
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
  const { schoolId, user } = useAuth();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Map<string, ScoreEntry>>(new Map());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reportCardStudent, setReportCardStudent] = useState<string | null>(null);
  const { branding } = useSchoolBranding();

  const handlePrintAllReportCards = () => {
    if (!exam || students.length === 0) return;
    const win = window.open("", "_blank");
    if (!win) return;

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));

    const pages = students.map((student) => {
      const studentScores = Array.from(scores.values())
        .filter((s) => s.studentId === student.id && s.score !== "")
        .map((s) => ({
          subjectId: s.subjectId,
          score: parseFloat(s.score),
          grade: computeGrade(parseFloat(s.score), exam.max_score),
        }));

      const totalScore = studentScores.reduce((sum, s) => sum + s.score, 0);
      const average = studentScores.length > 0 ? totalScore / studentScores.length : 0;
      const pct = (average / exam.max_score) * 100;
      const overallGrade = studentScores.length > 0 ? computeGrade(average, exam.max_score) : "N/A";

      const rows = studentScores.map((s, idx) => {
        const sub = subjectMap.get(s.subjectId);
        const p = ((s.score / exam.max_score) * 100).toFixed(1);
        return `<tr><td>${idx + 1}</td><td>${sub?.name || "Unknown"}</td><td class="text-center">${s.score}</td><td class="text-center">${exam.max_score}</td><td class="text-center">${p}%</td><td class="text-center">${s.grade}</td></tr>`;
      }).join("");

      return `
        <div class="page">
          <div class="header">
            <h1>${branding.name}</h1>
            ${branding.tagline ? `<p>${branding.tagline}</p>` : ""}
            <p style="font-weight:600;margin-top:4px">STUDENT REPORT CARD</p>
            <p>${exam.name} • ${exam.academic_periods?.name || ""}</p>
          </div>
          <div class="student-info">
            <div><span class="label">Student Name: </span><strong>${student.first_name} ${student.last_name}</strong></div>
            <div><span class="label">Student ID: </span><strong>${student.student_id_number || "N/A"}</strong></div>
            <div><span class="label">Class: </span><strong>${exam.classes?.name || "—"}</strong></div>
            <div><span class="label">Term/Period: </span><strong>${exam.academic_periods?.name || "—"}</strong></div>
          </div>
          <table><thead><tr><th>#</th><th>Subject</th><th class="text-center">Score</th><th class="text-center">Max</th><th class="text-center">%</th><th class="text-center">Grade</th></tr></thead><tbody>${rows}</tbody></table>
          <div class="summary"><div class="summary-grid">
            <div><div class="summary-value">${totalScore}</div><div class="summary-label">Total Score</div></div>
            <div><div class="summary-value">${average.toFixed(1)}</div><div class="summary-label">Average</div></div>
            <div><div class="summary-value">${overallGrade}</div><div class="summary-label">Overall Grade</div></div>
          </div></div>
          <div class="footer"><div><div class="sign-line">Class Teacher's Signature</div></div><div><div class="sign-line">Principal's Signature & Stamp</div></div></div>
        </div>`;
    }).join("");

    win.document.write(`<html><head><title>Report Cards - ${exam.name}</title><style>
      body { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; margin: 0; }
      .page { padding: 32px; max-width: 800px; margin: 0 auto; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px double #1e293b; }
      .header h1 { font-size: 22px; margin: 0 0 4px; }
      .header p { font-size: 12px; color: #64748b; margin: 2px 0; }
      .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 13px; }
      .label { color: #64748b; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 600; border: 1px solid #e2e8f0; }
      td { padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 13px; }
      .text-center { text-align: center; }
      .summary { background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; text-align: center; }
      .summary-value { font-size: 24px; font-weight: 700; }
      .summary-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
      .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 12px; }
      .sign-line { border-top: 1px solid #1e293b; padding-top: 4px; margin-top: 40px; }
      @media print { .page { padding: 16px; } }
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

  // Fetch subjects assigned to the exam's class (falls back to all school subjects)
  const { data: subjects = [] } = useQuery({
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

  // Fetch enrolled students for the exam's class
  const { data: students = [] } = useQuery({
    queryKey: ["exam-students", exam?.class_id, exam?.academic_period_id],
    queryFn: async () => {
      if (!exam?.class_id) return [];
      let q = supabase
        .from("enrolments")
        .select("student_id, students!inner(id, first_name, last_name, student_id_number, status)")
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
    const maxScore = exam?.max_score || 100;

    const records = entries.map((e) => ({
      exam_id: id,
      student_id: e.studentId,
      subject_id: e.subjectId,
      score: parseFloat(e.score) || 0,
      grade: computeGrade(parseFloat(e.score) || 0, maxScore),
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
      queryClient.invalidateQueries({ queryKey: ["exam-scores", id] });
    }
  };

  // Student averages
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

  // Show report card view
  if (reportCardStudent) {
    const student = students.find((s) => s.id === reportCardStudent);
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
            grade: computeGrade(parseFloat(s.score), exam.max_score),
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
        description={`${exam.classes?.name || "All Classes"} • ${exam.academic_periods?.name || ""} • Max Score: ${exam.max_score}`}
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
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Save Scores
            </Button>
          )}
        </div>
      </PageHeader>

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
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[80px]">Average</TableHead>
                  <TableHead className="text-center min-w-[60px]">Grade</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => {
                  const avg = studentAverages[student.id];
                  const averageScore = avg ? avg.total / avg.count : null;
                  const grade = averageScore != null ? computeGrade(averageScore, exam.max_score) : "—";

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
                            max={exam.max_score}
                            className="h-8 w-full text-center text-sm"
                            value={getScore(student.id, sub.id)}
                            onChange={(e) => updateScore(student.id, sub.id, e.target.value)}
                            placeholder="—"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-medium">
                        {averageScore != null ? averageScore.toFixed(1) : "—"}
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
    </div>
  );
}
