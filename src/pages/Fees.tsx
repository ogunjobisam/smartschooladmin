import { Receipt, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

const feeSchedules = [
  { id: 'FS-001', name: 'JSS1 Term 2 2026', class: 'JSS1', term: 'Term 2', total: 285_000_00, status: 'active' as const, students: 18 },
  { id: 'FS-002', name: 'JSS2 Term 2 2026', class: 'JSS2', term: 'Term 2', total: 295_000_00, status: 'active' as const, students: 22 },
  { id: 'FS-003', name: 'JSS3 Term 2 2026', class: 'JSS3', term: 'Term 2', total: 310_000_00, status: 'active' as const, students: 15 },
  { id: 'FS-004', name: 'SS1 Term 2 2026', class: 'SS1', term: 'Term 2', total: 350_000_00, status: 'active' as const, students: 20 },
  { id: 'FS-005', name: 'SS2 Term 2 2026', class: 'SS2', term: 'Term 2', total: 360_000_00, status: 'active' as const, students: 18 },
  { id: 'FS-006', name: 'SS3 Term 2 2026', class: 'SS3', term: 'Term 2', total: 380_000_00, status: 'active' as const, students: 17 },
];

export default function Fees() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fee Schedules" description="Configure fee structures by class and term.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Schedule</Button>
      </PageHeader>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Schedule ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Term</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs text-right">Students</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feeSchedules.map((f) => (
              <TableRow key={f.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">{f.id}</TableCell>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell>{f.class}</TableCell>
                <TableCell className="text-muted-foreground">{f.term}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(f.total)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{f.students}</TableCell>
                <TableCell><StatusBadge status={f.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
