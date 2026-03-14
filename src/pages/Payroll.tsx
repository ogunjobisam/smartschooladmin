import { Calculator, Plus, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { exportToCsv } from "@/lib/csv-export";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function Payroll() {
  const navigate = useNavigate();
  const { schoolId } = useAuth();
  const { formatMoney } = useCurrency();

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

  const currentMonthRuns = runs?.filter(r => r.status === "pending" || r.status === "draft") || [];
  const paidRuns = runs?.filter(r => r.status === "paid") || [];
  const dueThisMonth = currentMonthRuns.reduce((s, r) => s + (r.total_net || 0), 0);
  const paidThisMonth = paidRuns.reduce((s, r) => s + (r.total_net || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Manage payroll runs, approvals and payslips.">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
          if (!runs?.length) return;
          exportToCsv("payroll", ["Period", "Staff Count", "Gross", "Deductions", "Net", "Status", "Date"],
            runs.map((r: any) => [r.period_label, String(r.staff_count), String(r.total_gross), String(r.total_deductions), String(r.total_net), r.status, r.run_date]));
        }}><Download className="h-4 w-4" /> Export CSV</Button>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Payroll Run</Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Pending Payroll" value={formatMoney(dueThisMonth)} icon={Calculator} mono />
        <StatCard title="Paid Payroll" value={formatMoney(paidThisMonth)} icon={Calculator} mono />
        <StatCard title="Active Staff" value={(staffCount || 0).toString()} icon={Calculator} subtitle="In this school" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs text-right">Staff</TableHead>
              <TableHead className="text-xs text-right">Gross</TableHead>
              <TableHead className="text-xs text-right">Deductions</TableHead>
              <TableHead className="text-xs text-right">Net</TableHead>
              <TableHead className="text-xs">Status</TableHead>
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
            ) : runs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No payroll runs found.</TableCell>
              </TableRow>
            ) : (
              runs?.map((r: any) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/payroll/${r.id}`)}>
                  <TableCell className="font-medium">{r.period_label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.staff_count}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.total_gross)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatNaira(r.total_deductions)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.total_net)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
