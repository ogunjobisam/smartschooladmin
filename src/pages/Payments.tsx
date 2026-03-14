import { useState } from "react";
import { CreditCard, Plus, Search, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/mock-data";
import { exportToCsv } from "@/lib/csv-export";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function Payments() {
  const navigate = useNavigate();
  const { schoolId } = useAuth();
  const [search, setSearch] = useState("");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", schoolId, search],
    queryFn: async () => {
      if (!schoolId) return [];
      let query = supabase
        .from("payments")
        .select("id, amount, payment_method, payment_date, reference_number, students(first_name, last_name)")
        .eq("school_id", schoolId)
        .order("payment_date", { ascending: false })
        .limit(50);

      if (search) {
        query = query.or(`reference_number.ilike.%${search}%`);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: stats } = useQuery({
    queryKey: ["payment-stats", schoolId],
    queryFn: async () => {
      if (!schoolId) return { today: 0, week: 0, month: 0 };
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

      const [todayRes, weekRes, monthRes] = await Promise.all([
        supabase.from("payments").select("amount").eq("school_id", schoolId).gte("payment_date", today),
        supabase.from("payments").select("amount").eq("school_id", schoolId).gte("payment_date", weekAgo),
        supabase.from("payments").select("amount").eq("school_id", schoolId).gte("payment_date", monthStart),
      ]);

      const sum = (arr: any[]) => arr?.reduce((s, r) => s + (r.amount || 0), 0) || 0;
      return { today: sum(todayRes.data || []), week: sum(weekRes.data || []), month: sum(monthRes.data || []) };
    },
    enabled: !!schoolId,
  });

  const formatMethod = (m: string) => m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Record and manage fee payments.">
        <Button size="sm" className="gap-1.5" onClick={() => navigate("/payments/new")}>
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Today's Collections" value={formatNaira(stats?.today || 0)} icon={CreditCard} mono />
        <StatCard title="This Week" value={formatNaira(stats?.week || 0)} icon={CreditCard} mono />
        <StatCard title="This Month" value={formatNaira(stats?.month || 0)} icon={CreditCard} mono />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search payments…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Reference</TableHead>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Method</TableHead>
              <TableHead className="text-xs">Date</TableHead>
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
            ) : payments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No payments found.</TableCell>
              </TableRow>
            ) : (
              payments?.map((p: any) => {
                const student = p.students;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.reference_number || "—"}</TableCell>
                    <TableCell className="font-medium">{student ? `${student.first_name} ${student.last_name}` : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(p.amount)}</TableCell>
                    <TableCell>{formatMethod(p.payment_method)}</TableCell>
                    <TableCell className="tabular-nums">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
