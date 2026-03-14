import { GraduationCap, Plus, Search, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const students = [
  { id: 'STU-001', name: 'Chukwuemeka Obi', class: 'SS1', school: 'Lekki', status: 'active' as const, guardian: 'Mr. Obi' },
  { id: 'STU-002', name: 'Fatima Suleiman', class: 'JSS3', school: 'Ikeja', status: 'active' as const, guardian: 'Mrs. Suleiman' },
  { id: 'STU-003', name: 'David Okoro', class: 'SS2', school: 'Lekki', status: 'active' as const, guardian: 'Dr. Okoro' },
  { id: 'STU-004', name: 'Grace Ademola', class: 'JSS1', school: 'Ikeja', status: 'active' as const, guardian: 'Mrs. Ademola' },
  { id: 'STU-005', name: 'Ibrahim Musa', class: 'SS3', school: 'Lekki', status: 'active' as const, guardian: 'Alhaji Musa' },
  { id: 'STU-006', name: 'Blessing Eze', class: 'JSS2', school: 'Lekki', status: 'inactive' as const, guardian: 'Mr. Eze' },
  { id: 'STU-007', name: 'Aisha Mohammed', class: 'JSS1', school: 'Lekki', status: 'active' as const, guardian: 'Mrs. Mohammed' },
  { id: 'STU-008', name: 'Tunde Bakare', class: 'SS1', school: 'Ikeja', status: 'active' as const, guardian: 'Pastor Bakare' },
];

export default function Students() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader title="Students" description="Manage student records and enrolments.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Student</Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search students…" className="pl-9" />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            <SelectItem value="jss1">JSS1</SelectItem>
            <SelectItem value="jss2">JSS2</SelectItem>
            <SelectItem value="jss3">JSS3</SelectItem>
            <SelectItem value="ss1">SS1</SelectItem>
            <SelectItem value="ss2">SS2</SelectItem>
            <SelectItem value="ss3">SS3</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Student ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">School</TableHead>
              <TableHead className="text-xs">Guardian</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/students/${s.id}`)}>
                <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.class}</TableCell>
                <TableCell className="text-muted-foreground">{s.school}</TableCell>
                <TableCell className="text-muted-foreground">{s.guardian}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">Showing 8 of 110 students</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled>Previous</Button>
            <Button variant="outline" size="sm">Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
