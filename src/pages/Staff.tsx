import { useState } from "react";
import { UserCog, Plus, Search, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { AddStaffDialog } from "@/components/forms/AddStaffDialog";

export default function Staff() {
  const navigate = useNavigate();
  const { schoolId } = useAuth();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: staffList, isLoading } = useQuery({
    queryKey: ["staff", schoolId, search],
    queryFn: async () => {
      if (!schoolId) return [];
      let query = supabase
        .from("staff")
        .select("id, first_name, last_name, staff_id_number, email, employment_status, staff_positions(title, department, is_current)")
        .eq("school_id", schoolId)
        .order("last_name");
      
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,staff_id_number.ilike.%${search}%`);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const getPosition = (s: any) => {
    const pos = s.staff_positions?.find((p: any) => p.is_current);
    return pos ? { title: pos.title, department: pos.department } : { title: "—", department: "—" };
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Manage staff records and positions.">
        <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Staff</Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search staff…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Staff ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Position</TableHead>
              <TableHead className="text-xs">Department</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : staffList?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No staff found.</TableCell>
              </TableRow>
            ) : (
              staffList?.map((s: any) => {
                const pos = getPosition(s);
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/staff/${s.id}`)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.staff_id_number || "—"}</TableCell>
                    <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                    <TableCell>{pos.title}</TableCell>
                    <TableCell className="text-muted-foreground">{pos.department}</TableCell>
                    <TableCell><StatusBadge status={s.employment_status as any} /></TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">Showing {staffList?.length || 0} staff</p>
        </div>
      </div>
    </div>
  );
}
