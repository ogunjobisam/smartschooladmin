import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, GraduationCap, Printer } from "lucide-react";

import { ReleasedTermReports } from "@/components/exams/ReleasedTermReports";
import { WithheldNotice } from "@/components/exams/WithheldNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPerformanceData } from "@/hooks/use-performance-data";
import { gradeForScore, type ScoreRow } from "@/lib/performance";
import { printStudentTranscript } from "@/lib/student-documents";
import { toast } from "sonner";

interface PeriodGroup {
  periodId: string | null;
  periodName: string;
  exams: {
    examId: string;
    examName: string;
    examDate: string | null;
    rows: ScoreRow[];
    average: number | null;
  }[];
}

function groupByPeriod(scores: ScoreRow[]): PeriodGroup[] {
  const periods = new Map<string, PeriodGroup>();
  for (const row of scores) {
    const key = row.periodId ?? row.periodName;
    if (!periods.has(key)) {
      periods.set(key, { periodId: row.periodId, periodName: row.periodName, exams: [] });
    }
    const period = periods.get(key)!;
    let exam = period.exams.find((e) => e.examId === row.examId);
    if (!exam) {
      exam = { examId: row.examId, examName: row.examName, examDate: row.examDate, rows: [], average: null };
      period.exams.push(exam);
    }
    exam.rows.push(row);
  }
  for (const period of periods.values()) {
    for (const exam of period.exams) {
      const total = exam.rows.reduce((a, r) => a + (r.score ?? 0), 0);
      const max = exam.rows.reduce((a, r) => a + r.maxScore, 0);
      exam.average = max > 0 ? Math.round((total / max) * 100) : null;
    }
  }
  return Array.from(periods.values());
}

/**
 * A student's own results: every exam they sat, subject by subject, with the
 * report card and transcript downloads the school would otherwise have to
 * print for them.
 */
export default function MyResults() {
  const { user } = useAuth();

  const { data: me, isLoading: studentLoading } = useQuery({
    queryKey: ["my-results-student", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, student_id_number")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!user?.id,
  });
  const studentId = me?.id ?? null;

  const { scores, isLoading } = useStudentPerformanceData(studentId ?? undefined);
  const periods = useMemo(() => groupByPeriod(scores), [scores]);

  const download = async (periodId?: string, periodName?: string) => {
    if (!studentId) return;
    try {
      await printStudentTranscript(studentId, periodId ? { periodId, periodName } : undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare the document");
    }
  };

  if (studentLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My results" description="Every exam, subject by subject.">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => download()} disabled={!studentId}>
          <Download className="h-3.5 w-3.5" /> Download transcript
        </Button>
      </PageHeader>

      {me && <WithheldNotice studentId={me.id} />}

      {me && (
        <ReleasedTermReports
          studentId={me.id}
          studentName={`${me.first_name} ${me.last_name}`}
          idNumber={me.student_id_number}
        />
      )}

      {periods.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No results yet"
          description="Your exam scores will appear here once your teachers enter them."
        />
      ) : (
        periods.map((period) => (
          <Card key={period.periodId ?? period.periodName}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">{period.periodName}</CardTitle>
              {period.periodId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => download(period.periodId!, period.periodName)}
                >
                  <Printer className="h-3 w-3" /> Report card
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {period.exams.map((exam) => (
                <div key={exam.examId}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{exam.examName}</p>
                    {exam.average !== null && (
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        Average {exam.average}%
                      </Badge>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Subject</TableHead>
                        <TableHead className="text-right text-xs">Score</TableHead>
                        <TableHead className="text-center text-xs">Grade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exam.rows.map((row) => (
                        <TableRow key={`${row.examId}-${row.subjectId}`}>
                          <TableCell className="text-sm font-medium">{row.subjectName}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {row.score ?? "—"}/{row.maxScore}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{gradeForScore(row.score, row.maxScore)}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
