import { ArrowLeft, CheckCircle, XCircle, Download } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatNaira } from "@/lib/format";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: run, isLoading } = useQuery({
    queryKey: ["payroll-run", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("*, schools(name)")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: items } = useQuery({
    queryKey: ["payroll-run-items", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_run_items")
        .select("id, basic, allowances, deductions, net_pay, staff(first_name, last_name, staff_id_number, staff_positions(title, is_current))")
        .eq("payroll_run_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading || !run) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/payroll"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Payroll</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{run.period_label}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{run.period_label}</h2>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground">{run.schools?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">Run date: {run.run_date}</p>
          </div>
          {run.status === "pending" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5"><XCircle className="h-3.5 w-3.5" /> Reject</Button>
              <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"><CheckCircle className="h-3.5 w-3.5" /> Approve Payroll</Button>
            </div>
          )}
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Staff</p><p className="mt-1 text-lg font-bold">{run.staff_count}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Gross Total</p><p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatNaira(run.total_gross)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Deductions</p><p className="mt-1 font-mono text-lg font-bold tabular-nums text-destructive">{formatNaira(run.total_deductions)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Net Payable</p><p className="mt-1 font-mono text-lg font-bold tabular-nums text-success">{formatNaira(run.total_net)}</p></div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export Bank Batch</Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Staff ID</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Position</TableHead>
              <TableHead className="text-xs text-right">Basic</TableHead>
              <TableHead className="text-xs text-right">Allowances</TableHead>
              <TableHead className="text-xs text-right">Deductions</TableHead>
              <TableHead className="text-xs text-right">Net Pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No staff items.</TableCell></TableRow>
            ) : (
              items?.map((s: any) => {
                const pos = s.staff?.staff_positions?.find((p: any) => p.is_current);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.staff?.staff_id_number || "—"}</TableCell>
                    <TableCell className="font-medium">{s.staff?.first_name} {s.staff?.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{pos?.title || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(s.basic)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(s.allowances)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatNaira(s.deductions)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatNaira(s.net_pay)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
