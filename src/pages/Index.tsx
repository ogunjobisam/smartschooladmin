import {
  GraduationCap, Receipt, CreditCard,
  CheckSquare, Clock, FileText, ArrowRight, Medal, Sparkles
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useCurrency } from "@/hooks/use-currency";
import { canAccessPath, canManageStudents, portalPathForRole } from "@/lib/access";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { UpcomingEvents } from "@/components/events/UpcomingEvents";
import { AchievementHighlights } from "@/components/achievements/AchievementHighlights";
import { NAV_ITEMS } from "@/lib/access";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, orgId, schoolId, userRole } = useAuth();
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const { formatMoney } = useCurrency();
  // Parents and students each have their own portal; the school dashboard is
  // not theirs to see.
  const portalPath = portalPathForRole(userRole);
  // Approvals are only the business of the people who can action them.
  const canReviewApprovals = canAccessPath(userRole, "/approvals");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", schoolId, orgId],
    queryFn: async () => {
      if (!schoolId) return null;

      const [studentsRes, staffRes, invoicesRes, approvalsRes] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("employment_status", "active"),
        supabase.from("invoices").select("total_amount, amount_paid, status").eq("school_id", schoolId),
        orgId ? supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending") : { count: 0 },
      ]);

      const invoices = invoicesRes.data || [];
      const totalBilled = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
      const totalCollected = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
      const overdueCount = invoices.filter(i => i.status === "overdue").length;

      return {
        totalStudents: studentsRes.count || 0,
        totalStaff: staffRes.count || 0,
        feesCollected: totalCollected,
        outstandingFees: totalBilled - totalCollected,
        overdueStudents: overdueCount,
        pendingApprovals: approvalsRes.count || 0,
      };
    },
    enabled: !!schoolId && !portalPath,
  });

  const { data: approvals } = useQuery({
    queryKey: ["pending-approvals", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("approval_requests")
        .select("id, type, description, amount, status, created_at")
        .eq("org_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!orgId && !portalPath && canReviewApprovals,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["recent-activity", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, detail, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!orgId && !portalPath,
  });

  const activityIcons: Record<string, typeof Receipt> = {
    payment: CreditCard,
    invoice: FileText,
    approval: CheckSquare,
    student: GraduationCap,
    approve: CheckSquare,
    create: FileText,
  };

  const timeAgo = (dateStr: string) => {
    // Clamp at 0: clock skew between the browser and the database can otherwise
    // render a just-created row as "-1m ago".
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // A short list of the screens this role actually uses, so the dashboard always
  // offers a way onwards instead of dead-ending on the stats.
  const quickLinks = NAV_ITEMS.filter(
    (item) =>
      ["students", "invoices", "payments", "attendance", "exams", "wall", "reports", "announcements"].includes(item.key) &&
      canAccessPath(userRole, item.url),
  ).slice(0, 8);

  // This has to come after every hook above: returning early while `userRole`
  // is still resolving would change the hook count between renders and crash
  // the page.
  if (portalPath) return <Navigate to={portalPath} replace />;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-accent/5 to-background p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
              <Sparkles className="h-3.5 w-3.5" /> Today at a glance
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {greeting()}, {displayName.split(' ')[0]}
            </h1>
            <p className="text-sm text-muted-foreground">
              Fees, results, people and celebrations — all in one place.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1 self-start sm:self-auto">
            <Link to="/wall">
              <Medal className="h-4 w-4" /> Achievement wall
            </Link>
          </Button>
        </div>
      </div>

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </div>
          ))
        ) : (
          <>
            <StatCard title="Total Students" value={(stats?.totalStudents || 0).toLocaleString()} icon={GraduationCap} subtitle="Active students" />
            <StatCard title="Fees Collected" value={formatMoney(stats?.feesCollected || 0)} icon={CreditCard} mono subtitle="This term" />
            <StatCard title="Outstanding Fees" value={formatMoney(stats?.outstandingFees || 0)} icon={Receipt} mono subtitle={`${stats?.overdueStudents || 0} overdue`} />
            {canReviewApprovals && (
              <StatCard title="Pending Approvals" value={(stats?.pendingApprovals || 0).toString()} icon={CheckSquare} subtitle="Awaiting review" />
            )}
          </>
        )}
      </div>

      {quickLinks.length > 0 && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.key}
              to={item.url}
              className="group flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:border-accent/50 hover:bg-accent/5"
            >
              <span className="text-sm font-medium text-card-foreground">{item.title}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <UpcomingEvents limit={3} />
        <AchievementHighlights limit={4} />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Pending Approvals */}
        {canReviewApprovals && (
        <div className="rounded-lg border bg-card xl:col-span-3 min-w-0 overflow-hidden">
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
                <TableHead className="text-right text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground text-sm">No pending approvals</TableCell>
                </TableRow>
              ) : (
                approvals?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><StatusBadge status="pending" /></TableCell>
                    <TableCell className="text-sm">{a.description}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(a.amount || 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        )}



        {/* Recent Activity */}
        <div className={`rounded-lg border bg-card min-w-0 overflow-hidden ${canReviewApprovals ? "xl:col-span-2" : "xl:col-span-5"}`}>
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold text-card-foreground">Recent Activity</h3>
          </div>
          <div className="divide-y">
            {auditLogs?.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-muted-foreground">No recent activity</div>
            ) : (
              auditLogs?.map((a) => {
                const Icon = activityIcons[a.action] || activityIcons[a.entity_type] || Clock;
                return (
                  <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 rounded-md bg-muted p-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-card-foreground capitalize">{a.action} {a.entity_type}</p>
                      <p className="text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
