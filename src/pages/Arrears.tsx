import { displayClassName } from "@/lib/sections";
import { useState } from "react";
import { AlertTriangle, Users, Bell, Loader2, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/use-currency";
import { LetterDialog, type LetterTarget } from "@/components/letters/LetterDialog";
import { sendInvoiceReminders } from "@/lib/notification-dispatcher";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

function ageingBadge(days: number) {
  if (days <= 30) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[11px]">0–30 days</Badge>;
  if (days <= 60) return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[11px]">31–60 days</Badge>;
  return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[11px] font-semibold">60+ days</Badge>;
}

export default function Arrears() {
  const { schoolId, orgId, user } = useAuth();
  const { formatMoney } = useCurrency();
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [letterTargets, setLetterTargets] = useState<LetterTarget[]>([]);
  const [letterLabel, setLetterLabel] = useState<string>("");
  const [letterOpen, setLetterOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const openLetters = (targets: LetterTarget[], label: string) => {
    if (targets.length === 0) return;
    setLetterTargets(targets);
    setLetterLabel(label);
    setLetterOpen(true);
  };

  /** Reminders for everything due soon or already late, honouring each
      recipient's channel choices, digest frequency and quiet hours. */
  const handleScheduleReminders = async () => {
    if (!orgId || !schoolId) return;
    setScheduling(true);
    try {
      const result = await sendInvoiceReminders({ orgId, schoolId, scope: "both", daysAhead: 7 });
      if (result.candidates === 0) {
        toast.info("Nothing to remind on — no invoices are due soon or overdue.");
      } else {
        toast.success(
          `${result.candidates} invoice(s): ${result.sent} in-app alert(s), ${result.queued} email/SMS scheduled` +
            (result.skipped ? `, ${result.skipped} skipped by preference` : ""),
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("Could not schedule reminders");
    } finally {
      setScheduling(false);
    }
  };

  type OverdueInvoice = NonNullable<NonNullable<typeof data>["overdueInvoices"]>[number];

  const handleSendReminder = async (inv: OverdueInvoice) => {
    if (!orgId || !user) return;
    setSendingReminder(inv.id);

    // Find guardians linked to this student
    const { data: guardianLinks } = await supabase
      .from("student_guardians")
      .select("guardian_id, guardians(id, first_name, last_name, user_id)")
      .eq("student_id", inv.student_id);

    const guardians = (guardianLinks || []).map((gl) => gl.guardians).filter(Boolean);

    if (guardians.length === 0) {
      toast.error("No guardians linked to this student");
      setSendingReminder(null);
      return;
    }

    // Create notifications for each guardian with a user_id
    const notifications = guardians
      .filter((g) => g.user_id)
      .map((g) => ({
        org_id: orgId,
        school_id: schoolId,
        user_id: g.user_id,
        type: "overdue_reminder" as const,
        title: "Overdue Payment Reminder",
        message: `Invoice ${inv.invoice_number} for ${inv.studentName} has an outstanding balance of ${formatMoney(inv.balance)}. Please make payment at your earliest convenience.`,
        entity_type: "invoice",
        entity_id: inv.id,
      }));

    if (notifications.length > 0) {
      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) {
        toast.error("Failed to send reminder");
      } else {
        toast.success(`Reminder sent to ${notifications.length} guardian(s)`);
      }
    } else {
      toast.info("No guardians with portal access to notify");
    }

    setSendingReminder(null);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["arrears", schoolId],
    queryFn: async () => {
      if (!schoolId) return { overdueInvoices: [], totalOutstanding: 0, overdueCount: 0 };

      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, due_date, status, student_id, students(first_name, last_name, enrolments(classes(name)))")
        .eq("school_id", schoolId)
        .eq("status", "overdue")
        .order("due_date", { ascending: true });

      const overdueInvoices = (invoices || []).map((inv) => {
        const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
        const daysOverdue = inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)) : 0;
        const studentName = inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : "—";
        const className = displayClassName(inv.students?.enrolments?.[0]?.classes?.name) || "—";
        return { ...inv, balance, daysOverdue, studentName, className };
      });

      const totalOutstanding = overdueInvoices.reduce((s, i) => s + i.balance, 0);

      return { overdueInvoices, totalOutstanding, overdueCount: overdueInvoices.length };
    },
    enabled: !!schoolId,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Arrears & Controls" description="Monitor overdue balances and manage exceptions.">
        <Button variant="outline" size="sm" className="gap-1.5" disabled={scheduling} onClick={handleScheduleReminders}>
          {scheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
          Schedule fee reminders
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Total Outstanding" value={formatMoney(data?.totalOutstanding || 0)} icon={AlertTriangle} mono />
        <StatCard title="Overdue Students" value={(data?.overdueCount || 0).toString()} icon={Users} subtitle="With overdue invoices" />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Overdue Invoices</h3>
            <p className="text-xs text-muted-foreground">
              Print letters for guardians who have no email or portal login — the student takes the letter home.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!data?.overdueInvoices?.length}
            onClick={() =>
              openLetters(
                (data?.overdueInvoices || []).map((inv) => ({
                  studentId: inv.student_id,
                  studentName: inv.studentName,
                  className: inv.className,
                  invoiceNumber: inv.invoice_number,
                  balance: inv.balance,
                  dueDate: inv.due_date,
                  daysOverdue: inv.daysOverdue,
                })),
                `all ${data?.overdueInvoices?.length || 0} overdue invoices`,
              )
            }
          >
            <Printer className="h-3.5 w-3.5" /> Print letters for all
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs">Class</TableHead>
              <TableHead className="text-xs">Invoice</TableHead>
              <TableHead className="text-xs text-right">Outstanding</TableHead>
              <TableHead className="text-xs">Ageing</TableHead>
              <TableHead className="text-xs w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.overdueInvoices?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No overdue invoices.</TableCell>
                </TableRow>
            ) : (
              data?.overdueInvoices?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.studentName}</TableCell>
                  <TableCell>{s.className}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.invoice_number}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(s.balance)}</TableCell>
                  <TableCell>{ageingBadge(s.daysOverdue)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={sendingReminder === s.id}
                        onClick={() => handleSendReminder(s)}
                      >
                        {sendingReminder === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                        Remind
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          openLetters(
                            [{
                              studentId: s.student_id,
                              studentName: s.studentName,
                              className: s.className,
                              invoiceNumber: s.invoice_number,
                              balance: s.balance,
                              dueDate: s.due_date,
                              daysOverdue: s.daysOverdue,
                            }],
                            `${s.studentName} — ${s.invoice_number}`,
                          )
                        }
                      >
                        <Printer className="h-3 w-3" /> Letter
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LetterDialog
        open={letterOpen}
        onOpenChange={setLetterOpen}
        targets={letterTargets}
        defaultKind="overdue_notice"
        contextLabel={letterLabel}
      />
    </div>
  );
}
