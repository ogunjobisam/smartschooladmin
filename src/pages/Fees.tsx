import { displayClassName } from "@/lib/sections";
import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { AddFeeScheduleDialog } from "@/components/forms/AddFeeScheduleDialog";
import { EditFeeScheduleDialog, type FeeScheduleEditable } from "@/components/forms/EditFeeScheduleDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
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

export default function Fees() {
  const { schoolId } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FeeScheduleEditable | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["fee-schedules", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("fee_schedules")
        .select("id, name, total_amount, is_active, class_id, classes(name), academic_period_id, academic_periods(name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!schoolId,
  });

  const toggleActive = async (row: { id: string; is_active: boolean | null }) => {
    const next = !(row.is_active !== false);
    const { error } = await supabase.from("fee_schedules").update({ is_active: next }).eq("id", row.id);
    if (error) return toast.error(getErrorMessage(error, "Could not update this fee schedule."));
    toast.success(next ? "Schedule activated" : "Schedule deactivated");
    queryClient.invalidateQueries({ queryKey: ["fee-schedules"] });
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from("fee_schedules").delete().eq("id", pendingDelete.id);
    setPendingDelete(null);
    if (error) return toast.error(getErrorMessage(error, "Could not delete this fee schedule. Deactivate it instead if it is already in use."));
    toast.success("Fee schedule deleted");
    queryClient.invalidateQueries({ queryKey: ["fee-schedules"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Fee Schedules" description="Configure fee structures by class and term.">
        <AddFeeScheduleDialog>
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Schedule</Button>
        </AddFeeScheduleDialog>
      </PageHeader>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-[60px]" />
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
            ) : schedules?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No fee schedules found.</TableCell>
              </TableRow>
            ) : (
              schedules?.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{displayClassName(f.classes?.name) || "All"}</TableCell>
                  <TableCell className="text-muted-foreground">{f.academic_periods?.name || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(f.total_amount)}</TableCell>
                  <TableCell><StatusBadge status={f.is_active ? "active" : "inactive"} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Schedule actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing({
                          id: f.id,
                          name: f.name,
                          total_amount: f.total_amount,
                          is_active: f.is_active,
                          class_id: f.class_id,
                          academic_period_id: f.academic_period_id,
                        })}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(f)}>
                          <Power className="mr-2 h-3.5 w-3.5" /> {f.is_active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setPendingDelete({ id: f.id, name: f.name })}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete schedule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditFeeScheduleDialog schedule={editing} onOpenChange={(o) => !o && setEditing(null)} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this fee schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} will be removed. Invoices already raised are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); remove(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
