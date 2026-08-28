import { useState } from "react";
import { Shield, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const typeColors: Record<string, string> = {
  student: 'bg-primary/10 text-primary border-primary/20',
  staff: 'bg-accent/10 text-accent border-accent/20',
  invoice: 'bg-warning/10 text-warning border-warning/20',
  payment: 'bg-success/10 text-success border-success/20',
  payroll: 'bg-warning/10 text-warning border-warning/20',
  approval: 'bg-success/10 text-success border-success/20',
  fee: 'bg-accent/10 text-accent border-accent/20',
};

const PAGE_SIZE = 25;

export default function AuditLog() {
  const { orgId } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", orgId, search, page],
    queryFn: async () => {
      if (!orgId) return { logs: [], count: 0 };
      let query = supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, detail, created_at, user_id", { count: "exact" })
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%,detail.ilike.%${search}%`);
      }

      const { data: logs, count } = await query;
      return { logs: logs || [], count: count || 0 };
    },
    enabled: !!orgId,
  });

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Track all important actions across the platform." />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search audit log…" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Timestamp</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs">Entity</TableHead>
              <TableHead className="text-xs">Details</TableHead>
              <TableHead className="text-xs">Type</TableHead>
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
            ) : data?.logs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No audit logs found.</TableCell>
              </TableRow>
            ) : (
              data?.logs?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium text-sm capitalize">{l.action}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.entity_id || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{l.detail || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] capitalize ${typeColors[l.entity_type] || ''}`}>
                      {l.entity_type}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {Math.min((page * PAGE_SIZE) + 1, data?.count || 0)}–{Math.min((page + 1) * PAGE_SIZE, data?.count || 0)} of {data?.count || 0}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
