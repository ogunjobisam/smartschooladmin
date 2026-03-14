import { UserCog, Plus, Search, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

const staff = [
  { id: 'STF-001', name: 'Mrs. Adamu Fatimah', position: 'Bursar', department: 'Finance', school: 'Lekki', status: 'active' as const },
  { id: 'STF-002', name: 'Mr. Bello Yusuf', position: 'HR Manager', department: 'Admin', school: 'Lekki', status: 'active' as const },
  { id: 'STF-003', name: 'Mr. Okafor Chidi', position: 'Senior Teacher', department: 'Academics', school: 'Lekki', status: 'active' as const },
  { id: 'STF-004', name: 'Mrs. Nnamdi Grace', position: 'Principal', department: 'Leadership', school: 'Ikeja', status: 'active' as const },
  { id: 'STF-005', name: 'Mr. Adeyemi Kunle', position: 'Teacher', department: 'Academics', school: 'Ikeja', status: 'active' as const },
  { id: 'STF-006', name: 'Miss Ogundimu Bola', position: 'Finance Officer', department: 'Finance', school: 'Ikeja', status: 'active' as const },
  { id: 'STF-007', name: 'Mr. Uche Emmanuel', position: 'Security', department: 'Operations', school: 'Lekki', status: 'inactive' as const },
];

export default function Staff() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Manage staff records and positions.">
        <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Staff</Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search staff…" className="pl-9" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Staff ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Position</TableHead>
              <TableHead className="text-xs">Department</TableHead>
              <TableHead className="text-xs">School</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.position}</TableCell>
                <TableCell className="text-muted-foreground">{s.department}</TableCell>
                <TableCell className="text-muted-foreground">{s.school}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">Showing 7 of 20 staff</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm">Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
