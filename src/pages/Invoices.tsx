import { useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GenerateInvoicesDialog } from "@/components/forms/GenerateInvoicesDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { rowTint } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import type { Enums } from "@/integrations/supabase/types";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 20;

export default function Invoices() {
  const navigate = useNavigate();
  const { schoolId } = useAuth();
  const { formatMoney, formatMoneyCompact } = useCurrency();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Enums<"invoice_status"> | "all">("all");
  const [page, setPage] = useState(0);
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", schoolId, search, statusFilter, page],
    queryFn: async () => {
      if (!schoolId) return { invoices: [], count: 0 };

      let query = supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, due_date, issued_at, students(first_name, last_name, enrolments(classes(name)))", { count: "exact" })
        .eq("school_id", schoolId)
        .order("issued_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(`invoice_number.ilike.%${search}%`);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: invoices, count } = await query;
      return { invoices: invoices || [], count: count || 0 };
    },
    enabled: !!schoolId,
  });

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="View and manage student fee invoices.">
        <Button size="sm" className="gap-1.5" onClick={() => setGenerateOpen(true)}><Plus className="h-4 w-4" /> Generate Invoices</Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by invoice ID…" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as Enums<"invoice_status"> | "all"); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden text-xs sm:table-cell">Invoice #</TableHead>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="hidden text-xs text-right md:table-cell">Paid</TableHead>
              <TableHead className="text-xs text-right">Balance</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.invoices?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No invoices found.</TableCell>
              </TableRow>
            ) : (
              data?.invoices?.map((inv) => {
                const student = inv.students;
                const studentName = student ? `${student.first_name} ${student.last_name}` : "—";
                return (
                  <TableRow
                    key={inv.id}
                    className={cn("cursor-pointer", rowTint(inv.status))}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">
                      <span className="block max-w-[9rem] truncate sm:max-w-none">{studentName}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground sm:hidden">{inv.invoice_number}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoneyCompact(inv.total_amount)}</TableCell>
                    <TableCell className="hidden text-right font-mono text-sm tabular-nums md:table-cell">{formatMoney(inv.amount_paid)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoneyCompact(inv.total_amount - inv.amount_paid)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {Math.min((page * PAGE_SIZE) + 1, data?.count || 0)}–{Math.min((page + 1) * PAGE_SIZE, data?.count || 0)} of {data?.count || 0} invoices
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </div>

      <GenerateInvoicesDialog open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
}
