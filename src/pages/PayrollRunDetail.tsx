import { useState } from "react";
import {
  ArrowLeft, CheckCircle, XCircle, Download, Eye, Trash2, Send, RefreshCw, Undo2, Banknote, Loader2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/use-currency";
import { exportToCsv } from "@/lib/csv-export";
import { PayslipDialog } from "@/components/payroll/PayslipDialog";
import { DocumentsTab } from "@/components/documents/DocumentsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { PayslipData } from "@/lib/payslip";
import { getErrorMessage } from "@/lib/errors";
import {
  calculatePayrollLine, payrollActions, sumPayrollLines, type PayrollAction, type PayrollRunStatus,
} from "@/lib/payroll";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, schoolId, orgId, userRoles } = useAuth();
  const { formatMoney, currency } = useCurrency();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);
  const [busy, setBusy] = useState<PayrollAction | "remove_item" | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "delete" } | { kind: "remove_item"; itemId: string; name: string }>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: run, isLoading } = useQuery({
    queryKey: ["payroll-run", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_runs")
        .select("*, schools(name, address, email, phone, logo_url)")
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
        .select("id, staff_id, basic, allowances, pension, tax, deductions, net_pay, staff(first_name, last_name, staff_id_number, staff_positions(title, department, is_current))")
        .eq("payroll_run_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const actions = payrollActions(run?.status, userRoles);
  const can = (a: PayrollAction) => actions.includes(a);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-run", id] });
    queryClient.invalidateQueries({ queryKey: ["payroll-run-items", id] });
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  /** One place for every status flip, so the guard and the refresh are never forgotten. */
  const setStatus = async (
    action: PayrollAction,
    patch: {
      status: PayrollRunStatus;
      submitted_at?: string | null;
      submitted_by?: string | null;
      approved_at?: string | null;
      approved_by?: string | null;
      paid_at?: string | null;
    },
    message: string,
  ) => {
    if (!can(action) || !id) return;
    setBusy(action);
    const { error } = await supabase.from("payroll_runs").update(patch).eq("id", id);
    setBusy(null);
    if (error) { toast.error(getErrorMessage(error, "Could not update this payroll run")); return; }
    toast.success(message);
    refresh();
  };

  /**
   * Submitting also raises an approval request, so approvers see payroll in the
   * same queue as everything else waiting on them.
   */
  const handleSubmit = async () => {
    if (!can("submit") || !id || !run) return;
    setBusy("submit");
    const { error } = await supabase.from("payroll_runs").update({
      status: "pending",
      submitted_at: new Date().toISOString(),
      submitted_by: user?.id,
    }).eq("id", id);
    if (error) {
      setBusy(null);
      toast.error(getErrorMessage(error, "Could not submit this payroll run"));
      return;
    }
    if (orgId) {
      // The run itself is the record of truth; a failed approval row should not
      // roll back a valid submission, so this is best-effort and reported softly.
      const { error: approvalError } = await supabase.from("approval_requests").insert({
        org_id: orgId,
        type: "payroll_run",
        reference_type: "payroll_run",
        reference_id: id,
        description: `Payroll run for ${run.period_label} — ${run.staff_count} staff`,
        amount: run.total_net,
        status: "pending",
        requested_by: user?.id,
      });
      if (approvalError) toast.warning("Submitted, but it could not be added to the Approvals list.");
    }
    setBusy(null);
    toast.success("Submitted for approval");
    refresh();
  };

  /** Keep any approval request in step when the run is decided from this page. */
  const closeApproval = async (status: "approved" | "rejected") => {
    if (!orgId || !id) return;
    await supabase
      .from("approval_requests")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("type", "payroll_run")
      .eq("reference_id", id)
      .eq("status", "pending");
  };

  const handleApprove = async () => {
    await setStatus("approve", {
      status: "approved",
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    }, "Payroll approved");
    await closeApproval("approved");
    refresh();
  };

  const handleReject = async () => {
    await setStatus("reject", { status: "rejected" }, "Payroll rejected");
    await closeApproval("rejected");
    refresh();
  };

  const handleReturnToDraft = () =>
    setStatus("return_to_draft", { status: "draft", submitted_at: null, submitted_by: null, approved_by: null, approved_at: null },
      "Run moved back to draft");

  const handleMarkPaid = async () => {
    await setStatus("mark_paid", { status: "paid", paid_at: new Date(paidDate).toISOString() }, "Payroll marked as paid");
    setPayOpen(false);
  };

  const handleDelete = async () => {
    if (!can("delete") || !id) return;
    setBusy("delete");
    // Payslips first — the run row is what the items point at.
    const { error: itemsError } = await supabase.from("payroll_run_items").delete().eq("payroll_run_id", id);
    if (itemsError) {
      setBusy(null);
      toast.error(getErrorMessage(itemsError, "Could not delete this run's payslips"));
      return;
    }
    const { error } = await supabase.from("payroll_runs").delete().eq("id", id);
    setBusy(null);
    setConfirm(null);
    if (error) { toast.error(getErrorMessage(error, "Could not delete this payroll run")); return; }
    toast.success("Draft run deleted");
    queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    navigate("/payroll");
  };

  /** Recompute the run totals from whatever payslip lines currently exist. */
  const retotal = async (lines: { basic: number; allowances: number; deductions: number; net_pay: number }[]) => {
    const totals = sumPayrollLines(lines.map((l) => ({
      basic: l.basic,
      allowances: l.allowances,
      pension: 0,
      tax: 0,
      deductions: l.deductions,
      gross: l.basic + l.allowances,
      netPay: l.net_pay,
    })));
    await supabase.from("payroll_runs").update({
      total_gross: totals.totalGross,
      total_deductions: totals.totalDeductions,
      total_net: totals.totalNet,
      staff_count: totals.staffCount,
    }).eq("id", id!);
  };

  /**
   * Pull each payslip line back from the staff member's current salary profile.
   * A draft raised before a salary change would otherwise pay the old figure.
   */
  const handleRecalculate = async () => {
    if (!can("edit") || !id || !items) return;
    setBusy("edit");
    try {
      const staffIds = items.map((i) => i.staff_id).filter(Boolean) as string[];
      const { data: profiles, error: profileError } = await supabase
        .from("payroll_profiles")
        .select("staff_id, basic_salary, housing_allowance, transport_allowance, other_allowances, pension_rate, tax_rate")
        .in("staff_id", staffIds);
      if (profileError) throw profileError;

      const byStaff = new Map((profiles || []).map((p) => [p.staff_id, p]));
      const updated: { basic: number; allowances: number; deductions: number; net_pay: number }[] = [];

      for (const item of items) {
        const line = calculatePayrollLine(byStaff.get(item.staff_id!) || {});
        const { error } = await supabase.from("payroll_run_items").update({
          basic: line.basic,
          allowances: line.allowances,
          pension: line.pension,
          tax: line.tax,
          deductions: line.deductions,
          net_pay: line.netPay,
        }).eq("id", item.id);
        if (error) throw error;
        updated.push({ basic: line.basic, allowances: line.allowances, deductions: line.deductions, net_pay: line.netPay });
      }

      await retotal(updated);
      toast.success("Recalculated from current salaries");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not recalculate this run"));
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!can("edit") || !items) return;
    setBusy("remove_item");
    const { error } = await supabase.from("payroll_run_items").delete().eq("id", itemId);
    if (error) {
      setBusy(null);
      toast.error(getErrorMessage(error, "Could not remove this staff member"));
      return;
    }
    await retotal(items.filter((i) => i.id !== itemId));
    setBusy(null);
    setConfirm(null);
    toast.success("Staff member removed from this run");
    refresh();
  };

  const handleExportBank = () => {
    if (!items || items.length === 0) return;
    const headers = ["Staff ID", "Name", "Bank", "Account", "Net Pay"];
    const rows = items.map((s) => [
      s.staff?.staff_id_number || "",
      `${s.staff?.first_name || ""} ${s.staff?.last_name || ""}`,
      "", // bank info would come from staff_bank_details
      "",
      // Whole currency units, as stored — see the header of src/lib/payroll.ts.
      // This used to divide by 100, which sent a ₦150,000 salary to the bank as
      // 1500.00. Nothing anywhere stores kobo.
      s.net_pay.toFixed(2),
    ]);
    exportToCsv(`bank-batch-${run?.period_label || "payroll"}`, headers, rows);
    toast.success("Bank batch CSV exported");
  };

  type PayrollItem = NonNullable<typeof items>[number];

  const openPayslip = (s: PayrollItem) => {
    const pos = s.staff?.staff_positions?.find((p) => p.is_current);
    setPayslipData({
      school: {
        name: run?.schools?.name || "",
        address: run?.schools?.address,
        email: run?.schools?.email,
        phone: run?.schools?.phone,
        logoUrl: run?.schools?.logo_url,
      },
      currency,
      staffName: `${s.staff?.first_name} ${s.staff?.last_name}`,
      staffId: s.staff?.staff_id_number || "",
      department: pos?.department || "",
      position: pos?.title || "",
      periodLabel: run?.period_label || "",
      runDate: run?.run_date || "",
      status: run?.status,
      basic: s.basic,
      allowances: s.allowances,
      pension: s.pension,
      tax: s.tax,
      deductions: s.deductions,
      netPay: s.net_pay,
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

  const spin = (a: PayrollAction | "remove_item") => busy === a;
  const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : null);

  const history = [
    run.created_at ? `Created ${date(run.created_at)}` : null,
    run.submitted_at ? `Submitted ${date(run.submitted_at)}` : null,
    run.approved_at ? `Approved ${date(run.approved_at)}` : null,
    run.paid_at ? `Paid ${date(run.paid_at)}` : null,
  ].filter(Boolean).join(" · ");

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
            {history && <p className="text-xs text-muted-foreground">{history}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {can("edit") && (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy} onClick={handleRecalculate}>
                {spin("edit") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalculate
              </Button>
            )}
            {can("submit") && (
              <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={handleSubmit}>
                {spin("submit") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit for approval
              </Button>
            )}
            {can("return_to_draft") && (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy} onClick={handleReturnToDraft}>
                <Undo2 className="h-3.5 w-3.5" /> {run.status === "rejected" ? "Reopen as draft" : "Return to draft"}
              </Button>
            )}
            {can("reject") && (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy} onClick={handleReject}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
            )}
            {can("approve") && (
              <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground" disabled={!!busy} onClick={handleApprove}>
                <CheckCircle className="h-3.5 w-3.5" /> Approve Payroll
              </Button>
            )}
            {can("mark_paid") && (
              <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => setPayOpen(true)}>
                <Banknote className="h-3.5 w-3.5" /> Mark as paid
              </Button>
            )}
            {can("delete") && (
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive" disabled={!!busy} onClick={() => setConfirm({ kind: "delete" })}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>

        {run.status === "pending" && !can("approve") && (
          <p className="mt-3 text-xs text-muted-foreground">
            Waiting for approval. Only the proprietor or principal can approve or reject this run.
          </p>
        )}
        {run.status === "paid" && (
          <p className="mt-3 text-xs text-muted-foreground">
            This run has been paid and is locked. Payslips and the bank batch stay available.
          </p>
        )}

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
          <div className="overflow-x-auto rounded-lg border bg-card">
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
                  <TableHead className="text-xs w-[130px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No staff items.</TableCell></TableRow>
                ) : (
                  items?.map((s) => {
                    const pos = s.staff?.staff_positions?.find((p) => p.is_current);
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
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openPayslip(s)}>
                              <Eye className="h-3.5 w-3.5" /> Payslip
                            </Button>
                            {can("edit") && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive"
                                aria-label="Remove from run"
                                disabled={!!busy}
                                onClick={() => setConfirm({
                                  kind: "remove_item",
                                  itemId: s.id,
                                  name: `${s.staff?.first_name || ""} ${s.staff?.last_name || ""}`.trim(),
                                })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
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

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark payroll as paid</DialogTitle>
            <DialogDescription>
              Record the date the salaries left the bank. Once marked paid, the run is locked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="paid-date">Payment date</Label>
            <Input id="paid-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid} disabled={!!busy} className="gap-1.5">
              {spin("mark_paid") && <Loader2 className="h-4 w-4 animate-spin" />} Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete" ? "Delete this payroll run?" : "Remove this staff member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? `The ${run.period_label} run and all of its payslips will be permanently removed. This cannot be undone.`
                : `${confirm?.kind === "remove_item" ? confirm.name : "This person"} will be left out of this run and the totals will be recalculated.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirm?.kind === "delete") handleDelete();
                else if (confirm?.kind === "remove_item") handleRemoveItem(confirm.itemId);
              }}
            >
              {confirm?.kind === "delete" ? "Delete run" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PayslipDialog
        open={!!payslipData}
        onOpenChange={(open) => !open && setPayslipData(null)}
        data={payslipData}
      />
    </div>
  );
}
