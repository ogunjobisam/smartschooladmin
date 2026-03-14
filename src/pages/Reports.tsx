import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { formatNaira } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap, CreditCard, AlertTriangle, Calculator,
  TrendingUp, Users, FileText
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function Reports() {
  const { schoolId, orgId } = useAuth();

  // Fee collection by method
  const { data: paymentsByMethod, isLoading: loadingPM } = useQuery({
    queryKey: ["report-payments-by-method", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("payments")
        .select("payment_method, amount")
        .eq("school_id", schoolId);
      
      const grouped: Record<string, number> = {};
      (data || []).forEach((p: any) => {
        grouped[p.payment_method] = (grouped[p.payment_method] || 0) + (p.amount || 0);
      });
      return Object.entries(grouped).map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);
    },
    enabled: !!schoolId,
  });

  // Arrears aging summary
  const { data: arrearsAging, isLoading: loadingAA } = useQuery({
    queryKey: ["report-arrears-aging", schoolId],
    queryFn: async () => {
      if (!schoolId) return { under30: 0, under60: 0, over60: 0, total: 0 };
      const { data } = await supabase
        .from("invoices")
        .select("total_amount, amount_paid, due_date")
        .eq("school_id", schoolId)
        .eq("status", "overdue");

      let under30 = 0, under60 = 0, over60 = 0;
      (data || []).forEach((inv: any) => {
        const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
        const days = inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)) : 0;
        if (days <= 30) under30 += balance;
        else if (days <= 60) under60 += balance;
        else over60 += balance;
      });
      return { under30, under60, over60, total: under30 + under60 + over60 };
    },
    enabled: !!schoolId,
  });

  // Payroll summary
  const { data: payrollSummary, isLoading: loadingPS } = useQuery({
    queryKey: ["report-payroll-summary", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("payroll_runs")
        .select("period_label, total_gross, total_deductions, total_net, staff_count, status")
        .eq("school_id", schoolId)
        .order("run_date", { ascending: false })
        .limit(6);
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Overall stats
  const { data: overallStats } = useQuery({
    queryKey: ["report-overall", schoolId],
    queryFn: async () => {
      if (!schoolId) return { totalCollected: 0, totalBilled: 0, totalPayroll: 0, studentCount: 0 };
      const [invRes, payRes, prRes, stRes] = await Promise.all([
        supabase.from("invoices").select("total_amount, amount_paid").eq("school_id", schoolId),
        supabase.from("payments").select("amount").eq("school_id", schoolId),
        supabase.from("payroll_runs").select("total_net").eq("school_id", schoolId).eq("status", "paid"),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
      ]);
      const totalBilled = (invRes.data || []).reduce((s, i) => s + (i.total_amount || 0), 0);
      const totalCollected = (payRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);
      const totalPayroll = (prRes.data || []).reduce((s, r) => s + (r.total_net || 0), 0);
      return { totalBilled, totalCollected, totalPayroll, studentCount: stRes.count || 0 };
    },
    enabled: !!schoolId,
  });

  const formatMethod = (m: string) => m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Financial overview and operational insights." />

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Billed" value={formatNaira(overallStats?.totalBilled || 0)} icon={FileText} mono />
        <StatCard title="Total Collected" value={formatNaira(overallStats?.totalCollected || 0)} icon={CreditCard} mono />
        <StatCard title="Total Payroll Paid" value={formatNaira(overallStats?.totalPayroll || 0)} icon={Calculator} mono />
        <StatCard title="Active Students" value={(overallStats?.studentCount || 0).toLocaleString()} icon={GraduationCap} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Collections by Payment Method */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-accent" /> Collections by Payment Method
            </h3>
          </div>
          <div className="p-5">
            {loadingPM ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : paymentsByMethod?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No payment data.</p>
            ) : (
              <div className="space-y-3">
                {paymentsByMethod?.map((pm) => {
                  const totalAll = paymentsByMethod.reduce((s, p) => s + p.total, 0);
                  const pct = totalAll > 0 ? Math.round((pm.total / totalAll) * 100) : 0;
                  return (
                    <div key={pm.method} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{formatMethod(pm.method)}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">{formatNaira(pm.total)} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Arrears Aging */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Arrears Aging Analysis
            </h3>
          </div>
          <div className="p-5">
            {loadingAA ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "0–30 Days", value: arrearsAging?.under30 || 0, color: "bg-warning" },
                  { label: "31–60 Days", value: arrearsAging?.under60 || 0, color: "bg-destructive/70" },
                  { label: "60+ Days", value: arrearsAging?.over60 || 0, color: "bg-destructive" },
                ].map((bucket) => {
                  const total = arrearsAging?.total || 1;
                  const pct = Math.round((bucket.value / total) * 100) || 0;
                  return (
                    <div key={bucket.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{bucket.label}</span>
                        <span className="font-mono tabular-nums text-destructive">{formatNaira(bucket.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className={`h-full rounded-full ${bucket.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold border-t pt-3">
                  <span>Total Outstanding</span>
                  <span className="font-mono tabular-nums text-destructive">{formatNaira(arrearsAging?.total || 0)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payroll History */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <Calculator className="h-4 w-4 text-accent" /> Payroll History
          </h3>
        </div>
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
            {loadingPS ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : payrollSummary?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No payroll data.</TableCell>
              </TableRow>
            ) : (
              payrollSummary?.map((r: any) => (
                <TableRow key={r.period_label}>
                  <TableCell className="font-medium">{r.period_label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.staff_count}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.total_gross)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatNaira(r.total_deductions)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(r.total_net)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] capitalize ${
                      r.status === 'paid' ? 'bg-success/10 text-success border-success/20' :
                      r.status === 'approved' ? 'bg-success/10 text-success border-success/20' :
                      r.status === 'pending' ? 'bg-warning/10 text-warning border-warning/20' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {r.status}
                    </Badge>
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
