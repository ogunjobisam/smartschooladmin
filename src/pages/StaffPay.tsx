import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Eye, Wallet } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PayslipDialog } from "@/components/payroll/PayslipDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { supabase } from "@/integrations/supabase/client";
import type { PayslipData } from "@/lib/payslip";

/**
 * What a staff member sees of their own pay.
 *
 * Their own payslips and nothing else — row-level security enforces that, and
 * only for runs that have been approved or paid. A draft run is a proposal that
 * can still be rejected, and showing someone a figure that later changes is worse
 * than showing them nothing.
 */
export default function StaffPay() {
  const { user } = useAuth();
  const { formatMoney, currency } = useCurrency();
  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ["my-staff-record", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select(
          "id, first_name, last_name, staff_id_number, staff_positions(title, department, is_current), schools(name, address, email, phone, logo_url)",
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const staffId = staff?.id;

  const { data: payslips = [], isLoading: payslipsLoading } = useQuery({
    queryKey: ["my-payslips", staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_run_items")
        .select("id, basic, allowances, pension, tax, deductions, net_pay, payroll_runs(period_label, run_date, status)")
        .eq("staff_id", staffId!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!staffId,
  });

  // Their own account number, on their own payslip. Nothing here reveals anything
  // about anybody else.
  const { data: bankDetails } = useQuery({
    queryKey: ["my-bank-details", staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_bank_details")
        .select("bank_name, account_number")
        .eq("staff_id", staffId!)
        .maybeSingle();
      return data;
    },
    enabled: !!staffId,
  });

  if (staffLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // staff.user_id is only filled in on the invite path, so anyone added without
  // "Send invite" lands here. Name the fix rather than leaving them stuck.
  if (!staff) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Pay" description="Your payslips." />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Wallet className="mb-3 h-10 w-10 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Account not linked</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Your sign-in has not been attached to a staff record yet, so there is nothing
              to show. Ask your school office to re-issue your access from your staff
              record — that is what links the two.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPos = staff.staff_positions?.find((p) => p.is_current);
  type MyPayslip = (typeof payslips)[number];

  const openPayslip = (ps: MyPayslip) => {
    setPayslipData({
      school: {
        name: staff.schools?.name || "",
        address: staff.schools?.address,
        email: staff.schools?.email,
        phone: staff.schools?.phone,
        logoUrl: staff.schools?.logo_url,
      },
      currency,
      staffName: `${staff.first_name} ${staff.last_name}`,
      staffId: staff.staff_id_number,
      department: currentPos?.department,
      position: currentPos?.title,
      periodLabel: ps.payroll_runs?.period_label || "",
      runDate: ps.payroll_runs?.run_date || "",
      status: ps.payroll_runs?.status,
      basic: ps.basic,
      allowances: ps.allowances,
      pension: ps.pension,
      tax: ps.tax,
      deductions: ps.deductions,
      netPay: ps.net_pay,
      bankName: bankDetails?.bank_name,
      accountNumber: bankDetails?.account_number,
    });
  };

  const latest = payslips[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Pay"
        description={`${staff.first_name} ${staff.last_name}${currentPos?.title ? ` — ${currentPos.title}` : ""}`}
      />

      {latest && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Latest net pay" value={formatMoney(latest.net_pay)} icon={Banknote} />
          <StatCard title="Period" value={latest.payroll_runs?.period_label || "—"} icon={Wallet} />
          <StatCard title="Payslips" value={String(payslips.length)} icon={Eye} />
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Period</TableHead>
              <TableHead className="text-xs text-right">Basic</TableHead>
              <TableHead className="text-xs text-right">Allowances</TableHead>
              <TableHead className="text-xs text-right">Deductions</TableHead>
              <TableHead className="text-xs text-right">Net pay</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payslipsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : payslips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No payslips yet. They appear here once a payroll run covering you has been
                  approved.
                </TableCell>
              </TableRow>
            ) : (
              payslips.map((ps) => (
                <TableRow key={ps.id}>
                  <TableCell className="font-medium">{ps.payroll_runs?.period_label || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(ps.basic)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(ps.allowances)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(ps.deductions)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatMoney(ps.net_pay)}</TableCell>
                  <TableCell><StatusBadge status={ps.payroll_runs?.status || "approved"} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openPayslip(ps)}>
                      <Eye className="h-3.5 w-3.5" /> Payslip
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PayslipDialog
        open={!!payslipData}
        onOpenChange={(open) => !open && setPayslipData(null)}
        data={payslipData}
      />
    </div>
  );
}
