import { supabase } from "@/integrations/supabase/client";
import { printTranscript } from "@/lib/print-documents";
import { displayClassName } from "@/lib/sections";

/**
 * Fetch everything a transcript or term report card needs for one student and
 * open the branded printable document. Shared by the student portal, the
 * parent portal and the staff student profile so all three print the same
 * document from the same data.
 *
 * Callers must already be entitled to the student (own record, own child, or
 * staff) — row-level security enforces that on each query below.
 */
export async function printStudentTranscript(
  studentId: string,
  options?: { periodId?: string; periodName?: string }
) {
  const { data: student } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, student_id_number, date_of_birth, gender, created_at, school_id, enrolments(classes(name)), schools(name, address, email, phone, logo_url)"
    )
    .eq("id", studentId)
    .maybeSingle();
  if (!student) throw new Error("Student record not found");

  let scoresQuery = supabase
    .from("student_scores")
    .select("score, grade, subjects(name), exams!inner(name, max_score, exam_date, academic_period_id, academic_periods(name))")
    .eq("student_id", studentId);
  if (options?.periodId) {
    scoresQuery = scoresQuery.eq("exams.academic_period_id", options.periodId);
  }
  const { data: scores } = await scoresQuery;

  const { data: awards } = await supabase
    .from("student_awards")
    .select("title, description, award_date, academic_periods(name)")
    .eq("student_id", studentId)
    .order("award_date", { ascending: false });

  const { data: attendance } = await supabase
    .from("attendance_records")
    .select("status")
    .eq("student_id", studentId);

  const isReportCard = !!options?.periodId;
  printTranscript({
    schoolName: student.schools?.name || "School",
    schoolAddress: student.schools?.address,
    schoolEmail: student.schools?.email,
    schoolPhone: student.schools?.phone,
    logoUrl: student.schools?.logo_url,
    studentName: `${student.first_name} ${student.last_name}`,
    studentIdNumber: student.student_id_number || "—",
    className: displayClassName(student.enrolments?.[0]?.classes?.name) || "—",
    dateOfBirth: student.date_of_birth,
    gender: student.gender,
    enrolmentDate: student.created_at,
    scores: (scores || []).map((s) => ({
      examName: s.exams?.name || "—",
      examDate: s.exams?.exam_date || null,
      subjectName: s.subjects?.name || "—",
      score: s.score,
      maxScore: s.exams?.max_score || 100,
      grade: s.grade,
      periodName: s.exams?.academic_periods?.name || "Unassigned",
    })),
    attendanceTotal: attendance?.length || 0,
    attendancePresent: (attendance || []).filter((a) => a.status === "present").length,
    awards: (awards || []).map((a) => ({
      title: a.title,
      description: a.description,
      date: a.award_date,
      periodName: a.academic_periods?.name || null,
    })),
    documentTitle: isReportCard ? `Report Card — ${options?.periodName || "Term"}` : undefined,
    documentKicker: isReportCard ? "End of term" : undefined,
  });
}
