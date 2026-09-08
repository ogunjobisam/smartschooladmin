import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

/**
 * The shapes the two optional selects return. A role that cannot see exams or
 * finance skips the query, and the empty stand-in has to carry the same type or
 * the reducers below lose theirs.
 */
interface ExamRow {
  id: string;
  name: string;
  exam_date: string | null;
  max_score: number;
  status: string;
  class_id: string | null;
}

interface InvoiceRow {
  total_amount: number | null;
  amount_paid: number | null;
  status: string | null;
}
import { ArrowRight, CalendarCheck, GraduationCap, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { canAccessPath } from "@/lib/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { displayClassName } from "@/lib/sections";

/**
 * One combined view of the three things a school is judged on day to day:
 * who turned up, how they are doing, and whether the fees are in.
 *
 * It reads exactly the same rows the group-level view reads — attendance
 * records, exam scores and invoices for this school — so a head teacher and a
 * proprietor never see different numbers for the same school.
 */
export function SchoolSnapshot() {
  const { schoolId, userRole } = useAuth();
  const { formatMoneyCompact } = useCurrency();

  const canSeeFinance = canAccessPath(userRole, "/invoices");
  const canSeeAttendance = canAccessPath(userRole, "/attendance");
  const canSeeExams = canAccessPath(userRole, "/exams");

  const { data, isLoading } = useQuery({
    queryKey: ["school-snapshot", schoolId, canSeeFinance, canSeeAttendance, canSeeExams],
    queryFn: async () => {
      if (!schoolId) return null;

      // Last 30 days of attendance keeps a single quiet day from making the
      // whole school look absent.
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString().slice(0, 10);

      const [attendanceRes, examsRes, invoicesRes, classesRes] = await Promise.all([
        canSeeAttendance
          ? supabase
              .from("attendance_records")
              .select("status, date, class_id")
              .eq("school_id", schoolId)
              .gte("date", sinceISO)
          : Promise.resolve({ data: [] as { status: string; date: string; class_id: string | null }[] }),
        canSeeExams
          ? supabase
              .from("exams")
              .select("id, name, exam_date, max_score, status, class_id")
              .eq("school_id", schoolId)
              .order("exam_date", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as ExamRow[] }),
        canSeeFinance
          ? supabase.from("invoices").select("total_amount, amount_paid, status").eq("school_id", schoolId)
          : Promise.resolve({ data: [] as InvoiceRow[] }),
        supabase.from("classes").select("id, name").eq("school_id", schoolId),
      ]);

      const attendance = attendanceRes.data || [];
      const present = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;

      const classNames = new Map((classesRes.data || []).map((c) => [c.id, displayClassName(c.name)]));

      // Attendance by class, worst first — that is the list a head teacher acts on.
      const perClass = new Map<string, { total: number; present: number }>();
      for (const row of attendance) {
        if (!row.class_id) continue;
        const bucket = perClass.get(row.class_id) || { total: 0, present: 0 };
        bucket.total += 1;
        if (row.status === "present" || row.status === "late") bucket.present += 1;
        perClass.set(row.class_id, bucket);
      }
      const classAttendance = [...perClass.entries()]
        .map(([id, b]) => ({
          id,
          name: classNames.get(id) || "Class",
          rate: Math.round((b.present / b.total) * 100),
          total: b.total,
        }))
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 4);

      const exams = examsRes.data || [];
      let examSummaries: { id: string; name: string; className: string; date: string | null; average: number | null; entries: number }[] = [];
      if (exams.length) {
        const { data: scores } = await supabase
          .from("student_scores")
          .select("exam_id, score")
          .in("exam_id", exams.map((e) => e.id));
        const byExam = new Map<string, number[]>();
        for (const s of scores || []) {
          if (s.score === null) continue;
          const list = byExam.get(s.exam_id) || [];
          list.push(Number(s.score));
          byExam.set(s.exam_id, list);
        }
        // A teacher only sees the classes and marks they hold, so an exam for
        // another class arrives with no class name and no scores. Showing it as
        // "— —" reads like a fault, so leave those rows out.
        examSummaries = exams.map((e) => {
          const list = byExam.get(e.id) || [];
          const max = Number(e.max_score) || 100;
          const average = list.length
            ? Math.round((list.reduce((sum, v) => sum + v, 0) / list.length / max) * 100)
            : null;
          return {
            id: e.id,
            name: e.name,
            className: (e.class_id ? classNames.get(e.class_id) : null) || "—",
            date: e.exam_date,
            average,
            entries: list.length,
          };
        }).filter((e) => e.className !== "—" || e.entries > 0);
      }

      const invoices = invoicesRes.data || [];
      const billed = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
      const collected = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);

      return {
        attendanceRate,
        attendanceDays: attendance.length,
        classAttendance,
        examSummaries,
        billed,
        collected,
        outstanding: billed - collected,
        collectionRate: billed ? Math.round((collected / billed) * 100) : null,
        overdue: invoices.filter((i) => i.status === "overdue").length,
      };
    },
    enabled: !!schoolId,
  });

  if (!schoolId) return null;
  if (!canSeeAttendance && !canSeeExams && !canSeeFinance) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your school at a glance</CardTitle>
        <CardDescription>
          {canSeeFinance
            ? "Attendance, results and fees — the same figures the group owner sees."
            : "Attendance and results for the classes you hold, read from the same records as the school view."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {canSeeAttendance && (
              <section className="min-w-0 space-y-3">
                <header className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarCheck className="h-4 w-4 text-accent" /> Attendance
                  </h4>
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-accent">
                    <Link to="/attendance">Open <ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </header>
                {data?.attendanceRate === null ? (
                  <p className="text-sm text-muted-foreground">No attendance marked in the last 30 days.</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{data?.attendanceRate}%</p>
                    <p className="text-xs text-muted-foreground">Present or late, last 30 days</p>
                    <ul className="space-y-2">
                      {data?.classAttendance.map((c) => (
                        <li key={c.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{c.name}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{c.rate}%</span>
                          </div>
                          <Progress value={c.rate} className="h-1.5" />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {canSeeExams && (
              <section className="min-w-0 space-y-3">
                <header className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <GraduationCap className="h-4 w-4 text-accent" /> Recent results
                  </h4>
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-accent">
                    <Link to="/exams">Open <ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </header>
                {!data?.examSummaries.length ? (
                  <p className="text-sm text-muted-foreground">No exams recorded yet.</p>
                ) : (
                  <ul className="divide-y">
                    {data.examSummaries.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                        <Link to={`/exams/${e.id}`} className="min-w-0 hover:underline">
                          <p className="truncate text-sm font-medium">{e.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.className}
                            {e.date ? ` · ${new Date(e.date).toLocaleDateString()}` : ""}
                          </p>
                        </Link>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {e.average === null ? "—" : `${e.average}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {canSeeFinance && (
              <section className="min-w-0 space-y-3">
                <header className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Wallet className="h-4 w-4 text-accent" /> Fees
                  </h4>
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-accent">
                    <Link to="/invoices">Open <ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </header>
                {data?.collectionRate === null ? (
                  <p className="text-sm text-muted-foreground">No invoices raised yet.</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{data?.collectionRate}%</p>
                    <p className="text-xs text-muted-foreground">Of billed fees collected</p>
                    <Progress value={data?.collectionRate ?? 0} className="h-1.5" />
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Billed</dt>
                        <dd className="font-mono tabular-nums">{formatMoneyCompact(data?.billed || 0)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Collected</dt>
                        <dd className="font-mono tabular-nums">{formatMoneyCompact(data?.collected || 0)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Outstanding</dt>
                        <dd className="font-mono tabular-nums">{formatMoneyCompact(data?.outstanding || 0)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Overdue invoices</dt>
                        <dd className="tabular-nums">{data?.overdue || 0}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
