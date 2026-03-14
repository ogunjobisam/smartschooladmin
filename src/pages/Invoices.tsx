import { FileText, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const invoices = [
  { id: 'INV-2026-0001', student: 'Chukwuemeka Obi', class: 'SS1', amount: 350_000_00, paid: 350_000_00, status: 'paid' as const, date: '2026-01-15' },
  { id: 'INV-2026-0002', student: 'Fatima Suleiman', class: 'JSS3', amount: 310_000_00, paid: 200_000_00, status: 'pending' as const, date: '2026-01-15' },
  { id: 'INV-2026-0003', student: 'David Okoro', class: 'SS2', amount: 360_000_00, paid: 0, status: 'overdue' as const, date: '2026-01-15' },
  { id: 'INV-2026-0004', student: 'Grace Ademola', class: 'JSS1', amount: 285_000_00, paid: 285_000_00, status: 'paid' as const, date: '2026-01-15' },
  { id: 'INV-2026-0005', student: 'Ibrahim Musa', class: 'SS3', amount: 380_000_00, paid: 100_000_00, status: 'overdue' as const, date: '2026-01-15' },
  { id: 'INV-2026-0006', student: 'Aisha Mohammed', class: 'JSS1', amount: 285_000_00, paid: 285_000_00, status: 'paid' as const, date: '2026-01-20' },
  { id: 'INV-2026-0007', student: 'Tunde Bakare', class: 'SS1', amount: 350_000_00, paid: 0, status: 'pending' as const, date: '2026-01-20' },
];

export default function Invoices() {
  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="View and manage student fee invoices.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Generate Invoices</Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by student or invoice ID…" className="pl-9" />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Invoice #</TableHead>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs text-right">Paid</TableHead>
              <TableHead className="text-xs text-right">Balance</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">{inv.id}</TableCell>
                <TableCell className="font-medium">{inv.student}</TableCell>
                <TableCell>{inv.class}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(inv.amount)}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(inv.paid)}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(inv.amount - inv.paid)}</TableCell>
                <TableCell><StatusBadge status={inv.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">Showing 7 invoices</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm">Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
