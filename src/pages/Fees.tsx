import { useState } from "react";
import { Receipt, Plus } from "lucide-react";
import { AddFeeScheduleDialog } from "@/components/forms/AddFeeScheduleDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function Fees() {
  const { schoolId } = useAuth();
  const { formatMoney } = useCurrency();

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

  return (
    <div className="space-y-6">
      <PageHeader title="Fee Schedules" description="Configure fee structures by class and term.">
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Schedule</Button>
      </PageHeader>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
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
            ) : schedules?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No fee schedules found.</TableCell>
              </TableRow>
            ) : (
              schedules?.map((f: any) => (
                <TableRow key={f.id} className="cursor-pointer">
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{f.classes?.name || "All"}</TableCell>
                  <TableCell className="text-muted-foreground">{f.academic_periods?.name || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(f.total_amount)}</TableCell>
                  <TableCell><StatusBadge status={f.is_active ? "active" : "inactive"} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
