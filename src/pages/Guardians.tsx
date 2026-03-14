import { Users, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

const guardians = [
  { id: 'GRD-001', name: 'Mr. Obi Chukwudi', phone: '08012345678', email: 'obi@email.com', children: 2 },
  { id: 'GRD-002', name: 'Mrs. Suleiman Halima', phone: '08023456789', email: 'suleiman@email.com', children: 1 },
  { id: 'GRD-003', name: 'Dr. Okoro Michael', phone: '08034567890', email: 'okoro@email.com', children: 1 },
  { id: 'GRD-004', name: 'Mrs. Ademola Funke', phone: '08045678901', email: 'ademola@email.com', children: 1 },
  { id: 'GRD-005', name: 'Alhaji Musa Ibrahim', phone: '08056789012', email: 'musa@email.com', children: 1 },
  { id: 'GRD-006', name: 'Mr. Eze Chinedu', phone: '08067890123', email: 'eze@email.com', children: 1 },
];

export default function Guardians() {
  return (
    <div className="space-y-6">
      <PageHeader title="Guardians" description="Manage parent and guardian records.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Guardian</Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search guardians…" className="pl-9" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs text-right">Children</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guardians.map((g) => (
              <TableRow key={g.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">{g.id}</TableCell>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="font-mono text-sm tabular-nums">{g.phone}</TableCell>
                <TableCell className="text-muted-foreground">{g.email}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{g.children}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
