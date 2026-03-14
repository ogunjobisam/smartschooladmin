import { AlertTriangle, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatNaira } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

function ageingBadge(days: number) {
  if (days <= 30) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[11px]">0–30 days</Badge>;
  if (days <= 60) return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[11px]">31–60 days</Badge>;
  return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[11px] font-semibold">60+ days</Badge>;
}

export default function Arrears() {
  const { schoolId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["arrears", schoolId],
    queryFn: async () => {
      if (!schoolId) return { overdueInvoices: [], totalOutstanding: 0, overdueCount: 0 };

      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, due_date, status, students(first_name, last_name, enrolments(classes(name)))")
        .eq("school_id", schoolId)
        .eq("status", "overdue")
        .order("due_date", { ascending: true });

      const overdueInvoices = (invoices || []).map((inv: any) => {
        const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
        const daysOverdue = inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)) : 0;
        const studentName = inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : "—";
        const className = inv.students?.enrolments?.[0]?.classes?.name || "—";
        return { ...inv, balance, daysOverdue, studentName, className };
      });

      const totalOutstanding = overdueInvoices.reduce((s, i) => s + i.balance, 0);

      return { overdueInvoices, totalOutstanding, overdueCount: overdueInvoices.length };
    },
    enabled: !!schoolId,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Arrears & Controls" description="Monitor overdue balances and manage exceptions." />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Total Outstanding" value={formatNaira(data?.totalOutstanding || 0)} icon={AlertTriangle} mono />
        <StatCard title="Overdue Students" value={(data?.overdueCount || 0).toString()} icon={Users} subtitle="With overdue invoices" />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-card-foreground">Overdue Invoices</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Invoice</TableHead>
              <TableHead className="text-xs text-right">Outstanding</TableHead>
              <TableHead className="text-xs">Ageing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.overdueInvoices?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No overdue invoices.</TableCell>
              </TableRow>
            ) : (
              data?.overdueInvoices?.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.studentName}</TableCell>
                  <TableCell>{s.className}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.invoice_number}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatNaira(s.balance)}</TableCell>
                  <TableCell>{ageingBadge(s.daysOverdue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
