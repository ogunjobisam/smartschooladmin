import { CreditCard, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { dailyCollections, formatNairaCompact } from "@/lib/mock-data";

const payments = [
  { id: 'PAY-001', student: 'Chukwuemeka Obi', amount: 350_000_00, method: 'Bank Transfer', date: '2026-03-12', ref: 'TRF-98234', status: 'paid' as const },
  { id: 'PAY-002', student: 'Grace Ademola', amount: 285_000_00, method: 'Cash', date: '2026-03-12', ref: 'CSH-00451', status: 'paid' as const },
  { id: 'PAY-003', student: 'Fatima Suleiman', amount: 200_000_00, method: 'POS', date: '2026-03-11', ref: 'POS-77219', status: 'paid' as const },
  { id: 'PAY-004', student: 'Aisha Mohammed', amount: 285_000_00, method: 'Bank Transfer', date: '2026-03-10', ref: 'TRF-98190', status: 'paid' as const },
  { id: 'PAY-005', student: 'Ibrahim Musa', amount: 100_000_00, method: 'Cash', date: '2026-03-09', ref: 'CSH-00448', status: 'paid' as const },
];

export default function Payments() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Record and manage fee payments.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Record Payment</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Today's Collections" value={formatNaira(635_000_00)} icon={CreditCard} mono />
        <StatCard title="This Week" value={formatNaira(5_100_000_00)} icon={CreditCard} mono />
        <StatCard title="This Month" value={formatNaira(12_350_000_00)} icon={CreditCard} mono />
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">Daily Collections — This Week</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dailyCollections}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip formatter={(v: number) => formatNairaCompact(v)} />
            <Bar dataKey="amount" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search payments…" className="pl-9" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Payment ID</TableHead>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Method</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                <TableCell className="font-medium">{p.student}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(p.amount)}</TableCell>
                <TableCell>{p.method}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.ref}</TableCell>
                <TableCell className="tabular-nums">{p.date}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
