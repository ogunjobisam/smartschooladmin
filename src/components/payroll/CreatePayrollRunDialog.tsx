import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";
import { calculatePayrollLine, periodLabel, recentPeriods, sumPayrollLines } from "@/lib/payroll";

interface StaffWithProfile {
  id: string;
  first_name: string;
  last_name: string;
  payroll_profiles: {
    basic_salary: number | null;
    housing_allowance: number | null;
    transport_allowance: number | null;
    other_allowances: number | null;
    pension_rate: number | null;
    tax_rate: number | null;
  } | null;
}

export function CreatePayrollRunDialog() {
  const { schoolId, user } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const periods = useMemo(() => recentPeriods(12), []);
  const [period, setPeriod] = useState(() => periodLabel(new Date()));
  const [runDate, setRunDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["payroll-eligible-staff", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, payroll_profiles(basic_salary, housing_allowance, transport_allowance, other_allowances, pension_rate, tax_rate)")
        .eq("school_id", schoolId!)
        .eq("employment_status", "active")
        .order("last_name");
      if (error) throw error;
      return (data || []) as unknown as StaffWithProfile[];
    },
    enabled: !!schoolId && open,
  });

  // Supabase returns the one-to-one join as an object or a single-element array
  // depending on how the relationship is inferred, so normalise it here.
  const rows = useMemo(
    () =>
      staff.map((s) => {
        const raw = s.payroll_profiles as StaffWithProfile["payroll_profiles"] | StaffWithProfile["payroll_profiles"][];
        const profile = Array.isArray(raw) ? raw[0] ?? null : raw;
        return { staff: s, profile, line: calculatePayrollLine(profile || {}) };
      }),
    [staff]
  );

  const payable = rows.filter((r) => r.line.gross > 0);
  const unpaid = rows.filter((r) => r.line.gross === 0);
  const totals = sumPayrollLines(payable.map((r) => r.line));

  // A run for the same school and period already exists — creating a second one
  // would double-pay everybody.
  const { data: duplicate } = useQuery({
    queryKey: ["payroll-run-duplicate", schoolId, period],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("id")
        .eq("school_id", schoolId!)
        .eq("period_label", period)
        .maybeSingle();
      return data;
    },
    enabled: !!schoolId && open && !!period,
  });

  const createRun = useMutation({
    mutationFn: async () => {
      if (!schoolId || !user) throw new Error("No school selected");
      if (payable.length === 0) throw new Error("No staff have a salary set up yet");

      const { data: run, error: runError } = await supabase
        .from("payroll_runs")
        .insert({
          school_id: schoolId,
          period_label: period,
          run_date: runDate,
          total_gross: totals.totalGross,
          total_deductions: totals.totalDeductions,
          total_net: totals.totalNet,
          staff_count: totals.staffCount,
          status: "draft",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (runError) throw runError;

      // Keep the pension and tax split, not just the total. Recomputing it later
      // from payroll_profiles would be wrong the moment anyone's rate changes —
      // last year's payslip would re-render with this year's pension rate.
      const items = payable.map((r) => ({
        payroll_run_id: run.id,
        staff_id: r.staff.id,
        basic: r.line.basic,
        allowances: r.line.allowances,
        pension: r.line.pension,
        tax: r.line.tax,
        deductions: r.line.deductions,
        net_pay: r.line.netPay,
      }));

      const { error: itemsError } = await supabase.from("payroll_run_items").insert(items);
      if (itemsError) {
        // Don't leave a run with no payslips behind for someone to approve.
        await supabase.from("payroll_runs").delete().eq("id", run.id);
        throw itemsError;
      }

      return run.id;
    },
    onSuccess: (runId) => {
      toast.success(`Draft payroll run created for ${totals.staffCount} staff`);
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      setOpen(false);
      navigate(`/payroll/${runId}`);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Failed to create payroll run")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Payroll Run</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Payroll Run</DialogTitle>
          <DialogDescription>
            Creates a draft run from each active staff member's salary profile. Nothing is paid
            until the run is approved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {periods.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Run date</Label>
            <Input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} />
          </div>
        </div>

        {duplicate && (
          <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A payroll run already exists for {period}. Creating another will pay staff twice for
            the same period.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No active staff in this school yet. Add staff before running payroll.
          </p>
        ) : (
          <>
            <ScrollArea className="max-h-64 rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Staff</th>
                    <th className="px-3 py-2 text-right font-medium">Gross</th>
                    <th className="px-3 py-2 text-right font-medium">Deductions</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payable.map((r) => (
                    <tr key={r.staff.id}>
                      <td className="px-3 py-2">{r.staff.last_name}, {r.staff.first_name}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMoney(r.line.gross)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{formatMoney(r.line.deductions)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-medium">{formatMoney(r.line.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {unpaid.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {unpaid.length} staff {unpaid.length === 1 ? "member has" : "members have"} no salary set
                and will be left out: {unpaid.slice(0, 3).map((r) => `${r.staff.first_name} ${r.staff.last_name}`).join(", ")}
                {unpaid.length > 3 ? ` and ${unpaid.length - 3} more` : ""}. Set salaries from each
                staff member's profile.
              </p>
            )}

            <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{totals.staffCount} staff</span>
              <span className="font-mono font-semibold tabular-nums">{formatMoney(totals.totalNet)} net</span>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createRun.mutate()}
            disabled={createRun.isPending || payable.length === 0}
            className="gap-1.5"
          >
            {createRun.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create draft run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
