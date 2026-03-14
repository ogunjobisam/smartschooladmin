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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Users, GraduationCap, FileText, CreditCard, AlertTriangle, Calculator, CheckSquare, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { exportToCsv } from "@/lib/csv-export";

export default function ProprietorDashboard() {
  const { orgId, schools } = useAuth();
  const { formatMoney, currency } = useCurrency();
  const [selectedSchool, setSelectedSchool] = useState<string>("all");

  // Fetch KPIs
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["proprietor-kpis", orgId, selectedSchool],
    queryFn: async () => {
      if (!orgId) return null;
      const schoolFilter = selectedSchool !== "all" ? selectedSchool : null;

      // Students
      let studentsQ = supabase.from("students").select("id", { count: "exact", head: true });
      if (schoolFilter) studentsQ = studentsQ.eq("school_id", schoolFilter);
      else studentsQ = studentsQ.in("school_id", schools.map(s => s.id));
      const { count: totalStudents } = await studentsQ;

      // Staff
      let staffQ = supabase.from("staff").select("id", { count: "exact", head: true });
      if (schoolFilter) staffQ = staffQ.eq("school_id", schoolFilter);
      else staffQ = staffQ.in("school_id", schools.map(s => s.id));
      const { count: totalStaff } = await staffQ;

      // Invoices
      let invQ = supabase.from("invoices").select("total_amount, amount_paid, status");
      if (schoolFilter) invQ = invQ.eq("school_id", schoolFilter);
      else invQ = invQ.in("school_id", schools.map(s => s.id));
      const { data: invoices } = await invQ;

      const totalInvoiced = (invoices || []).reduce((s, i) => s + (i.total_amount || 0), 0);
      const totalCollected = (invoices || []).reduce((s, i) => s + (i.amount_paid || 0), 0);
      const totalOutstanding = totalInvoiced - totalCollected;
      const overdueInvoices = (invoices || []).filter(i => i.status === "overdue");
      const overdueCount = overdueInvoices.length;
      const overdueValue = overdueInvoices.reduce((s, i) => s + (i.total_amount - i.amount_paid), 0);

      // Pending approvals
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
        pendingApprovals: pendingApprovals || 0,
      };
    },
    enabled: !!orgId && schools.length > 0,
  });

  // School comparison
  const { data: schoolComparison = [] } = useQuery({
    queryKey: ["school-comparison", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const results = [];
      for (const school of schools) {
        const [{ count: students }, { count: staff }, { data: invs }] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", school.id),
          supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", school.id),
          supabase.from("invoices").select("total_amount, amount_paid").eq("school_id", school.id),
        ]);
        const invoiced = (invs || []).reduce((s, i) => s + i.total_amount, 0);
        const collected = (invs || []).reduce((s, i) => s + i.amount_paid, 0);
        results.push({
          name: school.name,
          students: students || 0,
          staff: staff || 0,
          invoiced,
          collected,
          outstanding: invoiced - collected,
        });
      }
      return results;
    },
    enabled: !!orgId && schools.length > 1,
  });

  const handleExport = () => {
    if (schoolComparison.length === 0) return;
    const headers = ["School", "Students", "Staff", "Total Invoiced", "Total Collected", "Outstanding"];
    const rows = schoolComparison.map(s => [
      s.name, String(s.students), String(s.staff),
      String(s.invoiced), String(s.collected), String(s.outstanding),
    ]);
    exportToCsv("school-comparison-report", headers, rows);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Group Overview" description="Cross-school performance dashboard for your organisation.">
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
          <StatCard title="Total Invoiced" value={formatMoney(kpis.totalInvoiced)} icon={FileText} />
          <StatCard title="Total Collected" value={formatMoney(kpis.totalCollected)} icon={CreditCard} />
          <StatCard title="Outstanding" value={formatMoney(kpis.totalOutstanding)} icon={TrendingUp} />
          <StatCard title="Overdue Invoices" value={`${kpis.overdueCount} (${formatMoney(kpis.overdueValue)})`} icon={AlertTriangle} />
          <StatCard title="Pending Approvals" value={kpis.pendingApprovals.toString()} icon={CheckSquare} />
        </div>
      ) : null}

      {/* School Comparison */}
      {schools.length > 1 && schoolComparison.length > 0 && (
        <>
          <Card>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">School Comparison</CardTitle>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schoolComparison.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.students}</TableCell>
                      <TableCell className="text-right">{s.staff}</TableCell>
                      <TableCell className="text-right">{formatMoney(s.invoiced)}</TableCell>
                      <TableCell className="text-right">{formatMoney(s.collected)}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{formatMoney(s.outstanding)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
