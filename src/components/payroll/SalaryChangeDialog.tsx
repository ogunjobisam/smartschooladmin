import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import type { SalaryField } from "@/lib/payroll";

const SALARY_FIELDS = [
  { value: "basic_salary", label: "Basic Salary" },
  { value: "housing_allowance", label: "Housing Allowance" },
  { value: "transport_allowance", label: "Transport Allowance" },
  { value: "other_allowances", label: "Other Allowances" },
  { value: "tax_rate", label: "Tax Rate (%)" },
  { value: "pension_rate", label: "Pension Rate (%)" },
];

interface SalaryChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  schoolId: string;
  currentValues: Partial<Record<SalaryField, number | null>>;
}

export function SalaryChangeDialog({ open, onOpenChange, staffId, staffName, schoolId, currentValues }: SalaryChangeDialogProps) {
  const { user, orgId } = useAuth();
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const [field, setField] = useState<SalaryField>("basic_salary");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const oldValue = String(currentValues[field] || 0);

  const handleSubmit = async () => {
    if (!user || !orgId || !newValue.trim()) return;
    setSubmitting(true);

    // Create approval request
    const { data: approval, error: approvalError } = await supabase.from("approval_requests").insert({
      org_id: orgId,
      type: "salary_change",
      description: `Salary change for ${staffName}: ${SALARY_FIELDS.find(f => f.value === field)?.label} from ${oldValue} to ${newValue}`,
      requested_by: user.id,
      amount: parseInt(newValue) || 0,
      reference_type: "staff",
      reference_id: staffId,
    }).select("id").single();

    if (approvalError) {
      toast.error("Failed to create approval request");
      setSubmitting(false);
      return;
    }

    // Create salary change request
    const { error } = await supabase.from("salary_change_requests").insert({
      staff_id: staffId,
      school_id: schoolId,
      requested_by: user.id,
      field_changed: field,
      old_value: oldValue,
      new_value: newValue,
      reason: reason.trim() || null,
      approval_request_id: approval.id,
    });

    if (error) {
      toast.error("Failed to submit salary change request");
    } else {
      toast.success("Salary change request submitted for approval");
      queryClient.invalidateQueries({ queryKey: ["salary-changes"] });
      onOpenChange(false);
      setNewValue("");
      setReason("");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Salary Change — {staffName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Field to Change</Label>
            <Select value={field} onValueChange={(v) => setField(v as SalaryField)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SALARY_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current Value</Label>
              <Input value={oldValue} disabled />
            </div>
            <div className="space-y-2">
              <Label>New Value</Label>
              <Input type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Enter new value" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Justification for this change..." rows={3} />
          </div>
          <Button onClick={handleSubmit} disabled={!newValue.trim() || submitting} className="w-full">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for Approval
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
