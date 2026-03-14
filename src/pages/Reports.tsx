import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { useCurrency } from "@/hooks/use-currency";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GraduationCap, CreditCard, AlertTriangle, Calculator,
  TrendingUp, Users, FileText, Download, BarChart3
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { exportToCsv } from "@/lib/csv-export";

const CHART_COLORS = [
  "hsl(215, 90%, 55%)", "hsl(152, 60%, 40%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(270, 60%, 55%)"
];

export default function Reports() {
  const { schoolId, orgId } = useAuth();
  const { formatMoney } = useCurrency();

  // Overall stats
  const { data: overallStats, isLoading: loadingStats } = useQuery({
    queryKey: ["report-overall", schoolId],
    queryFn: async () => {
      if (!schoolId) return { totalCollected: 0, totalBilled: 0, totalPayroll: 0, studentCount: 0, staffCount: 0, collectionRate: 0 };
      const [invRes, payRes, prRes, stRes, sfRes] = await Promise.all([
        supabase.from("invoices").select("total_amount, amount_paid").eq("school_id", schoolId),
        supabase.from("payments").select("amount").eq("school_id", schoolId),
        supabase.from("payroll_runs").select("total_net").eq("school_id", schoolId).eq("status", "paid"),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("employment_status", "active"),
      ]);
      const totalBilled = (invRes.data || []).reduce((s, i) => s + (i.total_amount || 0), 0);
      const totalCollected = (payRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);
      const totalPayroll = (prRes.data || []).reduce((s, r) => s + (r.total_net || 0), 0);
      const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
      return { totalBilled, totalCollected, totalPayroll, studentCount: stRes.count || 0, staffCount: sfRes.count || 0, collectionRate };
    },
    enabled: !!schoolId,
  });

  // Payments by method (for pie chart)
  const { data: paymentsByMethod, isLoading: loadingPM } = useQuery({
    queryKey: ["report-payments-by-method", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("payments").select("payment_method, amount").eq("school_id", schoolId);
      const grouped: Record<string, number> = {};
      (data || []).forEach((p: any) => { grouped[p.payment_method] = (grouped[p.payment_method] || 0) + (p.amount || 0); });
      return Object.entries(grouped).map(([method, total]) => ({ name: formatMethod(method), value: total })).sort((a, b) => b.value - a.value);
    },
    enabled: !!schoolId,
  });

  // Monthly revenue trend
  const { data: monthlyRevenue, isLoading: loadingMR } = useQuery({
    queryKey: ["report-monthly-revenue", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("payments").select("amount, payment_date").eq("school_id", schoolId);
      const grouped: Record<string, number> = {};
      (data || []).forEach((p: any) => {
        const d = new Date(p.payment_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        grouped[key] = (grouped[key] || 0) + (p.amount || 0);
      });
      return Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, total]) => {
          const [y, m] = month.split("-");
          const label = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en", { month: "short", year: "2-digit" });
          return { month: label, revenue: total };
        });
    },
    enabled: !!schoolId,
  });

  // Class-wise collection breakdown
  const { data: classBilling, isLoading: loadingCB } = useQuery({
    queryKey: ["report-class-billing", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount, amount_paid, students(enrolments(classes(name)))")
        .eq("school_id", schoolId);

      const grouped: Record<string, { billed: number; collected: number }> = {};
      (invoices || []).forEach((inv: any) => {
        const className = inv.students?.enrolments?.[0]?.classes?.name || "Unassigned";
        if (!grouped[className]) grouped[className] = { billed: 0, collected: 0 };
        grouped[className].billed += inv.total_amount || 0;
        grouped[className].collected += inv.amount_paid || 0;
      });
      return Object.entries(grouped)
        .map(([name, { billed, collected }]) => ({ name, billed, collected, balance: billed - collected }))
        .sort((a, b) => b.billed - a.billed);
    },
    enabled: !!schoolId,
  });

  // Arrears aging
  const { data: arrearsAging, isLoading: loadingAA } = useQuery({
    queryKey: ["report-arrears-aging", schoolId],
    queryFn: async () => {
      if (!schoolId) return { under30: 0, under60: 0, over60: 0, total: 0 };
      const { data } = await supabase
        .from("invoices").select("total_amount, amount_paid, due_date")
        .eq("school_id", schoolId).eq("status", "overdue");
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

  // Payroll history
  const { data: payrollSummary, isLoading: loadingPS } = useQuery({
    queryKey: ["report-payroll-summary", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase
        .from("payroll_runs").select("period_label, total_gross, total_deductions, total_net, staff_count, status")
        .eq("school_id", schoolId).order("run_date", { ascending: false }).limit(6);
      return data || [];
    },
    enabled: !!schoolId,
  });

  const formatMethod = (m: string) => m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
        <p className="text-xs font-medium text-card-foreground">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs tabular-nums" style={{ color: p.color }}>{p.name}: {formatMoney(p.value)}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & Analytics" description="Financial overview, revenue trends, and operational insights.">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
          if (!classBilling?.length) return;
          exportToCsv("class-billing-report", ["Class", "Billed", "Collected", "Balance"],
            classBilling.map(c => [c.name, c.billed.toString(), c.collected.toString(), c.balance.toString()]));
        }}>
          <Download className="h-4 w-4" /> Export Report
        </Button>
      </PageHeader>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loadingStats ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-32" /></div>
          ))
        ) : (
          <>
            <StatCard title="Total Billed" value={formatMoney(overallStats?.totalBilled || 0)} icon={FileText} mono />
            <StatCard title="Total Collected" value={formatMoney(overallStats?.totalCollected || 0)} icon={CreditCard} mono />
            <StatCard title="Collection Rate" value={`${overallStats?.collectionRate || 0}%`} icon={TrendingUp} subtitle={`${overallStats?.studentCount} students`} />
            <StatCard title="Total Payroll" value={formatMoney(overallStats?.totalPayroll || 0)} icon={Calculator} mono />
            <StatCard title="Active Staff" value={(overallStats?.staffCount || 0).toLocaleString()} icon={Users} />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Revenue Trend */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-accent" /> Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMR ? (
              <Skeleton className="h-[250px] w-full" />
            ) : monthlyRevenue?.length === 0 ? (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No payment data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyRevenue} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatMoneyCompact(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods Pie */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4 text-accent" /> Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPM ? (
              <Skeleton className="h-[250px] w-full" />
            ) : paymentsByMethod?.length === 0 ? (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">No payment data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={paymentsByMethod} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {paymentsByMethod?.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Class-wise breakdown + Arrears */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Class billing */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4 text-accent" /> Billing by Class</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCB ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : classBilling?.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No invoice data.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={classBilling} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatMoneyCompact(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="billed" name="Billed" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name="Collected" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Class</TableHead>
                      <TableHead className="text-xs text-right">Billed</TableHead>
                      <TableHead className="text-xs text-right">Collected</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classBilling?.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(c.billed)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-success">{formatMoney(c.collected)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(c.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Arrears Aging */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-destructive" /> Arrears Aging</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAA ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
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
                        <span className="font-mono tabular-nums text-destructive">{formatMoney(bucket.value)}</span>
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
          </CardContent>
        </Card>
      </div>

      {/* Payroll History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4 text-accent" /> Payroll History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}</TableRow>
                ))
              ) : payrollSummary?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No payroll data.</TableCell></TableRow>
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
                        r.status === 'paid' || r.status === 'approved' ? 'bg-success/10 text-success border-success/20' :
                        r.status === 'pending' ? 'bg-warning/10 text-warning border-warning/20' :
                        'bg-muted text-muted-foreground'
                      }`}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
