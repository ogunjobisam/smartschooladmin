import {
  Users, GraduationCap, Receipt, CreditCard, AlertTriangle,
  Calculator, CheckSquare, Clock, FileText, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  dashboardStats, formatNaira, monthlyCollections, schoolComparison,
  pendingApprovals, recentActivity, formatNairaCompact, currentUser
} from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const activityIcons: Record<string, typeof Receipt> = {
  payment: CreditCard,
  invoice: FileText,
  approval: CheckSquare,
  student: GraduationCap,
  waiver: AlertTriangle,
};

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${currentUser.name.split(' ')[0]}`}
        description="Here's an overview of your schools today."
      />

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Students" value={dashboardStats.totalStudents.toLocaleString()} icon={GraduationCap} subtitle="Across all schools" />
        <StatCard title="Fees Collected" value={formatNaira(dashboardStats.feesCollectedThisTerm)} icon={CreditCard} mono subtitle="This term" trend={{ value: "12% vs last term", positive: true }} />
        <StatCard title="Outstanding Fees" value={formatNaira(dashboardStats.outstandingFees)} icon={Receipt} mono subtitle={`${dashboardStats.overdueStudents} students overdue`} />
        <StatCard title="Pending Approvals" value={dashboardStats.pendingApprovals.toString()} icon={CheckSquare} subtitle="Awaiting your review" />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fees Billed vs Collected */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-card-foreground">Fees Billed vs Collected</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyCollections} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => formatNairaCompact(v)} />
              <Bar dataKey="billed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Billed" />
              <Bar dataKey="collected" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Collected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* School Comparison */}
        <div className="rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-card-foreground">School Comparison — This Term</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={schoolComparison} layout="vertical" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={(v) => formatNairaCompact(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis dataKey="school" type="category" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={50} />
              <Tooltip formatter={(v: number) => formatNairaCompact(v)} />
              <Bar dataKey="collected" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} name="Collected" />
              <Bar dataKey="outstanding" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} name="Outstanding" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Pending Approvals */}
        <div className="rounded-lg border bg-card lg:col-span-3">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="text-sm font-semibold text-card-foreground">Pending Approvals</h3>
            <Link to="/approvals">
              <Button variant="ghost" size="sm" className="text-xs text-accent">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Requester</TableHead>
                <TableHead className="text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingApprovals.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><StatusBadge status="pending" /></TableCell>
                  <TableCell className="text-sm">{a.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.requester}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(a.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border bg-card lg:col-span-2">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold text-card-foreground">Recent Activity</h3>
          </div>
          <div className="divide-y">
            {recentActivity.map((a) => {
              const Icon = activityIcons[a.icon] || Clock;
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 rounded-md bg-muted p-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="text-sm font-medium text-card-foreground">{a.action}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{a.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
