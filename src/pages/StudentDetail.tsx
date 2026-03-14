import { ArrowLeft, Mail, Phone, MapPin, Calendar, GraduationCap, CreditCard, AlertTriangle, Edit } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

const student = {
  id: 'STU-001', name: 'Chukwuemeka Obi', initials: 'CO',
  class: 'SS1', school: 'Bright Future Academy — Lekki Campus',
  dob: '2010-05-14', gender: 'Male', status: 'active' as const,
  enrolledDate: '2022-09-01', studentType: 'Day Student',
  address: '12 Admiralty Way, Lekki Phase 1, Lagos',
  email: 'chukwuemeka.obi@student.bfa.ng',
};

const guardians = [
  { id: 'GRD-001', name: 'Mr. Obi Chukwudi', relationship: 'Father', phone: '08012345678', email: 'obi@email.com', primary: true },
  { id: 'GRD-010', name: 'Mrs. Obi Ngozi', relationship: 'Mother', phone: '08098765432', email: 'ngozi.obi@email.com', primary: false },
];

const invoices = [
  { id: 'INV-2026-0001', term: 'Term 2 2026', amount: 350_000_00, paid: 350_000_00, status: 'paid' as const, date: '2026-01-15' },
  { id: 'INV-2025-0042', term: 'Term 1 2026', amount: 350_000_00, paid: 350_000_00, status: 'paid' as const, date: '2025-09-10' },
  { id: 'INV-2025-0018', term: 'Term 3 2025', amount: 340_000_00, paid: 340_000_00, status: 'paid' as const, date: '2025-04-15' },
];

const payments = [
  { id: 'PAY-001', date: '2026-02-10', amount: 350_000_00, method: 'Bank Transfer', ref: 'TRF-98234', invoice: 'INV-2026-0001' },
  { id: 'PAY-078', date: '2025-09-20', amount: 200_000_00, method: 'Cash', ref: 'CSH-00310', invoice: 'INV-2025-0042' },
  { id: 'PAY-079', date: '2025-10-05', amount: 150_000_00, method: 'POS', ref: 'POS-44210', invoice: 'INV-2025-0042' },
];

export default function StudentDetail() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/students"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Students</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{student.name}</span>
      </div>

      {/* Profile Header */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{student.initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-card-foreground">{student.name}</h2>
                <StatusBadge status={student.status} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">{student.id}</p>
              <p className="text-sm text-muted-foreground">{student.class} • {student.school}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"><Edit className="h-3.5 w-3.5" /> Edit Student</Button>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4 shrink-0" /> DOB: {student.dob}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><GraduationCap className="h-4 w-4 shrink-0" /> {student.studentType}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /> {student.address}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4 shrink-0" /> Enrolled: {student.enrolledDate}</div>
        </div>
      </div>

      {/* Fee Account Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Billed</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums">{formatNaira(1_040_000_00)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Paid</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-success">{formatNaira(1_040_000_00)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums">{formatNaira(0)}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="guardians">
        <TabsList>
          <TabsTrigger value="guardians">Guardians</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="guardians" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Relationship</TableHead>
                  <TableHead className="text-xs">Phone</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Primary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardians.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.relationship}</TableCell>
                    <TableCell className="font-mono text-sm tabular-nums">{g.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{g.email}</TableCell>
                    <TableCell>{g.primary ? <StatusBadge status="active" /> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Term</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer">
                    <TableCell className="font-mono text-xs text-muted-foreground">{inv.id}</TableCell>
                    <TableCell>{inv.term}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(inv.amount)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(inv.paid)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Payment ID</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                    <TableCell className="tabular-nums">{p.date}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(p.amount)}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.ref}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.invoice}</TableCell>
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
