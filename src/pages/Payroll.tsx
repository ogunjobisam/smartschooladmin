import { useState } from "react";
import { Calculator, Download, MoreHorizontal, Send, Trash2, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { exportToCsv } from "@/lib/csv-export";
import { getErrorMessage } from "@/lib/errors";
import { payrollActions } from "@/lib/payroll";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { CreatePayrollRunDialog } from "@/components/payroll/CreatePayrollRunDialog";

const ALL = "all";

export default function Payroll() {
  const navigate = useNavigate();
  const { schoolId, orgId, user, userRoles } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["payroll-runs", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("payroll_runs")
        .select("id, period_label, staff_count, total_gross, total_deductions, total_net, status, run_date")
        .eq("school_id", schoolId)
        .order("run_date", { ascending: false });
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: staffCount } = useQuery({
    queryKey: ["staff-count", schoolId],
    queryFn: async () => {
      if (!schoolId) return 0;
      const { count } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("employment_status", "active");
      return count || 0;
    },
    enabled: !!schoolId,
  });

  const currentMonthRuns = runs?.filter(r => r.status === "pending" || r.status === "draft" || r.status === "approved") || [];
  const paidRuns = runs?.filter(r => r.status === "paid") || [];
  const dueThisMonth = currentMonthRuns.reduce((s, r) => s + (r.total_net || 0), 0);
  const paidThisMonth = paidRuns.reduce((s, r) => s + (r.total_net || 0), 0);
  const visible = statusFilter === ALL ? (runs || []) : (runs || []).filter((r) => r.status === statusFilter);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  /** Submit straight from the list so a draft never needs a detour to move on. */
  const submitRun = async (run: { id: string; period_label: string; staff_count: number; total_net: number }) => {
    const { error } = await supabase.from("payroll_runs").update({
      status: "pending",
      submitted_at: new Date().toISOString(),
      submitted_by: user?.id,
    }).eq("id", run.id);
    if (error) { toast.error(getErrorMessage(error, "Could not submit this payroll run")); return; }
    if (orgId) {
      await supabase.from("approval_requests").insert({
        org_id: orgId,
        type: "payroll_run",
        reference_type: "payroll_run",
        reference_id: run.id,
        description: `Payroll run for ${run.period_label} — ${run.staff_count} staff`,
        amount: run.total_net,
        status: "pending",
        requested_by: user?.id,
      });
    }
    toast.success("Submitted for approval");
    refresh();
  };

  const deleteRun = async () => {
    if (!pendingDelete) return;
    const { error: itemsError } = await supabase.from("payroll_run_items").delete().eq("payroll_run_id", pendingDelete.id);
    if (itemsError) { toast.error(getErrorMessage(itemsError, "Could not delete this run's payslips")); return; }
    const { error } = await supabase.from("payroll_runs").delete().eq("id", pendingDelete.id);
    setPendingDelete(null);
    if (error) { toast.error(getErrorMessage(error, "Could not delete this payroll run")); return; }
    toast.success("Payroll run deleted");
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Manage payroll runs, approvals and payslips.">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
          if (!runs?.length) return;
          exportToCsv("payroll", ["Period", "Staff Count", "Gross", "Deductions", "Net", "Status", "Date"],
            runs.map((r) => [r.period_label, String(r.staff_count), String(r.total_gross), String(r.total_deductions), String(r.total_net), r.status, r.run_date]));
        }}><Download className="h-4 w-4" /> Export CSV</Button>
        <CreatePayrollRunDialog />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Pending Payroll" value={formatMoney(dueThisMonth)} icon={Calculator} mono subtitle="Draft, submitted and approved" />
        <StatCard title="Paid Payroll" value={formatMoney(paidThisMonth)} icon={Calculator} mono />
        <StatCard title="Active Staff" value={(staffCount || 0).toString()} icon={Calculator} subtitle="In this school" />
      </div>

      <div className="flex justify-end">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Awaiting approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs text-right">Staff</TableHead>
              <TableHead className="text-xs text-right">Gross</TableHead>
              <TableHead className="text-xs text-right">Deductions</TableHead>
              <TableHead className="text-xs text-right">Net</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {runs?.length ? "No payroll runs match this status." : "No payroll runs yet. Create one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const actions = payrollActions(r.status, userRoles);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/payroll/${r.id}`)}>
                    <TableCell className="font-medium">{r.period_label}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.staff_count}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(r.total_gross)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(r.total_deductions)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(r.total_net)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Run actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/payroll/${r.id}`)}>
                            <Eye className="mr-2 h-3.5 w-3.5" /> Open run
                          </DropdownMenuItem>
                          {actions.includes("submit") && (
                            <DropdownMenuItem onClick={() => submitRun(r)}>
                              <Send className="mr-2 h-3.5 w-3.5" /> Submit for approval
                            </DropdownMenuItem>
                          )}
                          {actions.includes("delete") && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setPendingDelete({ id: r.id, label: r.period_label })}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete run
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payroll run?</AlertDialogTitle>
            <AlertDialogDescription>
              The {pendingDelete?.label} run and all of its payslips will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); deleteRun(); }}
            >
              Delete run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
