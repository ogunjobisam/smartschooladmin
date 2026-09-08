import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { displayClassName } from "@/lib/sections";

interface Props {
  classIds: string[];
  classNameById: Record<string, string>;
}

interface SubjectStat {
  subject: string;
  entries: number;
  average: number;
  passRate: number;
  best: number;
  weakest: number;
}

/**
 * How each of a teacher's classes is performing, subject by subject:
 * averages, pass rates and the spread between strongest and weakest.
 * Reads only scores for students the teacher teaches — row-level security
 * keeps it that way.
 */
export function ClassPerformancePanel({ classIds, classNameById }: Props) {
  const { data: enrolments = [] } = useQuery({
    queryKey: ["class-perf-enrolments", classIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrolments")
        .select("class_id, student_id")
        .in("class_id", classIds);
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((r) => {
        const key = `${r.class_id}|${r.student_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: classIds.length > 0,
  });

  const studentIds = useMemo(
    () => Array.from(new Set(enrolments.map((e) => e.student_id))),
    [enrolments]
  );

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ["class-perf-scores", studentIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_scores")
        .select("student_id, score, subjects(name), exams!inner(max_score, class_id)")
        .in("student_id", studentIds);
      if (error) throw error;
      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  const statsByClass = useMemo(() => {
    const byClass = new Map<string, Map<string, { pcts: number[] }>>();
    for (const s of scores) {
      if (s.score === null || !s.exams?.max_score || !s.exams.class_id) continue;
      const classId = s.exams.class_id;
      const subject = s.subjects?.name ?? "Unknown subject";
      if (!byClass.has(classId)) byClass.set(classId, new Map());
      const subjects = byClass.get(classId)!;
      if (!subjects.has(subject)) subjects.set(subject, { pcts: [] });
      subjects.get(subject)!.pcts.push((s.score / s.exams.max_score) * 100);
    }
    const result = new Map<string, SubjectStat[]>();
    byClass.forEach((subjects, classId) => {
      const stats: SubjectStat[] = [];
      subjects.forEach(({ pcts }, subject) => {
        const average = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
        stats.push({
          subject,
          entries: pcts.length,
          average,
          passRate: Math.round((pcts.filter((p) => p >= 50).length / pcts.length) * 100),
          best: Math.round(Math.max(...pcts)),
          weakest: Math.round(Math.min(...pcts)),
        });
      });
      result.set(classId, stats.sort((a, b) => a.subject.localeCompare(b.subject)));
    });
    return result;
  }, [scores]);

  const hasAny = Array.from(statsByClass.values()).some((s) => s.length > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-accent" /> Class performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !hasAny ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No scores entered for your classes yet — subject averages and pass rates will appear here.
          </p>
        ) : (
          classIds.map((classId) => {
            const stats = statsByClass.get(classId) || [];
            if (stats.length === 0) return null;
            return (
              <div key={classId}>
                <p className="mb-2 text-sm font-medium">{displayClassName(classNameById[classId]) || "Class"}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Subject</TableHead>
                      <TableHead className="text-right text-xs">Average</TableHead>
                      <TableHead className="text-right text-xs">Pass rate</TableHead>
                      <TableHead className="text-right text-xs">Best</TableHead>
                      <TableHead className="text-right text-xs">Weakest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((s) => (
                      <TableRow key={s.subject}>
                        <TableCell className="text-sm font-medium">{s.subject}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{s.average}%</TableCell>
                        <TableCell className={`text-right font-mono text-sm tabular-nums ${s.passRate < 50 ? "text-destructive" : ""}`}>
                          {s.passRate}%
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-success">{s.best}%</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{s.weakest}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
