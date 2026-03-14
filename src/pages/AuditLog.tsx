import { Shield, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const logs = [
  { id: 'log-001', timestamp: '2026-03-12 14:32', user: 'Mrs. Adamu', action: 'Payment Recorded', entity: 'PAY-001', detail: '₦350,000 — Chukwuemeka Obi', type: 'finance' },
  { id: 'log-002', timestamp: '2026-03-12 10:15', user: 'Mrs. Adamu', action: 'Bulk Invoice Generated', entity: 'INV-2026-*', detail: 'JSS2 Term 2 — 22 invoices', type: 'finance' },
  { id: 'log-003', timestamp: '2026-03-11 16:45', user: 'Chief Okonkwo', action: 'Payroll Approved', entity: 'PR-2026-02B', detail: 'February 2026 — Ikeja', type: 'payroll' },
  { id: 'log-004', timestamp: '2026-03-10 09:20', user: 'Mr. Bello', action: 'Fee Waiver Requested', entity: 'APR-001', detail: '₦150,000 waiver — Chioma Eze', type: 'approval' },
  { id: 'log-005', timestamp: '2026-03-09 11:30', user: 'Mr. Bello', action: 'Staff Salary Updated', entity: 'STF-003', detail: 'Mr. Okafor — ₦280K → ₦320K', type: 'payroll' },
  { id: 'log-006', timestamp: '2026-03-08 08:00', user: 'System', action: 'Student Enrolled', entity: 'STU-007', detail: 'Aisha Mohammed — JSS1 Lekki', type: 'academic' },
];

const typeColors: Record<string, string> = {
  finance: 'bg-accent/10 text-accent border-accent/20',
  payroll: 'bg-warning/10 text-warning border-warning/20',
  approval: 'bg-success/10 text-success border-success/20',
  academic: 'bg-primary/10 text-primary border-primary/20',
};

export default function AuditLog() {
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Track all important actions across the platform." />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search audit log…" className="pl-9" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Timestamp</TableHead>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs">Entity</TableHead>
              <TableHead className="text-xs">Details</TableHead>
              <TableHead className="text-xs">Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{l.timestamp}</TableCell>
                <TableCell className="text-sm">{l.user}</TableCell>
                <TableCell className="font-medium text-sm">{l.action}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.entity}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{l.detail}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[11px] capitalize ${typeColors[l.type] || ''}`}>{l.type}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
