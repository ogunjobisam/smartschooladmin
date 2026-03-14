import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CreditCard, CheckCircle } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { generatePaymentReference } from "@/lib/payment-providers";

interface PayInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    amount_paid: number;
    student_id: string;
    school_id: string;
  };
}

export function PayInvoiceDialog({ open, onOpenChange, invoice }: PayInvoiceDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();

  const outstanding = invoice.total_amount - invoice.amount_paid;
  const [paymentType, setPaymentType] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState(outstanding.toString());
  const [gateway, setGateway] = useState("mock");
  const [status, setStatus] = useState<"idle" | "processing" | "success">("idle");

  const payAmount = paymentType === "full" ? outstanding : Math.min(parseInt(amount) || 0, outstanding);

  const handlePay = async () => {
    if (payAmount <= 0 || !user) return;
    setStatus("processing");

    const reference = generatePaymentReference();

    // Create payment transaction record
    const { error: txError } = await supabase.from("payment_transactions").insert({
      school_id: invoice.school_id,
      student_id: invoice.student_id,
      invoice_id: invoice.id,
      amount: payAmount,
      gateway: gateway as any,
      gateway_reference: reference,
      status: "initiated" as any,
      payer_name: user.user_metadata?.full_name || user.email,
      payer_email: user.email,
    });

    if (txError) {
      toast.error("Failed to initiate payment");
      setStatus("idle");
      return;
    }

    // Mock mode: simulate successful payment after delay
    if (gateway === "mock") {
      await new Promise((r) => setTimeout(r, 2000));

      // Update transaction to successful
      await supabase
        .from("payment_transactions")
        .update({ status: "successful" as any, updated_at: new Date().toISOString() })
        .eq("gateway_reference", reference);

      // Create payment record
      const { data: payment } = await supabase.from("payments").insert({
        school_id: invoice.school_id,
        student_id: invoice.student_id,
        amount: payAmount,
        payment_method: "online" as any,
        reference_number: reference,
        recorded_by: user.id,
        notes: `Online payment via ${gateway} — ${invoice.invoice_number}`,
      }).select("id").single();

      // Allocate to invoice
      if (payment) {
        await supabase.from("payment_allocations").insert({
          payment_id: payment.id,
          invoice_id: invoice.id,
          amount: payAmount,
        });

        // Update invoice
        const newPaid = invoice.amount_paid + payAmount;
        await supabase.from("invoices").update({
          amount_paid: newPaid,
          status: newPaid >= invoice.total_amount ? "paid" as any : "pending" as any,
        }).eq("id", invoice.id);

        // Generate receipt
        const receiptNum = `RCP-${Date.now().toString(36).toUpperCase()}`;
        await supabase.from("receipts").insert({
          school_id: invoice.school_id,
          payment_id: payment.id,
          receipt_number: receiptNum,
          student_id: invoice.student_id,
          amount: payAmount,
          issued_by: user.id,
        });
      }

      setStatus("success");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });

      setTimeout(() => {
        onOpenChange(false);
        setStatus("idle");
      }, 1500);
    } else {
      // For real gateways, redirect to checkout URL
      toast.info("Redirecting to payment gateway...");
      setStatus("idle");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Pay Invoice {invoice.invoice_number}
          </DialogTitle>
        </DialogHeader>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="h-12 w-12 text-success" />
            <p className="text-lg font-semibold">Payment Successful!</p>
            <p className="text-sm text-muted-foreground">{formatMoney(payAmount)} has been applied to your invoice.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between"><span>Total Amount</span><span className="font-medium">{formatMoney(invoice.total_amount)}</span></div>
              <div className="flex justify-between"><span>Already Paid</span><span>{formatMoney(invoice.amount_paid)}</span></div>
              <div className="flex justify-between border-t pt-1 font-semibold"><span>Outstanding</span><span>{formatMoney(outstanding)}</span></div>
            </div>

            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="font-normal">Full payment — {formatMoney(outstanding)}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="partial" id="partial" />
                  <Label htmlFor="partial" className="font-normal">Partial payment</Label>
                </div>
              </RadioGroup>
              {paymentType === "partial" && (
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  max={outstanding}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Payment Gateway</Label>
              <RadioGroup value={gateway} onValueChange={setGateway}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="mock" id="mock" />
                  <Label htmlFor="mock" className="font-normal">Demo Payment (Simulated)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="paystack" id="paystack" />
                  <Label htmlFor="paystack" className="font-normal">Paystack</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="flutterwave" id="flutterwave" />
                  <Label htmlFor="flutterwave" className="font-normal">Flutterwave</Label>
                </div>
              </RadioGroup>
            </div>

            <Button onClick={handlePay} disabled={status === "processing" || payAmount <= 0} className="w-full">
              {status === "processing" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status === "processing" ? "Processing…" : `Pay ${formatMoney(payAmount)}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
