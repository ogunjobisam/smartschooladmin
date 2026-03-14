import { Calculator, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { formatNaira, dashboardStats } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

const payrollRuns = [
  { id: 'PR-2026-03', period: 'March 2026', school: 'Lekki', staff: 12, gross: 2_800_000_00, net: 2_520_000_00, status: 'pending' as const },
  { id: 'PR-2026-02', period: 'February 2026', school: 'Lekki', staff: 12, gross: 2_800_000_00, net: 2_520_000_00, status: 'approved' as const },
  { id: 'PR-2026-02B', period: 'February 2026', school: 'Ikeja', staff: 8, gross: 2_000_000_00, net: 1_800_000_00, status: 'paid' as const },
  { id: 'PR-2026-01', period: 'January 2026', school: 'Lekki', staff: 12, gross: 2_800_000_00, net: 2_520_000_00, status: 'paid' as const },
  { id: 'PR-2026-01B', period: 'January 2026', school: 'Ikeja', staff: 8, gross: 2_000_000_00, net: 1_800_000_00, status: 'paid' as const },
];

export default function Payroll() {
  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Manage payroll runs, approvals and payslips.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Payroll Run</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Payroll Due This Month" value={formatNaira(dashboardStats.payrollDueThisMonth)} icon={Calculator} mono />
        <StatCard title="Paid This Month" value={formatNaira(dashboardStats.payrollPaidThisMonth)} icon={Calculator} mono />
        <StatCard title="Total Staff" value={dashboardStats.totalStaff.toString()} icon={Calculator} subtitle="Across all schools" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Run ID</TableHead>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs">School</TableHead>
              <TableHead className="text-xs text-right">Staff</TableHead>
              <TableHead className="text-xs text-right">Gross</TableHead>
              <TableHead className="text-xs text-right">Net</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payrollRuns.map((r) => (
              <TableRow key={r.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                <TableCell className="font-medium">{r.period}</TableCell>
                <TableCell className="text-muted-foreground">{r.school}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{r.staff}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.gross)}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.net)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
