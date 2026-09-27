import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { getErrorMessage } from "@/lib/errors";

const KINDS = [
  { value: "waiver", label: "Waiver" },
  { value: "discount", label: "Discount" },
  { value: "scholarship", label: "Scholarship" },
] as const;

const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
};

/**
 * Waivers, discounts and scholarships on one invoice. Asking puts the request
 * in the approvals queue; nothing about the bill changes until a proprietor,
 * school admin or principal — not whoever asked — approves it, and then the
 * invoice gains a credit line. The database enforces all of that; this screen
 * only asks and shows.
 */
export function InvoiceAdjustments({
  invoiceId,
  outstanding,
  canRequest,
}: {
  invoiceId: string;
  /** What is still owed, before pending requests. */
  outstanding: number;
  canRequest: boolean;
}) {
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("discount");
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  const { data: adjustments = [] } = useQuery({
    queryKey: ["invoice-adjustments", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_adjustments")
        .select("id, kind, amount, percent, reason, status, created_at, decided_at, decision_notes")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const pending = adjustments.filter((a) => a.status === "pending").reduce((sum, a) => sum + Number(a.amount), 0);
  const available = Math.max(0, outstanding - pending);
  const number = Number(value);
  const valid =
    value.trim() !== "" && Number.isFinite(number) && number > 0 && reason.trim().length > 0 &&
    (mode === "percent" ? number <= 100 : number <= available);

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("request_invoice_adjustment", {
        _invoice_id: invoiceId,
        _kind: kind,
        _amount: mode === "amount" ? Math.round(number) : null,
        _percent: mode === "percent" ? number : null,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sent for approval", { description: "The invoice changes once someone else approves it." });
      setOpen(false);
      setValue("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["invoice-adjustments", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not send the request")),
  });

  if (adjustments.length === 0 && !canRequest) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="text-sm font-semibold text-card-foreground">Waivers and discounts</h3>
        {canRequest && available > 0 && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setOpen(true)}>
            <BadgePercent className="h-3.5 w-3.5" /> Request
          </Button>
        )}
      </div>
      {adjustments.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">None requested.</p>
      ) : (
        <ul className="divide-y">
          {adjustments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <p className="font-medium capitalize">
                  {a.kind}
                  {a.percent ? ` (${Number(a.percent)}%)` : ""}: {a.reason}
                </p>
                {a.decision_notes && <p className="text-xs text-muted-foreground">{a.decision_notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">−{formatMoney(Number(a.amount))}</span>
                <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"} className="capitalize">
                  {a.status === "pending" ? "Awaiting approval" : a.status}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a waiver or discount</DialogTitle>
            <DialogDescription>
              Up to {formatMoney(available)} can still be written off this invoice. A proprietor, school
              admin or principal other than you must approve it before the bill changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>As</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">An amount</SelectItem>
                    <SelectItem value="percent">A percentage of the fees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-value">{mode === "percent" ? "Percentage" : "Amount"}</Label>
              <Input
                id="adjustment-value"
                type="number"
                min="1"
                max={mode === "percent" ? 100 : available}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustment-reason">Reason</Label>
              <Textarea
                id="adjustment-reason"
                rows={2}
                maxLength={500}
                placeholder="e.g. Sibling discount, second child"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => request.mutate()} disabled={!valid || request.isPending}>
              {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
