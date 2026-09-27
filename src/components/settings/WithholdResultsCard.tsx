import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { useCurrency } from "@/hooks/use-currency";

const DEFAULT_DEBTOR_MESSAGE = "Results are withheld until outstanding school fees are paid. Please contact the bursary.";
const DEFAULT_HOLD_MESSAGE = "Results are being held by the school. Please contact the school office.";

/**
 * Whether a family that owes the school sees the term's results. Enforced by
 * the database on every read of a result, so paying the balance down brings the
 * results straight back. Only invoices past their due date count as owed.
 */
export function WithholdResultsCard({ schoolId, canManage }: { schoolId: string | null; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { currency, formatMoney } = useCurrency();
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState("0");
  const [debtorMessage, setDebtorMessage] = useState(DEFAULT_DEBTOR_MESSAGE);
  const [holdMessage, setHoldMessage] = useState(DEFAULT_HOLD_MESSAGE);
  const [saving, setSaving] = useState(false);

  const { data: saved, isLoading } = useQuery({
    queryKey: ["result-access-settings", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("result_access_settings")
        .select("withhold_debtors, allowed_balance, debtor_message, hold_message")
        .eq("school_id", schoolId!)
        .maybeSingle();
      return data;
    },
    enabled: !!schoolId,
  });

  useEffect(() => {
    if (!saved) return;
    setEnabled(saved.withhold_debtors);
    setAllowed(String(saved.allowed_balance));
    setDebtorMessage(saved.debtor_message);
    setHoldMessage(saved.hold_message);
  }, [saved]);

  const allowedNumber = Number(allowed);
  const invalid = !Number.isFinite(allowedNumber) || allowedNumber < 0 || !debtorMessage.trim() || !holdMessage.trim();

  const save = async () => {
    if (!schoolId || invalid) return;
    setSaving(true);
    const { error } = await supabase.from("result_access_settings").upsert({
      school_id: schoolId,
      withhold_debtors: enabled,
      allowed_balance: Math.round(allowedNumber),
      debtor_message: debtorMessage.trim(),
      hold_message: holdMessage.trim(),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(getErrorMessage(error, "Could not save.")); return; }
    toast.success(enabled ? "Debtors' results will be withheld" : "Results are no longer withheld for debt");
    queryClient.invalidateQueries({ queryKey: ["result-access-settings", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["term-report"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" /> Withhold results from debtors</CardTitle>
        <CardDescription>
          Families who owe more than the allowance on overdue invoices do not see marks or report cards
          until they pay. A bill that is not yet due never counts. Staff always see everything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? null : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="withhold-debtors">Withhold debtors' results</Label>
              <Switch id="withhold-debtors" checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="allowed-balance">Allowed overdue balance ({currency})</Label>
              <Input
                id="allowed-balance"
                type="number"
                min="0"
                value={allowed}
                onChange={(e) => setAllowed(e.target.value)}
                disabled={!canManage || !enabled}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                Owing more than {Number.isFinite(allowedNumber) && allowedNumber >= 0 ? formatMoney(allowedNumber) : "this"} overdue withholds results.
                0 withholds for any overdue amount.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="debtor-message">What debtors' families see</Label>
              <Textarea id="debtor-message" rows={2} maxLength={500} value={debtorMessage} onChange={(e) => setDebtorMessage(e.target.value)} disabled={!canManage} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hold-message">What families see when a pupil is held by hand</Label>
              <Textarea id="hold-message" rows={2} maxLength={500} value={holdMessage} onChange={(e) => setHoldMessage(e.target.value)} disabled={!canManage} />
              <p className="text-xs text-muted-foreground">The reason given for a hold is for staff only and is never shown to families.</p>
            </div>

            {canManage && (
              <Button onClick={save} disabled={saving || invalid}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
