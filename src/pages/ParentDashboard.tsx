import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useCurrency } from "@/hooks/use-currency";
import { printInvoice } from "@/lib/print-documents";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  GraduationCap, CreditCard, FileText, Receipt, Printer, Eye, Wallet
} from "lucide-react";
import { Link } from "react-router-dom";
import { PayInvoiceDialog } from "@/components/payments/PayInvoiceDialog";

export default function ParentDashboard() {
  const { user } = useAuth();
  const { formatMoney, currency } = useCurrency();
  const [payInvoice, setPayInvoice] = useState<any>(null);

  // Find guardian record linked to this user
  const { data: guardian, isLoading: guardianLoading } = useQuery({
    queryKey: ["parent-guardian", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("guardians")
        .select("id, first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Find children linked to this guardian
  const { data: children, isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children", guardian?.id],
    queryFn: async () => {
      if (!guardian?.id) return [];
      const { data } = await supabase
        .from("student_guardians")
        .select("relationship, students(id, first_name, last_name, student_id_number, status, school_id, enrolments(classes(name)), schools(name))")
        .eq("guardian_id", guardian.id);
      return (data || []).map((sg: any) => ({ ...sg.students, relationship: sg.relationship }));
    },
    enabled: !!guardian?.id,
  });

  // Get invoices for all children
  const studentIds = children?.map((c: any) => c.id) || [];
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["parent-invoices", studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, due_date, issued_at, student_id, school_id, students(id, first_name, last_name, student_id_number, enrolments(classes(name))), schools(id, name, address, email, phone, logo_url), academic_periods(name)")
        .in("student_id", studentIds)
        .order("issued_at", { ascending: false });
      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  // Get payments for all children
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["parent-payments", studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from("payments")
        .select("id, amount, payment_date, payment_method, reference_number, students(first_name, last_name)")
        .in("student_id", studentIds)
        .order("payment_date", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  const isLoading = guardianLoading || childrenLoading;

  const totalBilled = invoices?.reduce((s, i: any) => s + (i.total_amount || 0), 0) || 0;
  const totalPaid = invoices?.reduce((s, i: any) => s + (i.amount_paid || 0), 0) || 0;
  const pendingInvoices = invoices?.filter((i: any) => i.status === "pending" || i.status === "overdue").length || 0;

  const formatMethod = (m: string) => m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  const displayName = user?.user_metadata?.full_name || guardian ? `${guardian?.first_name} ${guardian?.last_name}` : "Parent";

  const handlePrintInvoice = async (inv: any) => {
    // Fetch line items for this invoice
    const { data: lineItems } = await supabase
      .from("invoice_items")
      .select("description, amount, fee_categories(name)")
      .eq("invoice_id", inv.id);

    const student = inv.students;
    printInvoice({
      invoiceNumber: inv.invoice_number,
      status: inv.status,
      issuedAt: inv.issued_at,
      dueDate: inv.due_date,
      schoolName: inv.schools?.name || "School",
      schoolAddress: inv.schools?.address,
      schoolEmail: inv.schools?.email,
      schoolPhone: inv.schools?.phone,
      logoUrl: inv.schools?.logo_url,
      studentName: student ? `${student.first_name} ${student.last_name}` : "—",
      studentId: student?.student_id_number || "—",
      className: student?.enrolments?.[0]?.classes?.name || "—",
      periodName: inv.academic_periods?.name || "—",
      lineItems: (lineItems || []).map((i: any) => ({
        description: i.description,
        category: i.fee_categories?.name || "—",
        amount: i.amount,
      })),
      totalAmount: inv.total_amount || 0,
      totalPaid: inv.amount_paid || 0,
      balance: (inv.total_amount || 0) - (inv.amount_paid || 0),
      payments: [],
      currency,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }

  if (!guardian) {
    return (
      <div className="space-y-6">
        <PageHeader title="Parent Portal" description="View your children's school information." />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Account Not Linked</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Your account hasn't been linked to a guardian record yet. Please contact your school administrator to link your account.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${displayName.split(" ")[0]}`}
        description="View your children's invoices and payment history."
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Children Enrolled" value={(children?.length || 0).toString()} icon={GraduationCap} />
        <StatCard title="Total Outstanding" value={formatMoney(totalBilled - totalPaid)} icon={Receipt} mono subtitle={`${pendingInvoices} pending invoices`} />
        <StatCard title="Total Paid" value={formatMoney(totalPaid)} icon={CreditCard} mono />
      </div>

      {/* Children */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your Children</CardTitle>
        </CardHeader>
        <CardContent>
          {children?.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No children linked to your account.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {children?.map((child: any) => (
                <div key={child.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                    <GraduationCap className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{child.first_name} {child.last_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.enrolments?.[0]?.classes?.name || "—"} • {child.schools?.name || "—"}
                    </p>
                  </div>
                  <StatusBadge status={child.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-accent" /> Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Invoice #</TableHead>
                <TableHead className="text-xs">Student</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs text-right">Balance</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))
              ) : invoices?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No invoices yet.</TableCell></TableRow>
              ) : (
                invoices?.map((inv: any) => {
                  const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</TableCell>
                      <TableCell className="font-medium text-sm">{inv.students?.first_name} {inv.students?.last_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(inv.total_amount)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm tabular-nums ${balance > 0 ? "text-destructive" : "text-success"}`}>{formatMoney(balance)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {balance > 0 && (
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setPayInvoice(inv)}>
                              <Wallet className="h-3 w-3" /> Pay
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintInvoice(inv)}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-accent" /> Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Student</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
                <TableHead className="text-xs">Method</TableHead>
                <TableHead className="text-xs">Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))
              ) : payments?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No payments yet.</TableCell></TableRow>
              ) : (
                payments?.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="tabular-nums text-sm">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium text-sm">{p.students?.first_name} {p.students?.last_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(p.amount)}</TableCell>
                    <TableCell className="text-sm">{formatMethod(p.payment_method)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.reference_number || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {payInvoice && (
        <PayInvoiceDialog
          open={!!payInvoice}
          onOpenChange={(open) => { if (!open) setPayInvoice(null); }}
          invoice={{
            id: payInvoice.id,
            invoice_number: payInvoice.invoice_number,
            total_amount: payInvoice.total_amount,
            amount_paid: payInvoice.amount_paid,
            student_id: payInvoice.student_id,
            school_id: payInvoice.school_id,
          }}
        />
      )}
    </div>
  );
}
