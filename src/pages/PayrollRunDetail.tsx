import { useState } from "react";
import { ArrowLeft, CheckCircle, XCircle, Download, Eye } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/use-currency";
import { exportToCsv } from "@/lib/csv-export";
import { PayslipView } from "@/components/payroll/PayslipView";
import { DocumentsTab } from "@/components/documents/DocumentsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, schoolId, orgId } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const [payslipData, setPayslipData] = useState<any>(null);

  const { data: run, isLoading } = useQuery({
    queryKey: ["payroll-run", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("*, schools(name)")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: items } = useQuery({
    queryKey: ["payroll-run-items", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_run_items")
        .select("id, basic, allowances, deductions, net_pay, staff(first_name, last_name, staff_id_number, staff_positions(title, department, is_current))")
        .eq("payroll_run_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const handleApprove = async () => {
    const { error } = await supabase.from("payroll_runs").update({
      status: "approved" as any,
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }).eq("id", id!);
    if (error) { toast.error("Failed to approve"); return; }
    toast.success("Payroll approved");
    queryClient.invalidateQueries({ queryKey: ["payroll-run", id] });
  };

  const handleReject = async () => {
    const { error } = await supabase.from("payroll_runs").update({
      status: "rejected" as any,
    }).eq("id", id!);
    if (error) { toast.error("Failed to reject"); return; }
    toast.success("Payroll rejected");
    queryClient.invalidateQueries({ queryKey: ["payroll-run", id] });
  };

  const handleExportBank = () => {
    if (!items || items.length === 0) return;
    const headers = ["Staff ID", "Name", "Bank", "Account", "Net Pay"];
    const rows = items.map((s: any) => [
      s.staff?.staff_id_number || "",
      `${s.staff?.first_name || ""} ${s.staff?.last_name || ""}`,
      "", // bank info would come from staff_bank_details
      "",
      (s.net_pay / 100).toFixed(2),
    ]);
    exportToCsv(`bank-batch-${run?.period_label || "payroll"}`, headers, rows);
    toast.success("Bank batch CSV exported");
  };

  const openPayslip = (s: any) => {
    const pos = s.staff?.staff_positions?.find((p: any) => p.is_current);
    setPayslipData({
      staffName: `${s.staff?.first_name} ${s.staff?.last_name}`,
      staffId: s.staff?.staff_id_number || "",
      department: pos?.department || "",
      position: pos?.title || "",
      periodLabel: run?.period_label || "",
      runDate: run?.run_date || "",
      basic: s.basic,
      allowances: s.allowances,
      deductions: s.deductions,
      netPay: s.net_pay,
      schoolName: run?.schools?.name || "",
    });
  };

  if (isLoading || !run) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/payroll"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Payroll</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{run.period_label}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{run.period_label}</h2>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground">{run.schools?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">Run date: {run.run_date}</p>
          </div>
          {run.status === "pending" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReject}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
              <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground" onClick={handleApprove}><CheckCircle className="h-3.5 w-3.5" /> Approve Payroll</Button>
            </div>
          )}
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-4">
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Staff</p><p className="mt-1 text-lg font-bold">{run.staff_count}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Gross Total</p><p className="mt-1 font-mono text-lg font-bold tabular-nums">{formatMoney(run.total_gross)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Deductions</p><p className="mt-1 font-mono text-lg font-bold tabular-nums text-destructive">{formatMoney(run.total_deductions)}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Net Payable</p><p className="mt-1 font-mono text-lg font-bold tabular-nums text-success">{formatMoney(run.total_net)}</p></div>
        </div>
      </div>

      <Tabs defaultValue="staff">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="staff">Staff Breakdown</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportBank}><Download className="h-3.5 w-3.5" /> Export Bank Batch</Button>
        </div>

        <TabsContent value="staff" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Staff ID</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Position</TableHead>
                  <TableHead className="text-xs text-right">Basic</TableHead>
                  <TableHead className="text-xs text-right">Allowances</TableHead>
                  <TableHead className="text-xs text-right">Deductions</TableHead>
                  <TableHead className="text-xs text-right">Net Pay</TableHead>
                  <TableHead className="text-xs w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No staff items.</TableCell></TableRow>
                ) : (
                  items?.map((s: any) => {
                    const pos = s.staff?.staff_positions?.find((p: any) => p.is_current);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.staff?.staff_id_number || "—"}</TableCell>
                        <TableCell className="font-medium">{s.staff?.first_name} {s.staff?.last_name}</TableCell>
                        <TableCell className="text-muted-foreground">{pos?.title || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(s.basic)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(s.allowances)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(s.deductions)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatMoney(s.net_pay)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPayslip(s)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {schoolId && orgId && (
            <DocumentsTab entityType="payroll_run" entityId={id!} schoolId={schoolId} orgId={orgId} />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!payslipData} onOpenChange={(open) => !open && setPayslipData(null)}>
        <DialogContent className="sm:max-w-2xl">
          {payslipData && <PayslipView data={payslipData} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
