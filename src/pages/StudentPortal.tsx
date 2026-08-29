import { displayClassName } from "@/lib/sections";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, GraduationCap, Printer, Receipt, CalendarCheck, Info, ArrowRight, CalendarClock, FileText } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PerformanceSummary } from "@/components/performance/PerformanceSummary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { useStudentPerformanceData } from "@/hooks/use-performance-data";
import { summariseStudent } from "@/lib/performance";
import { printInvoice } from "@/lib/print-documents";
import { UpcomingEvents } from "@/components/events/UpcomingEvents";
import { NoticeBoard } from "@/components/notices/NoticeBoard";
import { TransportRiderCard } from "@/components/transport/TransportRiderCard";
import { RecognitionsPanel } from "@/components/achievements/RecognitionsPanel";
import { AchievementHighlights } from "@/components/achievements/AchievementHighlights";
import { StatementDialog } from "@/components/finance/StatementDialog";

/**
 * What a student sees when they sign in.
 *
 * Deliberately their own record only — results, attendance and fees. Row-level
 * security enforces that; this page just presents it.
 */
export default function StudentPortal() {
  const { user } = useAuth();
  const { formatMoney, currency } = useCurrency();
  const [statementOpen, setStatementOpen] = useState(false);

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["student-portal-self", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, student_id_number, status, school_id, enrolments(classes(name)), schools(id, name, address, email, phone, logo_url)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const studentId = student?.id;

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["student-portal-invoices", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, due_date, issued_at, student_id, school_id, academic_periods(name)")
        .eq("student_id", studentId!)
        .order("issued_at", { ascending: false });
      return data || [];
    },
    enabled: !!studentId,
  });

  const { scores, attendance, isLoading: performanceLoading } = useStudentPerformanceData(studentId);
  const performance = useMemo(
    () => summariseStudent(studentId ?? "", scores, attendance),
    [studentId, scores, attendance]
  );

  const totalBilled = invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
  const outstanding = totalBilled - totalPaid;

  /** The soonest deadline that still has money against it — what a student needs to know. */
  const nextDue = invoices
    .filter((i) => (i.total_amount || 0) - (i.amount_paid || 0) > 0 && !!i.due_date)
    .map((i) => i.due_date as string)
    .sort()[0];
  const unpaidCount = invoices.filter((i) => (i.total_amount || 0) - (i.amount_paid || 0) > 0).length;
  const daysToDue = nextDue
    ? Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86_400_000)
    : null;

  const handlePrintInvoice = async (invoice: (typeof invoices)[number]) => {
    const { data: lineItems } = await supabase
      .from("invoice_items")
      .select("description, amount, fee_categories(name)")
      .eq("invoice_id", invoice.id);

    printInvoice({
      invoiceNumber: invoice.invoice_number,
      issuedAt: invoice.issued_at,
      dueDate: invoice.due_date,
      status: invoice.status,
      studentName: `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim(),
      studentId: student?.student_id_number || "",
      className: displayClassName(student?.enrolments?.[0]?.classes?.name) || "—",
      periodName: invoice.academic_periods?.name || "—",
      schoolName: student?.schools?.name || "",
      schoolAddress: student?.schools?.address,
      schoolEmail: student?.schools?.email,
      schoolPhone: student?.schools?.phone,
      logoUrl: student?.schools?.logo_url,
      lineItems: (lineItems || []).map((item) => ({
        description: item.description,
        category: item.fee_categories?.name || "—",
        amount: item.amount,
      })),
      totalAmount: invoice.total_amount || 0,
      totalPaid: invoice.amount_paid || 0,
      balance: (invoice.total_amount || 0) - (invoice.amount_paid || 0),
      payments: [],
      currency,
    });
  };

  if (studentLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="space-y-6">
        <PageHeader title="Student Portal" description="Your results, attendance and fees." />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Account not linked</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Your sign-in has not been attached to a student record yet. Ask your school
              office to link it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const className = displayClassName(student.enrolments?.[0]?.classes?.name) || "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${student.first_name}`}
        description={`${className} · ${student.schools?.name ?? ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Overall average"
          value={performance.average === null ? "—" : `${performance.average}%`}
          icon={GraduationCap}
          mono
          subtitle={performance.average === null ? "No results yet" : `Grade ${performance.grade}`}
        />
        <StatCard
          title="Attendance"
          value={performance.attendance.rate === null ? "—" : `${performance.attendance.rate}%`}
          icon={CalendarCheck}
          mono
          subtitle={`${performance.attendance.present + performance.attendance.late} days present`}
        />
        <StatCard
          title="Fees outstanding"
          value={formatMoney(outstanding)}
          icon={Receipt}
          mono
          subtitle={`${formatMoney(totalPaid)} paid`}
        />
      </div>

      {/* My fees — the three numbers a student is asked about at home, and a way
          straight through to the detail. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-accent" /> My fees
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current balance</p>
            <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${outstanding > 0 ? "text-destructive" : "text-success"}`}>
              {formatMoney(Math.max(outstanding, 0))}
            </p>
            <p className="text-xs text-muted-foreground">
              {unpaidCount === 0 ? "Nothing outstanding" : `${unpaidCount} invoice${unpaidCount === 1 ? "" : "s"} to settle`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Next due date</p>
            <p className="mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums">
              <CalendarClock className="h-4 w-4 text-accent" />
              {nextDue ? new Date(nextDue).toLocaleDateString() : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {daysToDue === null
                ? "No upcoming deadline"
                : daysToDue < 0
                  ? `${Math.abs(daysToDue)} day${Math.abs(daysToDue) === 1 ? "" : "s"} overdue`
                  : `In ${daysToDue} day${daysToDue === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href="#my-invoices">My invoices <ArrowRight className="h-3.5 w-3.5" /></a>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setStatementOpen(true)}>
              <FileText className="h-3.5 w-3.5" /> Statement of account
            </Button>
          </div>
        </CardContent>
      </Card>

      <NoticeBoard />

      {studentId && <TransportRiderCard studentIds={[studentId]} />}

      <div className="grid gap-6 xl:grid-cols-2">
        <UpcomingEvents />
        <AchievementHighlights limit={4} title="School achievements" />
      </div>

      {studentId && <RecognitionsPanel subjectType="student" personId={studentId} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-accent" /> Your results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceSummary performance={performance} isLoading={performanceLoading} />
        </CardContent>
      </Card>

      <Card id="my-invoices" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-accent" /> Your fees
          </CardTitle>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setStatementOpen(true)}>
            <FileText className="h-3 w-3" /> Statement
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Invoice</TableHead>
                <TableHead className="text-xs">Term</TableHead>
                <TableHead className="text-right text-xs">Amount</TableHead>
                <TableHead className="text-right text-xs">Balance</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice) => {
                  const balance = (invoice.total_amount || 0) - (invoice.amount_paid || 0);
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{invoice.invoice_number}</TableCell>
                      <TableCell className="text-sm">{invoice.academic_periods?.name || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(invoice.total_amount || 0)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm tabular-nums ${balance > 0 ? "text-destructive" : "text-success"}`}>
                        {formatMoney(balance)}
                      </TableCell>
                      <TableCell><StatusBadge status={invoice.status} /></TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handlePrintInvoice(invoice)}>
                          <Printer className="h-3 w-3" /> Invoice
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {outstanding > 0 && (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Paying fees</p>
              <p className="text-muted-foreground">
                Print an invoice above and pay through your school's usual channel. Payments
                show here once the school records them.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-accent" /> Attendance summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Present", value: performance.attendance.present },
              { label: "Absent", value: performance.attendance.absent },
              { label: "Late", value: performance.attendance.late },
              { label: "Excused", value: performance.attendance.excused },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-mono text-xl font-semibold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
