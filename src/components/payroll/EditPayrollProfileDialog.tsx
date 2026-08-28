import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";
import { calculatePayrollLine, parseSalaryValue } from "@/lib/payroll";

interface PayrollProfile {
  basic_salary?: number | null;
  housing_allowance?: number | null;
  transport_allowance?: number | null;
  other_allowances?: number | null;
  pension_rate?: number | null;
  tax_rate?: number | null;
}

interface BankDetails {
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  profile: PayrollProfile | null;
  bankDetails: BankDetails | null;
}

const AMOUNT_FIELDS = [
  { key: "basic_salary", label: "Basic salary" },
  { key: "housing_allowance", label: "Housing allowance" },
  { key: "transport_allowance", label: "Transport allowance" },
  { key: "other_allowances", label: "Other allowances" },
] as const;

const RATE_FIELDS = [
  { key: "pension_rate", label: "Pension rate (%)" },
  { key: "tax_rate", label: "Tax rate (%)" },
] as const;

type FormState = Record<string, string>;

function toForm(profile: PayrollProfile | null, bank: BankDetails | null): FormState {
  return {
    basic_salary: String(profile?.basic_salary ?? ""),
    housing_allowance: String(profile?.housing_allowance ?? ""),
    transport_allowance: String(profile?.transport_allowance ?? ""),
    other_allowances: String(profile?.other_allowances ?? ""),
    pension_rate: String(profile?.pension_rate ?? "7.5"),
    tax_rate: String(profile?.tax_rate ?? "0"),
    bank_name: bank?.bank_name ?? "",
    account_number: bank?.account_number ?? "",
    account_name: bank?.account_name ?? "",
  };
}

/**
 * Creates or updates a staff member's payroll profile and bank details.
 *
 * Without this there is no way to give anyone a salary, so payroll runs come out
 * empty and the bank batch export has nothing to export.
 */
export function EditPayrollProfileDialog({ open, onOpenChange, staffId, staffName, profile, bankDetails }: Props) {
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const [form, setForm] = useState<FormState>(() => toForm(profile, bankDetails));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Re-seed when reopened so a cancelled edit does not persist.
  useEffect(() => {
    if (open) {
      setForm(toForm(profile, bankDetails));
      setErrors({});
    }
  }, [open, profile, bankDetails]);

  const set = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  // Live preview using the same maths the payroll run uses.
  const preview = calculatePayrollLine({
    basic_salary: Number(form.basic_salary) || 0,
    housing_allowance: Number(form.housing_allowance) || 0,
    transport_allowance: Number(form.transport_allowance) || 0,
    other_allowances: Number(form.other_allowances) || 0,
    pension_rate: Number(form.pension_rate) || 0,
    tax_rate: Number(form.tax_rate) || 0,
  });

  const save = useMutation({
    mutationFn: async () => {
      const nextErrors: Record<string, string> = {};
      const profileUpdate: Record<string, number> = {};

      for (const { key, label } of [...AMOUNT_FIELDS, ...RATE_FIELDS]) {
        const raw = form[key];
        // Amount fields default to 0 when left blank; a rate must be explicit.
        const value = raw.trim() === "" && !key.endsWith("_rate") ? 0 : parseSalaryValue(key, raw);
        if (value === null) {
          nextErrors[key] = `Enter a valid ${label.toLowerCase()}`;
          continue;
        }
        profileUpdate[key] = value;
      }

      const anyBankField = form.bank_name || form.account_number || form.account_name;
      if (anyBankField) {
        if (!form.bank_name.trim()) nextErrors.bank_name = "Bank name is required";
        if (!form.account_number.trim()) nextErrors.account_number = "Account number is required";
        if (!form.account_name.trim()) nextErrors.account_name = "Account name is required";
      }

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        throw new Error("Please fix the highlighted fields");
      }

      const { error: profileError } = await supabase
        .from("payroll_profiles")
        .upsert({ staff_id: staffId, ...profileUpdate }, { onConflict: "staff_id" });
      if (profileError) throw profileError;

      if (anyBankField) {
        const { error: bankError } = await supabase
          .from("staff_bank_details")
          .upsert(
            {
              staff_id: staffId,
              bank_name: form.bank_name.trim(),
              account_number: form.account_number.trim(),
              account_name: form.account_name.trim(),
            },
            { onConflict: "staff_id" }
          );
        if (bankError) throw bankError;
      }
    },
    onSuccess: () => {
      toast.success("Salary details saved");
      queryClient.invalidateQueries({ queryKey: ["payroll-profile", staffId] });
      queryClient.invalidateQueries({ queryKey: ["bank-details", staffId] });
      queryClient.invalidateQueries({ queryKey: ["payroll-eligible-staff"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Failed to save salary details")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Salary &amp; Bank Details — {staffName}</DialogTitle>
          <DialogDescription>
            Used to calculate this staff member's pay on every payroll run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {AMOUNT_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  inputMode="numeric"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="0"
                />
                {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
              </div>
            ))}
            {RATE_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
                {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
              </div>
            ))}
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span className="font-mono tabular-nums">{formatMoney(preview.gross)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Deductions</span><span className="font-mono tabular-nums text-destructive">-{formatMoney(preview.deductions)}</span></div>
            <Separator className="my-1.5" />
            <div className="flex justify-between font-semibold"><span>Net pay</span><span className="font-mono tabular-nums">{formatMoney(preview.netPay)}</span></div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Pension is charged on basic salary, tax on gross.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Bank details <span className="font-normal text-muted-foreground">(for payroll batch export)</span></h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bank_name">Bank</Label>
                <Input id="bank_name" value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. GTBank" />
                {errors.bank_name && <p className="text-xs text-destructive">{errors.bank_name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account_number">Account number</Label>
                <Input id="account_number" inputMode="numeric" value={form.account_number} onChange={(e) => set("account_number", e.target.value)} />
                {errors.account_number && <p className="text-xs text-destructive">{errors.account_number}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account_name">Account name</Label>
                <Input id="account_name" value={form.account_name} onChange={(e) => set("account_name", e.target.value)} />
                {errors.account_name && <p className="text-xs text-destructive">{errors.account_name}</p>}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
