import { ArrowLeft, Mail, Phone, Building2, Calendar, Banknote, Edit, FileText, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNaira } from "@/lib/mock-data";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

const staffMember = {
  id: 'STF-003', name: 'Mr. Okafor Chidi', initials: 'OC',
  position: 'Senior Teacher', department: 'Academics',
  school: 'Bright Future Academy — Lekki Campus',
  email: 'okafor.chidi@bfa.ng', phone: '08034567890',
  employmentDate: '2020-01-15', status: 'active' as const,
  gender: 'Male', dateOfBirth: '1985-08-22',
  qualifications: 'B.Ed Mathematics, M.Ed Curriculum Studies',
};

const salaryInfo = {
  basicSalary: 280_000_00, housing: 50_000_00, transport: 30_000_00,
  pension: 25_200_00, tax: 18_500_00,
  grossPay: 360_000_00, netPay: 316_300_00,
};

const bankDetails = {
  bankName: 'First Bank of Nigeria', accountNumber: '301****8920', accountName: 'Okafor Chidi Emmanuel',
};

const payslips = [
  { id: 'PS-2026-03-003', period: 'March 2026', gross: 360_000_00, net: 316_300_00, status: 'pending' as const },
  { id: 'PS-2026-02-003', period: 'February 2026', gross: 360_000_00, net: 316_300_00, status: 'paid' as const },
  { id: 'PS-2026-01-003', period: 'January 2026', gross: 360_000_00, net: 316_300_00, status: 'paid' as const },
];

const documents = [
  { name: 'Employment Letter', uploaded: '2020-01-15', type: 'PDF' },
  { name: 'ID Card Copy', uploaded: '2020-01-15', type: 'PDF' },
  { name: 'Qualification Certificate', uploaded: '2020-01-18', type: 'PDF' },
];

export default function StaffDetail() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/staff"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Staff</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{staffMember.name}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{staffMember.initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-card-foreground">{staffMember.name}</h2>
                <StatusBadge status={staffMember.status} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">{staffMember.id}</p>
              <p className="text-sm text-muted-foreground">{staffMember.position} • {staffMember.department}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"><Edit className="h-3.5 w-3.5" /> Edit Staff</Button>
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {staffMember.email}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {staffMember.phone}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /> {staffMember.school}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> Joined: {staffMember.employmentDate}</div>
        </div>
      </div>

      <Tabs defaultValue="salary">
        <TabsList>
          <TabsTrigger value="salary">Salary & Payroll</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="salary" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote className="h-4 w-4 text-accent" /> Salary Breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Basic Salary</span><span className="font-mono tabular-nums">{formatNaira(salaryInfo.basicSalary)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Housing Allowance</span><span className="font-mono tabular-nums">{formatNaira(salaryInfo.housing)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Transport Allowance</span><span className="font-mono tabular-nums">{formatNaira(salaryInfo.transport)}</span></div>
                <Separator />
                <div className="flex justify-between font-semibold"><span>Gross Pay</span><span className="font-mono tabular-nums">{formatNaira(salaryInfo.grossPay)}</span></div>
                <div className="flex justify-between text-destructive"><span className="text-muted-foreground">Pension (7%)</span><span className="font-mono tabular-nums">-{formatNaira(salaryInfo.pension)}</span></div>
                <div className="flex justify-between text-destructive"><span className="text-muted-foreground">Tax (PAYE est.)</span><span className="font-mono tabular-nums">-{formatNaira(salaryInfo.tax)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-success"><span>Net Pay</span><span className="font-mono tabular-nums">{formatNaira(salaryInfo.netPay)}</span></div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-accent" /> Bank Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span>{bankDetails.bankName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account Number</span><span className="font-mono tabular-nums">{bankDetails.accountNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account Name</span><span>{bankDetails.accountName}</span></div>
              </div>
              <p className="text-[11px] text-muted-foreground italic">Bank details are restricted to authorised finance roles.</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payslips" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Payslip ID</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-right">Gross</TableHead>
                  <TableHead className="text-xs text-right">Net</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((ps) => (
                  <TableRow key={ps.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{ps.id}</TableCell>
                    <TableCell>{ps.period}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(ps.gross)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(ps.net)}</TableCell>
                    <TableCell><StatusBadge status={ps.status} /></TableCell>
                    <TableCell className="text-right">
                      {ps.status === 'paid' && <Button variant="ghost" size="sm" className="text-xs gap-1"><FileText className="h-3 w-3" /> Download</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Document</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Uploaded</TableHead>
                  <TableHead className="text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.type}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{d.uploaded}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-xs">View</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
