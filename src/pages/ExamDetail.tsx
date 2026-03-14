import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Printer, ArrowLeft, BookOpen } from "lucide-react";
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

function computeGrade(score: number, maxScore: number): string {
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  if (pct >= 40) return "E";
  return "F";
}

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

  // Fetch subjects
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("subjects").select("*").eq("school_id", schoolId).eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!schoolId,
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
        .map((e: any) => e.students)
        .filter((s: any) => s.status === "active")
        .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name));
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
    if (existingScores.length === 0 && scores.size > 0) return;
    const map = new Map<string, ScoreEntry>();
    existingScores.forEach((s: any) => {
      const key = `${s.student_id}-${s.subject_id}`;
      map.set(key, {
        studentId: s.student_id,
        subjectId: s.subject_id,
        score: s.score != null ? String(s.score) : "",
        existingId: s.id,
      });
    });
    setScores(map);
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
  if (!exam) return <EmptyState icon={BookOpen} title="Exam not found" description="This exam doesn't exist or you don't have access." />;

  // Show report card view
  if (reportCardStudent) {
    const student = students.find((s: any) => s.id === reportCardStudent);
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
            <EmptyState icon={BookOpen} title="No subjects configured" description="Add subjects in Settings before entering scores." />
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={BookOpen} title="No students enrolled" description="No students are enrolled in this class for the selected period." />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Student</TableHead>
                  {subjects.map((sub: any) => (
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
                {students.map((student: any) => {
                  const avg = studentAverages[student.id];
                  const averageScore = avg ? avg.total / avg.count : null;
                  const grade = averageScore != null ? computeGrade(averageScore, exam.max_score) : "—";

                  return (
                    <TableRow key={student.id}>
                      <TableCell className="sticky left-0 bg-card z-10 font-medium">
                        {student.last_name}, {student.first_name}
                      </TableCell>
                      {subjects.map((sub: any) => (
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
