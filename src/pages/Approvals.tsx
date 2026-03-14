import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function Approvals() {
  const { orgId, user } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();

  const { data: approvals, isLoading } = useQuery({
    queryKey: ["approvals", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("approval_requests")
        .select("id, type, description, amount, status, created_at, requested_by")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!orgId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("approval_requests")
        .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({ title: `Request ${status}`, description: `The approval request has been ${status}.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update approval status.", variant: "destructive" });
    },
  });

  const formatType = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Review and approve pending requests." />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : approvals?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No approval requests found.</TableCell>
              </TableRow>
            ) : (
              approvals?.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{formatType(a.type)}</TableCell>
                  <TableCell className="max-w-xs text-sm">{a.description}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(a.amount || 0)}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right">
                    {a.status === "pending" ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: a.id, status: "approved" })}>Approve</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: a.id, status: "rejected" })}>Reject</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize">{a.status}</span>
                    )}
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
