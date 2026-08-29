import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { displayClassName } from "@/lib/sections";
import {
  printStatement, STATEMENT_STATUS_FILTERS, type StatementLine, type StatementStatusFilter,
} from "@/lib/statements";

export interface StatementStudent {
  id: string;
  schoolId: string;
  name: string;
  idNumber?: string | null;
  className?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StatementStudent[];
  /** Printed on the statement when a guardian requested it. */
  guardianName?: string | null;
  generatedBy?: string | null;
}

function matchesStatus(status: string, filter: StatementStatusFilter, balance: number): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return status === "paid" || balance <= 0;
  if (filter === "overdue") return status === "overdue";
  return status !== "paid" && status !== "void" && balance > 0;
}

/**
 * Builds a printable statement of account for one student over a chosen window.
 *
 * The window matters: anything before `from` is folded into an opening balance
 * rather than dropped, so the closing figure always equals what the family
 * actually owes today.
 */
export function StatementDialog({ open, onOpenChange, students, guardianName, generatedBy }: Props) {
  const { currency } = useCurrency();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<StatementStatusFilter>("all");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && students.length > 0 && !students.some((s) => s.id === studentId)) {
      setStudentId(students[0].id);
    }
  }, [open, students, studentId]);

  const student = students.find((s) => s.id === studentId) || students[0];

  const handlePrint = async () => {
    if (!student) return;
    if (from && to && from > to) {
      toast.error("The start date must come before the end date.");
      return;
    }
    setBusy(true);
    try {
      const [{ data: school }, { data: invoices, error: invErr }, { data: payments, error: payErr }] =
        await Promise.all([
          supabase
            .from("schools")
            .select("name, address, email, phone, logo_url")
            .eq("id", student.schoolId)
            .maybeSingle(),
          supabase
            .from("invoices")
            .select("id, invoice_number, total_amount, amount_paid, status, due_date, issued_at, academic_periods(name)")
            .eq("student_id", student.id)
            .order("issued_at", { ascending: true }),
          supabase
            .from("payments")
            .select("id, amount, payment_date, payment_method, reference_number")
            .eq("student_id", student.id)
            .order("payment_date", { ascending: true }),
        ]);

      if (invErr || payErr) throw invErr || payErr;

      const startsAfter = from ? new Date(`${from}T00:00:00`).getTime() : null;
      const endsBefore = to ? new Date(`${to}T23:59:59`).getTime() : null;

      let opening = 0;
      const lines: StatementLine[] = [];

      for (const inv of invoices || []) {
        const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
        if (!matchesStatus(inv.status, status, balance)) continue;
        const at = new Date(inv.issued_at).getTime();
        if (endsBefore !== null && at > endsBefore) continue;
        if (startsAfter !== null && at < startsAfter) {
          opening += inv.total_amount || 0;
          continue;
        }
        lines.push({
          date: inv.issued_at,
          kind: "invoice",
          reference: inv.invoice_number,
          description: `Invoice — ${inv.academic_periods?.name || "school fees"}`,
          debit: inv.total_amount || 0,
          status: inv.status,
          dueDate: inv.due_date,
        });
      }

      for (const pay of payments || []) {
        const at = new Date(pay.payment_date).getTime();
        if (endsBefore !== null && at > endsBefore) continue;
        if (startsAfter !== null && at < startsAfter) {
          opening -= pay.amount || 0;
          continue;
        }
        lines.push({
          date: pay.payment_date,
          kind: "payment",
          reference: pay.reference_number || "Payment",
          description: `Payment received (${(pay.payment_method || "").replace(/_/g, " ")})`,
          credit: pay.amount || 0,
        });
      }

      const printed = printStatement({
        school: {
          name: school?.name || "School",
          address: school?.address,
          email: school?.email,
          phone: school?.phone,
          logoUrl: school?.logo_url,
        },
        currency,
        studentName: student.name,
        studentIdNumber: student.idNumber,
        className: displayClassName(student.className) || null,
        guardianName,
        from: from || null,
        to: to || null,
        statusFilter: status,
        openingBalance: opening,
        lines,
        generatedBy,
      });

      if (!printed) {
        toast.error("Allow pop-ups for this site to open the statement.");
        return;
      }
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Could not build the statement. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" /> Statement of account
          </DialogTitle>
          <DialogDescription>
            A printable running ledger of invoices raised and payments received.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {students.length > 1 && (
            <div className="space-y-1.5">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="statement-from">From</Label>
              <Input id="statement-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="statement-to">To</Label>
              <Input id="statement-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave the dates blank for a full history. Anything before the start date is shown as a
            balance brought forward.
          </p>

          <div className="space-y-1.5">
            <Label>Invoice status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatementStatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATEMENT_STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePrint} disabled={busy || !student}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Generate statement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
