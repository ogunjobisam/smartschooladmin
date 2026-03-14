import { ArrowLeft, Download, Printer, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

const invoice = {
  id: 'INV-2026-0002', student: 'Fatima Suleiman', studentId: 'STU-002',
  class: 'JSS3', school: 'Bright Future Academy — Ikeja Campus',
  term: 'Term 2 2026', issueDate: '2026-01-15', dueDate: '2026-02-15',
  status: 'pending' as const,
};

const lineItems = [
  { description: 'Tuition Fee', amount: 200_000_00 },
  { description: 'Books & Materials', amount: 35_000_00 },
  { description: 'Transport (Bus Service)', amount: 40_000_00 },
  { description: 'Feeding', amount: 25_000_00 },
  { description: 'Exam Fee', amount: 10_000_00 },
];

const paymentHistory = [
  { id: 'PAY-003', date: '2026-02-20', amount: 200_000_00, method: 'POS', ref: 'POS-77219' },
];

const totalAmount = lineItems.reduce((sum, i) => sum + i.amount, 0);
const totalPaid = paymentHistory.reduce((sum, p) => sum + p.amount, 0);

export default function InvoiceDetail() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/invoices"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Invoices</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{invoice.id}</span>
      </div>

      {/* Invoice Header */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xl font-bold text-card-foreground">{invoice.id}</h2>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-muted-foreground">{invoice.student} ({invoice.studentId}) • {invoice.class}</p>
            <p className="text-sm text-muted-foreground">{invoice.school}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"><Printer className="h-3.5 w-3.5" /> Print</Button>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Download PDF</Button>
            <Link to="/payments/new"><Button size="sm" className="gap-1.5">Record Payment</Button></Link>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div><span className="text-muted-foreground">Term:</span> <span className="font-medium">{invoice.term}</span></div>
          <div><span className="text-muted-foreground">Issued:</span> <span className="tabular-nums">{invoice.issueDate}</span></div>
          <div><span className="text-muted-foreground">Due:</span> <span className="tabular-nums">{invoice.dueDate}</span></div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Line Items</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item, i) => (
              <TableRow key={i}>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-5 py-3 space-y-1">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-mono font-bold tabular-nums">{formatNaira(totalAmount)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid</span><span className="font-mono tabular-nums text-success">{formatNaira(totalPaid)}</span></div>
          <div className="flex justify-between text-sm font-bold"><span>Balance Due</span><span className="font-mono tabular-nums text-destructive">{formatNaira(totalAmount - totalPaid)}</span></div>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Payment History</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Payment ID</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Method</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentHistory.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                <TableCell className="tabular-nums">{p.date}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(p.amount)}</TableCell>
                <TableCell>{p.method}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.ref}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
