import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";
import { isSalaryField, parseSalaryValue } from "@/lib/payroll";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

/**
 * Apply an approved salary change to the staff member's payroll profile.
 *
 * Values are stored as text on salary_change_requests because the field being
 * changed can be an amount or a rate, so the field name is validated against a
 * known list before it is used as a column name.
 */
async function applySalaryChange(approvalRequestId: string, reviewerId: string | undefined, orgId: string | null) {
  const { data: request } = await supabase
    .from("salary_change_requests")
    .select("id, staff_id, field_changed, new_value")
    .eq("approval_request_id", approvalRequestId)
    .maybeSingle();

  // Not every approval is a salary change; other types have nothing to apply.
  if (!request) return;

  if (!isSalaryField(request.field_changed)) {
    throw new Error(`Unrecognised salary field "${request.field_changed}" — change not applied`);
  }

  const value = parseSalaryValue(request.field_changed, request.new_value);
  if (value === null) {
    throw new Error(`"${request.new_value}" is not a valid ${request.field_changed.replace(/_/g, " ")} — change not applied`);
  }

  // Built explicitly rather than with a computed key so the column name stays
  // type-checked against the payroll_profiles schema.
  const field = request.field_changed;
  const update = {
    staff_id: request.staff_id,
    ...(field === "basic_salary" && { basic_salary: value }),
    ...(field === "housing_allowance" && { housing_allowance: value }),
    ...(field === "transport_allowance" && { transport_allowance: value }),
    ...(field === "other_allowances" && { other_allowances: value }),
    ...(field === "pension_rate" && { pension_rate: value }),
    ...(field === "tax_rate" && { tax_rate: value }),
  };

  const { error: profileError } = await supabase
    .from("payroll_profiles")
    .upsert(update, { onConflict: "staff_id" });
  if (profileError) throw profileError;

  await supabase
    .from("salary_change_requests")
    .update({ status: "approved" })
    .eq("id", request.id);

  // Salary changes are exactly the kind of thing an audit trail exists for.
  if (orgId) {
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: reviewerId,
      action: "approve",
      entity_type: "salary_change",
      entity_id: request.id,
      detail: `Applied ${request.field_changed.replace(/_/g, " ")} = ${value}`,
    });
  }
}

/**
 * Carry an approval decision through to the payroll run itself. Without this the
 * queue would say "approved" while the run stayed stuck awaiting approval.
 */
async function applyPayrollDecision(
  request: { id: string; type: string; reference_id: string | null },
  status: "approved" | "rejected",
  reviewerId: string | undefined
) {
  if (request.type !== "payroll_run" || !request.reference_id) return;
  const { error } = await supabase
    .from("payroll_runs")
    .update(
      status === "approved"
        ? { status: "approved", approved_by: reviewerId, approved_at: new Date().toISOString() }
        : { status: "rejected" }
    )
    .eq("id", request.reference_id)
    .eq("status", "pending");
  if (error) throw error;
}

export default function Approvals() {
  const { orgId, user } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();

  const { data: approvals, isLoading } = useQuery({
    queryKey: ["approvals", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("approval_requests")
        .select("id, type, description, amount, status, created_at, requested_by, reference_id, reference_type")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!orgId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const reviewedAt = new Date().toISOString();
      const request = approvals?.find((a) => a.id === id);

      // A waiver or discount is decided by the database in one step, which also
      // changes the invoice and refuses anyone deciding their own request. The
      // approvals row cannot be flipped directly for these.
      if (request?.reference_type === "invoice_adjustment" && request.reference_id) {
        const { error } = await supabase.rpc("decide_invoice_adjustment", {
          _adjustment_id: request.reference_id,
          _approve: status === "approved",
          _notes: "",
        });
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("approval_requests")
        .update({ status, reviewed_by: user?.id, reviewed_at: reviewedAt })
        .eq("id", id);
      if (error) throw error;

      // Flipping the status is not the outcome anyone is after — an approved
      // salary change has to actually reach the staff member's payroll profile,
      // and an approved payroll run has to become payable, otherwise the
      // approval queue is decorative.
      if (status === "approved") {
        await applySalaryChange(id, user?.id, orgId);
      } else {
        await supabase
          .from("salary_change_requests")
          .update({ status: "rejected" })
          .eq("approval_request_id", id);
      }

      if (request) {
        await applyPayrollDecision(
          { id: request.id, type: request.type, reference_id: request.reference_id },
          status,
          user?.id
        );
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["salary-changes"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-profile"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-run"] });
      queryClient.invalidateQueries({ queryKey: ["invoice"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-items"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: `Request ${status}`, description: `The approval request has been ${status}.` });
    },
    onError: (err) => {
      toast({ title: "Error", description: getErrorMessage(err, "Failed to update approval status."), variant: "destructive" });
    },
  });

  const formatType = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Review and approve pending requests." />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
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
            ) : approvals?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No approval requests found.</TableCell>
              </TableRow>
            ) : (
              approvals?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{formatType(a.type)}</TableCell>
                  <TableCell className="max-w-xs text-sm">{a.description}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(a.amount || 0)}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="text-right">
                    {a.status === "pending" ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: a.id, status: "approved" })}>Approve</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: a.id, status: "rejected" })}>Reject</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize">{a.status}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
