import { AlertTriangle, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { formatNaira, overdueStudents, dashboardStats } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function ageingBadge(days: number) {
  if (days <= 30) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[11px]">0–30 days</Badge>;
  if (days <= 60) return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[11px]">31–60 days</Badge>;
  return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[11px] font-semibold">60+ days</Badge>;
}

export default function Arrears() {
  return (
    <div className="space-y-6">
      <PageHeader title="Arrears & Controls" description="Monitor overdue balances and manage exceptions." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Outstanding" value={formatNaira(dashboardStats.outstandingFees)} icon={AlertTriangle} mono />
        <StatCard title="Overdue Students" value={dashboardStats.overdueStudents.toString()} icon={Users} subtitle="Across all schools" />
        <StatCard title="Exceptions Active" value={dashboardStats.exceptionsToReview.toString()} icon={AlertTriangle} subtitle="Pending review" />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Overdue Student Accounts</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">School</TableHead>
              <TableHead className="text-xs text-right">Outstanding</TableHead>
              <TableHead className="text-xs">Ageing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overdueStudents.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.class}</TableCell>
                <TableCell className="text-muted-foreground">{s.school}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatNaira(s.outstanding)}</TableCell>
                <TableCell>{ageingBadge(s.daysOverdue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
