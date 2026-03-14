import { ArrowLeft, CheckCircle, XCircle, Download, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const run = {
  id: 'PR-2026-03', period: 'March 2026', school: 'Bright Future Academy — Lekki Campus',
  staffCount: 12, grossTotal: 2_800_000_00, deductions: 478_000_00, netTotal: 2_322_000_00,
  status: 'pending' as const, createdBy: 'Mr. Bello Yusuf', createdAt: '2026-03-10',
};

const staffItems = [
  { id: 'STF-001', name: 'Mrs. Adamu Fatimah', position: 'Bursar', basic: 300_000_00, allowances: 80_000_00, deductions: 52_600_00, net: 327_400_00 },
  { id: 'STF-002', name: 'Mr. Bello Yusuf', position: 'HR Manager', basic: 280_000_00, allowances: 70_000_00, deductions: 48_500_00, net: 301_500_00 },
  { id: 'STF-003', name: 'Mr. Okafor Chidi', position: 'Senior Teacher', basic: 280_000_00, allowances: 80_000_00, deductions: 43_700_00, net: 316_300_00 },
  { id: 'STF-004', name: 'Mrs. Ajayi Folake', position: 'Teacher', basic: 200_000_00, allowances: 50_000_00, deductions: 30_000_00, net: 220_000_00 },
  { id: 'STF-005', name: 'Mr. Ibrahim Dele', position: 'Teacher', basic: 200_000_00, allowances: 50_000_00, deductions: 30_000_00, net: 220_000_00 },
];

const approvalHistory = [
  { step: 'Created', user: 'Mr. Bello Yusuf (HR)', date: '2026-03-10 09:00', status: 'done' },
  { step: 'Submitted for Approval', user: 'Mr. Bello Yusuf (HR)', date: '2026-03-10 09:15', status: 'done' },
  { step: 'Proprietor Approval', user: 'Awaiting Chief Okonkwo', date: '—', status: 'pending' },
];

export default function PayrollRunDetail() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/payroll"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Payroll</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{run.id}</span>
      </div>

      {/* Header */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xl font-bold">{run.id}</h2>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground">{run.period} • {run.school}</p>
            <p className="text-xs text-muted-foreground">Created by {run.createdBy} on {run.createdAt}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"><XCircle className="h-3.5 w-3.5" /> Reject</Button>
            <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"><CheckCircle className="h-3.5 w-3.5" /> Approve Payroll</Button>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Staff</p><p className="mt-1 text-lg font-bold">{run.staffCount}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Gross Total</p><p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatNaira(run.grossTotal)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Deductions</p><p className="mt-1 font-mono text-lg font-bold tabular-nums text-destructive">{formatNaira(run.deductions)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Net Payable</p><p className="mt-1 font-mono text-lg font-bold tabular-nums text-success">{formatNaira(run.netTotal)}</p></div>
        </div>
      </div>

      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">Staff Breakdown</TabsTrigger>
          <TabsTrigger value="approval">Approval History</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export Bank Batch</Button>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Staff ID</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Position</TableHead>
                  <TableHead className="text-xs text-right">Basic</TableHead>
                  <TableHead className="text-xs text-right">Allowances</TableHead>
                  <TableHead className="text-xs text-right">Deductions</TableHead>
                  <TableHead className="text-xs text-right">Net Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffItems.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.position}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(s.basic)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(s.allowances)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatNaira(s.deductions)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatNaira(s.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="approval" className="mt-4">
          <div className="rounded-lg border bg-card p-5">
            <div className="space-y-4">
              {approvalHistory.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${step.status === 'done' ? 'bg-success' : 'bg-warning animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-medium">{step.step}</p>
                    <p className="text-xs text-muted-foreground">{step.user} • {step.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
