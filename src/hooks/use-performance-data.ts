import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AttendanceRow, ScoreRow } from "@/lib/performance";

interface RawScore {
  student_id: string;
  subject_id: string;
  score: number | null;
  subjects: { name: string } | null;
  exams: {
    id: string;
    name: string;
    max_score: number;
    exam_date: string | null;
    academic_period_id: string | null;
    academic_periods: { name: string } | null;
  } | null;
}

function toScoreRows(raw: RawScore[]): ScoreRow[] {
  return raw
    .filter((r) => r.exams)
    .map((r) => ({
      studentId: r.student_id,
      subjectId: r.subject_id,
      subjectName: r.subjects?.name ?? "Unknown subject",
      examId: r.exams!.id,
      examName: r.exams!.name,
      periodId: r.exams!.academic_period_id,
      periodName: r.exams!.academic_periods?.name ?? "Unassigned term",
      score: r.score,
      maxScore: r.exams!.max_score,
      examDate: r.exams!.exam_date,
    }))
    // Chronological, so trendByPeriod sees terms in the order they happened
    // rather than having to interpret term names.
    .sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? ""));
}

interface RawAttendance {
  student_id: string;
  date: string;
  status: AttendanceRow["status"];
}

function toAttendanceRows(raw: RawAttendance[]): AttendanceRow[] {
  return raw.map((r) => ({ studentId: r.student_id, date: r.date, status: r.status }));
}

const SCORE_SELECT =
  "student_id, subject_id, score, subjects(name), exams!inner(id, name, max_score, exam_date, academic_period_id, academic_periods(name))";

/** Scores and attendance for one student. */
export function useStudentPerformanceData(studentId: string | undefined) {
  const scores = useQuery({
    queryKey: ["performance-scores", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select(SCORE_SELECT)
        .eq("student_id", studentId!);
      if (error) throw error;
      return toScoreRows((data || []) as unknown as RawScore[]);
    },
    enabled: !!studentId,
  });

  const attendance = useQuery({
    queryKey: ["performance-attendance", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("student_id, date, status")
        .eq("student_id", studentId!);
      if (error) throw error;
      return toAttendanceRows(data || []);
    },
    enabled: !!studentId,
  });

  return {
    scores: scores.data ?? [],
    attendance: attendance.data ?? [],
    isLoading: scores.isLoading || attendance.isLoading,
    error: scores.error ?? attendance.error,
  };
}

export interface ClassStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_id_number: string | null;
}

/** Scores and attendance for a whole class, for the analytics page. */
export function useClassPerformanceData(classId: string | undefined, periodId: string | undefined) {
  const students = useQuery({
    queryKey: ["performance-class-students", classId, periodId],
    queryFn: async () => {
      let query = supabase
        .from("enrolments")
        .select("student_id, students!inner(id, first_name, last_name, student_id_number, status)")
        .eq("class_id", classId!);
      if (periodId) query = query.eq("academic_period_id", periodId);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || [])
        .map((e) => (e as unknown as { students: ClassStudent & { status: string } }).students)
        .filter((s) => s && s.status === "active") as ClassStudent[];
      // A pupil has one enrolment per term, so the same child can come back
      // more than once when no single term is selected.
      return Array.from(new Map(rows.map((s) => [s.id, s])).values());
    },
    enabled: !!classId,
  });

  const studentIds = (students.data ?? []).map((s) => s.id);

  const scores = useQuery({
    queryKey: ["performance-class-scores", studentIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select(SCORE_SELECT)
        .in("student_id", studentIds);
      if (error) throw error;
      return toScoreRows((data || []) as unknown as RawScore[]);
    },
    enabled: studentIds.length > 0,
  });

  const attendance = useQuery({
    queryKey: ["performance-class-attendance", studentIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("student_id, date, status")
        .in("student_id", studentIds);
      if (error) throw error;
      return toAttendanceRows(data || []);
    },
    enabled: studentIds.length > 0,
  });

  return {
    students: students.data ?? [],
    scores: scores.data ?? [],
    attendance: attendance.data ?? [],
    isLoading: students.isLoading || scores.isLoading || attendance.isLoading,
  };
}
