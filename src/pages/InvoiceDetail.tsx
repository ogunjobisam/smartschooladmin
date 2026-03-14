import { ArrowLeft, Download, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/use-currency";
import { printInvoice } from "@/lib/print-documents";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { formatMoney } = useCurrency();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*, students(first_name, last_name, student_id_number, enrolments(classes(name))), academic_periods(name), schools(name, address, email, phone, logo_url)")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: lineItems } = useQuery({
    queryKey: ["invoice-items", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_items")
        .select("id, description, amount, fee_categories(name)")
        .eq("invoice_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: paymentHistory } = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_allocations")
        .select("id, amount, payments(id, payment_date, payment_method, reference_number)")
        .eq("invoice_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading || !invoice) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const student = invoice.students;
  const studentName = student ? `${student.first_name} ${student.last_name}` : "—";
  const className = student?.enrolments?.[0]?.classes?.name || "—";
  const totalPaid = paymentHistory?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
  const balance = (invoice.total_amount || 0) - totalPaid;

  const formatMethod = (m: string) => m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());

  const handlePrint = () => {
    printInvoice({
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      issuedAt: invoice.issued_at,
      dueDate: invoice.due_date,
      schoolName: invoice.schools?.name || "School",
      schoolAddress: invoice.schools?.address,
      schoolEmail: invoice.schools?.email,
      schoolPhone: invoice.schools?.phone,
      logoUrl: invoice.schools?.logo_url,
      studentName,
      studentId: student?.student_id_number || "—",
      className,
      periodName: invoice.academic_periods?.name || "—",
      lineItems: (lineItems || []).map((i: any) => ({
        description: i.description,
        category: i.fee_categories?.name || "—",
        amount: i.amount,
      })),
      totalAmount: invoice.total_amount || 0,
      totalPaid,
      balance,
      payments: (paymentHistory || []).map((pa: any) => ({
        date: pa.payments?.payment_date ? new Date(pa.payments.payment_date).toLocaleDateString() : "—",
        amount: pa.amount,
        method: pa.payments?.payment_method ? formatMethod(pa.payments.payment_method) : "—",
        reference: pa.payments?.reference_number || "—",
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/invoices"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Invoices</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{invoice.invoice_number}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xl font-bold text-card-foreground">{invoice.invoice_number}</h2>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-muted-foreground">{studentName} ({student?.student_id_number || "—"}) • {className}</p>
            <p className="text-sm text-muted-foreground">{invoice.schools?.name || "—"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}><Printer className="h-3.5 w-3.5" /> Print</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}><Download className="h-3.5 w-3.5" /> Download PDF</Button>
            <Link to="/payments/new"><Button size="sm" className="gap-1.5">Record Payment</Button></Link>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div><span className="text-muted-foreground">Period:</span> <span className="font-medium">{invoice.academic_periods?.name || "—"}</span></div>
          <div><span className="text-muted-foreground">Issued:</span> <span className="tabular-nums">{new Date(invoice.issued_at).toLocaleDateString()}</span></div>
          <div><span className="text-muted-foreground">Due:</span> <span className="tabular-nums">{invoice.due_date || "—"}</span></div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Line Items</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems?.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No line items.</TableCell></TableRow>
            ) : (
              lineItems?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-muted-foreground">{item.fee_categories?.name || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(item.amount)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t px-5 py-3 space-y-1">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-mono font-bold tabular-nums">{formatNaira(invoice.total_amount)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid</span><span className="font-mono tabular-nums text-success">{formatNaira(totalPaid)}</span></div>
          <div className="flex justify-between text-sm font-bold"><span>Balance Due</span><span className={`font-mono tabular-nums ${balance > 0 ? 'text-destructive' : ''}`}>{formatNaira(balance)}</span></div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Payment History</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Method</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentHistory?.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No payments recorded.</TableCell></TableRow>
            ) : (
              paymentHistory?.map((pa: any) => (
                <TableRow key={pa.id}>
                  <TableCell className="tabular-nums">{pa.payments?.payment_date ? new Date(pa.payments.payment_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(pa.amount)}</TableCell>
                  <TableCell>{pa.payments?.payment_method ? formatMethod(pa.payments.payment_method) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{pa.payments?.reference_number || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
