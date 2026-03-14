import { useState } from "react";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, GraduationCap, CreditCard, Edit, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { EditStudentDialog } from "@/components/forms/EditStudentDialog";
import { LinkGuardianSection } from "@/components/students/LinkGuardianSection";
import { DocumentsTab } from "@/components/documents/DocumentsTab";
import { StudentHistoryTab } from "@/components/students/StudentHistoryTab";
import { printTranscript, TranscriptData } from "@/lib/print-documents";
import { useSchoolBranding } from "@/contexts/SchoolBrandingContext";

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const { schoolId, orgId } = useAuth();
  const { formatMoney } = useCurrency();
  const { branding } = useSchoolBranding();
  const [editOpen, setEditOpen] = useState(false);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("*, enrolments(class_id, classes(name), academic_periods(name))")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: guardians, refetch: refetchGuardians } = useQuery({
    queryKey: ["student-guardians", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_guardians")
        .select("id, relationship, is_primary, guardians(id, first_name, last_name, phone, email)")
        .eq("student_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: invoices } = useQuery({
    queryKey: ["student-invoices", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, issued_at, academic_periods(name)")
        .eq("student_id", id!)
        .order("issued_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ["student-payments", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, payment_method, payment_date, reference_number, payment_allocations(invoice_id, invoices(invoice_number))")
        .eq("student_id", id!)
        .order("payment_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: attendance } = useQuery({
    queryKey: ["student-attendance", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("id, date, status, notes, classes(name)")
        .eq("student_id", id!)
        .order("date", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: scores } = useQuery({
    queryKey: ["student-scores", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_scores")
        .select("id, score, grade, remarks, exams(name, max_score, exam_date, academic_periods(name)), subjects(name)")
        .eq("student_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: awards } = useQuery({
    queryKey: ["student-awards", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_awards")
        .select("id, title, description, award_date, academic_periods(name)")
        .eq("student_id", id!)
        .order("award_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: school } = useQuery({
    queryKey: ["school-detail", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("name, address, email, phone, logo_url")
        .eq("id", schoolId!)
        .maybeSingle();
      return data;
    },
    enabled: !!schoolId,
  });

  if (isLoading || !student) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const initials = `${student.first_name[0]}${student.last_name[0]}`.toUpperCase();
  const className = student.enrolments?.[0]?.classes?.name || "—";
  const totalBilled = invoices?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0;
  const totalPaid = invoices?.reduce((s, i) => s + (i.amount_paid || 0), 0) || 0;

  const formatMethod = (m: string) => m.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/students"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Students</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{student.first_name} {student.last_name}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-card-foreground">{student.first_name} {student.last_name}</h2>
                <StatusBadge status={student.status} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">{student.student_id_number || "—"}</p>
              <p className="text-sm text-muted-foreground">{className} • {student.student_type || "Day"}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Edit className="h-3.5 w-3.5" /> Edit Student</Button>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {student.date_of_birth && <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4 shrink-0" /> DOB: {student.date_of_birth}</div>}
          <div className="flex items-center gap-2 text-muted-foreground"><GraduationCap className="h-4 w-4 shrink-0" /> {student.student_type || "Day Student"}</div>
          {student.address && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /> {student.address}</div>}
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4 shrink-0" /> Enrolled: {new Date(student.created_at).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Billed</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums">{formatMoney(totalBilled)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Paid</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-success">{formatMoney(totalPaid)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className={`mt-1 font-mono text-xl font-bold tabular-nums ${totalBilled - totalPaid > 0 ? 'text-destructive' : ''}`}>{formatMoney(totalBilled - totalPaid)}</p>
        </div>
      </div>

      <Tabs defaultValue="guardians">
        <TabsList className="flex-wrap">
          <TabsTrigger value="guardians">Guardians</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="guardians" className="mt-4">
          <LinkGuardianSection
            studentId={id!}
            guardians={guardians || []}
            onRefresh={() => refetchGuardians()}
          />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No invoices.</TableCell></TableRow>
                ) : (
                  invoices?.map((inv: any) => (
                    <TableRow key={inv.id} className="cursor-pointer" onClick={() => window.location.href = `/invoices/${inv.id}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.academic_periods?.name || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(inv.total_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(inv.amount_paid)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No payments.</TableCell></TableRow>
                ) : (
                  payments?.map((p: any) => {
                    const invoiceNum = p.payment_allocations?.[0]?.invoices?.invoice_number || "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="tabular-nums">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(p.amount)}</TableCell>
                        <TableCell>{formatMethod(p.payment_method)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.reference_number || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{invoiceNum}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <div className="rounded-lg border bg-card">
            {(() => {
              const total = attendance?.length || 0;
              const present = attendance?.filter((a: any) => a.status === "present").length || 0;
              const pct = total > 0 ? Math.round((present / total) * 100) : 0;
              return total > 0 ? (
                <div className="border-b px-5 py-3 flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Attendance Rate:</span>
                  <Badge variant={pct >= 80 ? "default" : "destructive"}>{pct}%</Badge>
                  <span className="text-xs text-muted-foreground">({present}/{total} days present)</span>
                </div>
              ) : null;
            })()}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No attendance records.</TableCell></TableRow>
                ) : (
                  attendance?.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums">{a.date}</TableCell>
                      <TableCell>{a.classes?.name || "—"}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{a.notes || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="grades" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Exam</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs text-right">Score</TableHead>
                  <TableHead className="text-xs">Grade</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scores?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No exam scores.</TableCell></TableRow>
                ) : (
                  scores?.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.exams?.name || "—"}</TableCell>
                      <TableCell>{s.subjects?.name || "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s.score ?? "—"}/{s.exams?.max_score || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{s.grade || "—"}</Badge></TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{s.exams?.exam_date || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.remarks || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {schoolId && <StudentHistoryTab studentId={id!} schoolId={schoolId} />}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {schoolId && orgId && (
            <DocumentsTab entityType="student" entityId={id!} schoolId={schoolId} orgId={orgId} />
          )}
        </TabsContent>
      </Tabs>

      {student && <EditStudentDialog open={editOpen} onOpenChange={setEditOpen} student={student} />}
    </div>
  );
}
