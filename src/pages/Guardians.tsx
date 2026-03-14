import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { AddGuardianDialog } from "@/components/forms/AddGuardianDialog";
import { InviteGuardianButton } from "@/components/guardians/InviteGuardianButton";

export default function Guardians() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: guardians, isLoading } = useQuery({
    queryKey: ["guardians", orgId, search],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("guardians")
        .select("id, first_name, last_name, phone, email, user_id, student_guardians(id)")
        .eq("org_id", orgId)
        .order("last_name");

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data } = await query.limit(100);
      return data || [];
    },
    enabled: !!orgId,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Guardians" description="Manage parent and guardian records.">
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Guardian</Button>
      </PageHeader>
      <AddGuardianDialog open={showAdd} onOpenChange={setShowAdd} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search guardians…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs text-right">Children</TableHead>
              <TableHead className="text-xs">Access</TableHead>
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
            ) : guardians?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No guardians found.</TableCell>
              </TableRow>
            ) : (
              guardians?.map((g: any) => (
                <TableRow key={g.id} className="cursor-pointer">
                  <TableCell className="font-medium">{g.first_name} {g.last_name}</TableCell>
                  <TableCell className="font-mono text-sm tabular-nums">{g.phone || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{g.email || "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{g.student_guardians?.length || 0}</TableCell>
                  <TableCell>
                    <InviteGuardianButton
                      guardianId={g.id}
                      guardianName={`${g.first_name} ${g.last_name}`}
                      guardianEmail={g.email}
                      hasUserId={!!g.user_id}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
