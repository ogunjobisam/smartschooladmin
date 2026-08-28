import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, GraduationCap, Printer, Receipt, CalendarCheck, Info } from "lucide-react";

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

/**
 * What a student sees when they sign in.
 *
 * Deliberately their own record only — results, attendance and fees. Row-level
 * security enforces that; this page just presents it.
 */
export default function StudentPortal() {
  const { user } = useAuth();
  const { formatMoney, currency } = useCurrency();

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
      className: student?.enrolments?.[0]?.classes?.name || "—",
      term: invoice.academic_periods?.name || "—",
      schoolName: student?.schools?.name || "",
      schoolAddress: student?.schools?.address,
      schoolEmail: student?.schools?.email,
      schoolPhone: student?.schools?.phone,
      logoUrl: student?.schools?.logo_url,
      items: (lineItems || []).map((item) => ({
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

  const className = student.enrolments?.[0]?.classes?.name || "—";

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-accent" /> Your fees
          </CardTitle>
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
