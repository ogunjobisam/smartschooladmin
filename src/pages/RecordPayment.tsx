import { displayClassName } from "@/lib/sections";
import { useState } from "react";
import { ArrowLeft, Search, CreditCard, CheckCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { notifySchoolAdmins } from "@/lib/school-updates";
import { useCurrency } from "@/hooks/use-currency";
import { sendPaymentConfirmation } from "@/lib/notification-dispatcher";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Enums } from "@/integrations/supabase/types";

export default function RecordPayment() {
  const navigate = useNavigate();
  const { schoolId, user, orgId } = useAuth();
  const { formatMoney } = useCurrency();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Enums<"payment_method"> | "">("");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  // Search students with outstanding invoices
  const { data: students, isLoading: searchLoading } = useQuery({
    queryKey: ["payment-search", schoolId, search],
    queryFn: async () => {
      if (!schoolId || search.length < 2) return [];
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, student_id_number, enrolments(classes(name))")
        .eq("school_id", schoolId)
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id_number.ilike.%${search}%`)
        .limit(10);
      return data || [];
    },
    enabled: !!schoolId && search.length >= 2,
  });

  // Fetch outstanding invoices for selected student
  const { data: studentInvoices } = useQuery({
    queryKey: ["student-outstanding", selectedStudentId],
    queryFn: async () => {
      if (!selectedStudentId) return [];
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status")
        .eq("student_id", selectedStudentId)
        .in("status", ["pending", "overdue"])
        .order("issued_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedStudentId,
  });

  const selectedStudent = students?.find(s => s.id === selectedStudentId);
  const selectedInvoice = studentInvoices?.find(i => i.id === selectedInvoiceId);
  const totalOutstanding = studentInvoices?.reduce((s, i) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0) || 0;

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!schoolId || !selectedStudentId || !amount || !method) throw new Error("Missing fields");
      // Amounts are stored and displayed in whole currency units.
      const amountValue = Math.round(parseFloat(amount));

      // Insert payment
      const { data: payment, error: payError } = await supabase
        .from("payments")
        .insert({
          school_id: schoolId,
          student_id: selectedStudentId,
          amount: amountValue,
          payment_method: method as Enums<"payment_method">,
          reference_number: reference || null,
          payment_date: paymentDate,
          notes: notes || null,
          recorded_by: user?.id,
        })
        .select("id")
        .single();

      if (payError) throw payError;

      // Allocate to invoice if selected
      if (selectedInvoiceId && payment) {
        const invoiceBalance = selectedInvoice ? (selectedInvoice.total_amount - selectedInvoice.amount_paid) : amountValue;
        const allocateAmount = Math.min(amountValue, invoiceBalance);

        await supabase.from("payment_allocations").insert({
          payment_id: payment.id,
          invoice_id: selectedInvoiceId,
          amount: allocateAmount,
        });

        // Update invoice amount_paid
        const newPaid = (selectedInvoice?.amount_paid || 0) + allocateAmount;
        const newStatus = newPaid >= (selectedInvoice?.total_amount || 0) ? "paid" : "pending";
        await supabase
          .from("invoices")
          .update({ amount_paid: newPaid, status: newStatus })
          .eq("id", selectedInvoiceId);
      }

      return payment;
    },
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment-stats"] });
      toast({ title: "Payment recorded", description: `₦${parseFloat(amount).toLocaleString()} payment successfully recorded.` });
      // Send payment confirmation notification
      if (orgId && schoolId && selectedStudentId && payment) {
        sendPaymentConfirmation({
          orgId,
          schoolId,
          studentId: selectedStudentId,
          amount: Math.round(parseFloat(amount)),
          paymentId: payment.id,
          invoiceNumber: selectedInvoice?.invoice_number,
        }).catch(console.error);

        // The family gets an email confirming the money landed.
        sendReceiptAlert({
          orgId,
          schoolId,
          studentId: selectedStudentId,
          amountLabel: formatMoney(Math.round(parseFloat(amount))),
          invoiceNumber: selectedInvoice?.invoice_number,
          paymentId: payment.id,
          balanceLabel: selectedInvoice
            ? formatMoney(
                Math.max(
                  0,
                  selectedInvoice.total_amount -
                    selectedInvoice.amount_paid -
                    Math.round(parseFloat(amount)),
                ),
              )
            : null,
        }).catch(console.error);

        // Keep the people who run the school in the loop by email, so they see
        // money arriving without having to sign in and look.
        notifySchoolAdmins({
          orgId,
          schoolId,
          area: "fees",
          summary: `A payment of ${formatMoney(Math.round(parseFloat(amount)))} was recorded for ${selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : "a student"}${selectedInvoice?.invoice_number ? ` against invoice ${selectedInvoice.invoice_number}` : ""}.`,
          link: "/payments",
          entityType: "payment",
          entityId: payment.id,
          excludeUserId: user?.id,
        }).catch(console.error);
      }
      navigate("/payments");
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to record payment.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/payments"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Payments</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">Record Payment</span>
      </div>

      <PageHeader title="Record Payment" description="Search for a student and record a fee payment." />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Student Search */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Find Student</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or ID…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {searchLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : search.length < 2 ? (
                <p className="text-xs text-muted-foreground py-2">Type at least 2 characters to search.</p>
              ) : students?.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No students found.</p>
              ) : (
                students?.map((s) => {
                  const cn = displayClassName(s.enrolments?.[0]?.classes?.name) || "—";
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedStudentId(s.id); setSelectedInvoiceId(""); }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted ${selectedStudentId === s.id ? 'bg-accent/10 ring-1 ring-accent' : ''}`}
                    >
                      <div>
                        <p className="font-medium">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-muted-foreground">{s.student_id_number || "—"} • {cn}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Payment Form */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h3 className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-accent" /> Payment Details</h3>

            {selectedStudent ? (
              <>
                <div className="rounded-md bg-muted/50 p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{selectedStudent.first_name} {selectedStudent.last_name}</span>
                    {totalOutstanding > 0 && <StatusBadge status="overdue" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedStudent.student_id_number || "—"}</p>
                  <p className="text-xs">Outstanding: <span className="font-mono font-semibold tabular-nums text-destructive">{formatMoney(totalOutstanding)}</span></p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" placeholder="0" className="font-mono tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={method} onValueChange={(v) => setMethod(v as Enums<"payment_method">)}>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="pos">POS</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Reference Number</Label>
                    <Input placeholder="e.g. TRF-12345" className="font-mono" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" className="tabular-nums" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                  </div>
                </div>

                {studentInvoices && studentInvoices.length > 0 && (
                  <div className="space-y-2">
                    <Label>Allocate to Invoice</Label>
                    <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                      <SelectTrigger><SelectValue placeholder="Select invoice (optional)" /></SelectTrigger>
                      <SelectContent>
                        {studentInvoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_number} — Balance: {formatMoney((inv.total_amount || 0) - (inv.amount_paid || 0))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input placeholder="Additional payment notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => navigate("/payments")}>Cancel</Button>
                  <Button
                    className="gap-1.5"
                    disabled={!amount || !method || recordPayment.isPending}
                    onClick={() => recordPayment.mutate()}
                  >
                    <CheckCircle className="h-4 w-4" /> {recordPayment.isPending ? "Recording…" : "Record Payment"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-12 text-center">
                <CreditCard className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Select a student from the list to record a payment.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
