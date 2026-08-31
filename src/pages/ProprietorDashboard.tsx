import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Download, Users, GraduationCap, FileText, CreditCard, AlertTriangle,
  Calculator, CheckSquare, TrendingUp, ArrowRight, Clock, Percent, Wallet
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { exportToCsv } from "@/lib/csv-export";
import { Link } from "react-router-dom";

const COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--warning, 38 92% 50%))",
];

export default function ProprietorDashboard() {
  const { orgId, schools } = useAuth();
  const { formatMoney } = useCurrency();
  const [selectedSchool, setSelectedSchool] = useState<string>("all");

  // Fetch KPIs
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["proprietor-kpis", orgId, selectedSchool],
    queryFn: async () => {
      if (!orgId) return null;
      const schoolFilter = selectedSchool !== "all" ? selectedSchool : null;
      const schoolIds = schools.map(s => s.id);
      if (schoolIds.length === 0) return null;

      let studentsQ = supabase.from("students").select("id", { count: "exact", head: true });
      if (schoolFilter) studentsQ = studentsQ.eq("school_id", schoolFilter);
      else studentsQ = studentsQ.in("school_id", schoolIds);
      const { count: totalStudents } = await studentsQ;

      let staffQ = supabase.from("staff").select("id", { count: "exact", head: true });
      if (schoolFilter) staffQ = staffQ.eq("school_id", schoolFilter);
      else staffQ = staffQ.in("school_id", schoolIds);
      const { count: totalStaff } = await staffQ;

      let invQ = supabase.from("invoices").select("total_amount, amount_paid, status");
      if (schoolFilter) invQ = invQ.eq("school_id", schoolFilter);
      else invQ = invQ.in("school_id", schoolIds);
      const { data: invoices } = await invQ;

      const totalInvoiced = (invoices || []).reduce((s, i) => s + (i.total_amount || 0), 0);
      const totalCollected = (invoices || []).reduce((s, i) => s + (i.amount_paid || 0), 0);
      const totalOutstanding = totalInvoiced - totalCollected;
      const overdueInvoices = (invoices || []).filter(i => i.status === "overdue");
      const overdueCount = overdueInvoices.length;
      const overdueValue = overdueInvoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0);
      const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

      const paidCount = (invoices || []).filter(i => i.status === "paid").length;
      const pendingCount = (invoices || []).filter(i => i.status === "pending").length;
      const draftCount = (invoices || []).filter(i => i.status === "draft").length;

      const { count: pendingApprovals } = await supabase
        .from("approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending");

      return {
        totalStudents: totalStudents || 0,
        totalStaff: totalStaff || 0,
        totalInvoiced,
        totalCollected,
        totalOutstanding,
        overdueCount,
        overdueValue,
        collectionRate,
        pendingApprovals: pendingApprovals || 0,
        invoiceBreakdown: [
          { name: "Paid", value: paidCount, color: COLORS[0] },
          { name: "Pending", value: pendingCount, color: COLORS[1] },
          { name: "Overdue", value: overdueCount, color: COLORS[2] },
          { name: "Draft", value: draftCount, color: COLORS[3] },
        ].filter(i => i.value > 0),
      };
    },
    enabled: !!orgId && schools.length > 0,
  });

  // School comparison
  const { data: schoolComparison = [] } = useQuery({
    queryKey: ["school-comparison", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      // Annotated because a bare [] infers never[] under strictNullChecks and
      // the early `return []` above then pins the query's type to never[].
      const results: {
        name: string; students: number; staff: number;
        invoiced: number; collected: number; outstanding: number; collectionRate: number;
      }[] = [];
      for (const school of schools) {
        const [{ count: students }, { count: staff }, { data: invs }] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", school.id),
          supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", school.id),
          supabase.from("invoices").select("total_amount, amount_paid").eq("school_id", school.id),
        ]);
        const invoiced = (invs || []).reduce((s, i) => s + i.total_amount, 0);
        const collected = (invs || []).reduce((s, i) => s + i.amount_paid, 0);
        const rate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;
        results.push({
          name: school.name,
          students: students || 0,
          staff: staff || 0,
          invoiced,
          collected,
          outstanding: invoiced - collected,
          collectionRate: rate,
        });
      }
      return results;
    },
    enabled: !!orgId && schools.length > 0,
  });

  // Payroll summary
  const { data: payrollSummary } = useQuery({
    queryKey: ["proprietor-payroll", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const schoolIds = schools.map(s => s.id);
      const { data: runs } = await supabase
        .from("payroll_runs")
        .select("total_gross, total_net, total_deductions, staff_count, status, period_label")
        .in("school_id", schoolIds)
        .order("run_date", { ascending: false })
        .limit(6);

      const totalPayroll = (runs || []).filter(r => r.status === "paid" || r.status === "approved").reduce((s, r) => s + (r.total_net || 0), 0);
      const latestRun = runs?.[0];
      return { totalPayroll, latestRun, recentRuns: runs || [] };
    },
    enabled: !!orgId && schools.length > 0,
  });

  // Recent approvals
  const { data: recentApprovals = [] } = useQuery({
    queryKey: ["proprietor-approvals", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("approval_requests")
        .select("id, type, description, amount, status, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!orgId,
  });

  // Recent activity
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["proprietor-activity", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, detail, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: !!orgId,
  });

  const handleExport = () => {
    if (schoolComparison.length === 0) return;
    const headers = ["School", "Students", "Staff", "Total Invoiced", "Total Collected", "Outstanding", "Collection Rate"];
    const rows = schoolComparison.map(s => [
      s.name, String(s.students), String(s.staff),
      String(s.invoiced), String(s.collected), String(s.outstanding), `${s.collectionRate}%`,
    ]);
    exportToCsv("proprietor-report", headers, rows);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Proprietor Dashboard" description="Organisation-wide performance overview across all schools.">
        <div className="flex items-center gap-2">
          {schools.length > 1 && (
            <Select value={selectedSchool} onValueChange={setSelectedSchool}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                {schools.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Students" value={kpis.totalStudents.toLocaleString()} icon={GraduationCap} />
          <StatCard title="Total Staff" value={kpis.totalStaff.toLocaleString()} icon={Users} />
          <StatCard title="Total Invoiced" value={formatMoney(kpis.totalInvoiced)} icon={FileText} mono />
          <StatCard title="Total Collected" value={formatMoney(kpis.totalCollected)} icon={CreditCard} mono />
          <StatCard title="Outstanding" value={formatMoney(kpis.totalOutstanding)} icon={TrendingUp} mono />
          <StatCard title="Collection Rate" value={`${kpis.collectionRate}%`} icon={Percent} subtitle={kpis.collectionRate >= 80 ? "On track" : "Needs attention"} />
          <StatCard title="Overdue Invoices" value={`${kpis.overdueCount}`} icon={AlertTriangle} subtitle={formatMoney(kpis.overdueValue)} />
          <StatCard title="Pending Approvals" value={kpis.pendingApprovals.toString()} icon={CheckSquare} />
        </div>
      ) : null}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Collections by School */}
        {schoolComparison.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Collections by School</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={schoolComparison}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatMoney(value)} />
                  <Bar dataKey="collected" fill="hsl(var(--accent))" name="Collected" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outstanding" fill="hsl(var(--destructive))" name="Outstanding" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Invoice Status Breakdown */}
        {kpis?.invoiceBreakdown && kpis.invoiceBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Status</CardTitle>
            </CardHeader>
            <CardContent className="h-72 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={kpis.invoiceBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {kpis.invoiceBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 text-xs">
                {kpis.invoiceBreakdown.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-muted-foreground">{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom Row: Approvals + Payroll + Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pending Approvals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Pending Approvals</CardTitle>
            <Link to="/approvals">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-accent">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentApprovals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No pending approvals</p>
            ) : (
              recentApprovals.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium capitalize">{a.type.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{a.description}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={a.status} />
                    {a.amount != null && a.amount > 0 && <p className="mt-0.5 font-mono text-xs tabular-nums">{formatMoney(a.amount)}</p>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Payroll Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-accent" /> Payroll
            </CardTitle>
            <Link to="/payroll">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-accent">
                Manage <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {payrollSummary?.latestRun ? (
              <>
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Latest Run</span>
                    <span className="font-medium">{payrollSummary.latestRun.period_label}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Net Payout</span>
                    <span className="font-mono font-semibold tabular-nums">{formatMoney(payrollSummary.latestRun.total_net)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Staff Count</span>
                    <span>{payrollSummary.latestRun.staff_count}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <StatusBadge status={payrollSummary.latestRun.status} />
                  </div>
                </div>
                {payrollSummary.recentRuns.length > 1 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Recent Runs</p>
                    {payrollSummary.recentRuns.slice(1, 4).map((run, i) => (
                      <div key={i} className="flex items-center justify-between text-xs rounded bg-muted/30 px-2 py-1.5">
                        <span>{run.period_label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums">{formatMoney(run.total_net)}</span>
                          <StatusBadge status={run.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No payroll runs yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-accent" /> Recent Activity
            </CardTitle>
            <Link to="/audit-log">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-accent">
                Full log <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 text-sm">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium capitalize truncate">{a.action} {a.entity_type}</p>
                      {a.detail && <p className="text-xs text-muted-foreground truncate">{a.detail}</p>}
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* School Comparison Table */}
      {schoolComparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">School Performance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Staff</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schoolComparison.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.staff}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(s.invoiced)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-success">{formatMoney(s.collected)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(s.outstanding)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className={s.collectionRate >= 80 ? "bg-success/10 text-success" : s.collectionRate >= 50 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"}>
                        {s.collectionRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/students">
              <Button variant="outline" className="w-full justify-start gap-2 h-12">
                <GraduationCap className="h-4 w-4 text-accent" /> Manage Students
              </Button>
            </Link>
            <Link to="/invoices">
              <Button variant="outline" className="w-full justify-start gap-2 h-12">
                <FileText className="h-4 w-4 text-accent" /> View Invoices
              </Button>
            </Link>
            <Link to="/payroll">
              <Button variant="outline" className="w-full justify-start gap-2 h-12">
                <Wallet className="h-4 w-4 text-accent" /> Run Payroll
              </Button>
            </Link>
            <Link to="/settings">
              <Button variant="outline" className="w-full justify-start gap-2 h-12">
                <CheckSquare className="h-4 w-4 text-accent" /> Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
