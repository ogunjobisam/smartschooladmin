import { useMemo } from "react";
import { CalendarCheck, ClipboardList } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStudentPerformanceData } from "@/hooks/use-performance-data";

/**
 * A child's own register and results, read from the very same attendance and
 * score records the school's own staff and the group owner see. Read only —
 * a parent can look, never change.
 */
export function ChildRecords({ studentId }: { studentId: string }) {
  const { scores, attendance, isLoading } = useStudentPerformanceData(studentId);

  const register = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    (attendance || []).forEach((r) => {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
    });
    const total = counts.present + counts.absent + counts.late + counts.excused;
    const rate = total ? Math.round(((counts.present + counts.late) / total) * 100) : null;
    const recent = [...(attendance || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    return { counts, total, rate, recent };
  }, [attendance]);

  const results = useMemo(() => {
    const byExam = new Map<string, { name: string; period: string; date: string | null; rows: typeof scores }>();
    (scores || []).forEach((s) => {
      const entry = byExam.get(s.examId) ?? { name: s.examName, period: s.periodName, date: s.examDate, rows: [] };
      entry.rows = [...entry.rows, s];
      byExam.set(s.examId, entry);
    });
    return [...byExam.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [scores]);

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-accent" /> Attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {register.total === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No attendance has been marked for your child yet.
            </p>
          ) : (
            <>
              <div>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-muted-foreground">Days attended</p>
                  <p className="font-mono text-2xl font-bold tabular-nums">{register.rate}%</p>
                </div>
                <Progress value={register.rate ?? 0} className="mt-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {register.counts.present} present · {register.counts.late} late ·{" "}
                  {register.counts.absent} absent · {register.counts.excused} excused
                  {" "}across {register.total} marked days
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Most recent days</p>
                <div className="flex flex-wrap gap-1.5">
                  {register.recent.map((r) => (
                    <Badge key={r.date} variant="outline" className="text-xs font-normal">
                      {new Date(r.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })} ·{" "}
                      {r.status}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-accent" /> Exam results
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No results have been released for your child yet.
            </p>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto">
              {results.map((exam) => (
                <div key={exam.name + (exam.date ?? "")} className="border-b last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-1 px-4 py-2">
                    <p className="text-sm font-medium">{exam.name}</p>
                    <p className="text-xs text-muted-foreground">{exam.period}</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Subject</TableHead>
                        <TableHead className="text-right text-xs">Score</TableHead>
                        <TableHead className="text-right text-xs">Percent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exam.rows.map((r) => {
                        const percent =
                          r.score !== null && r.maxScore > 0
                            ? Math.round((r.score / r.maxScore) * 100)
                            : null;
                        return (
                          <TableRow key={r.subjectId + r.examId}>
                            <TableCell className="text-sm">{r.subjectName}</TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {r.score ?? "—"} / {r.maxScore}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {percent === null ? "—" : `${percent}%`}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
