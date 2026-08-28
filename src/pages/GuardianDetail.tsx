import { displayClassName } from "@/lib/sections";
import { useState } from "react";
import { ArrowLeft, Mail, Phone, MapPin, Edit, Users } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/use-currency";
import { DocumentsTab } from "@/components/documents/DocumentsTab";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function GuardianDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { schoolId, orgId } = useAuth();
  const { formatMoney } = useCurrency();

  const { data: guardian, isLoading } = useQuery({
    queryKey: ["guardian", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("guardians")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: linkedStudents } = useQuery({
    queryKey: ["guardian-students", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_guardians")
        .select("id, relationship, is_primary, students(id, first_name, last_name, student_id_number, status, enrolments(classes(name)))")
        .eq("guardian_id", id!);
      return data || [];
    },
    enabled: !!id,
  });

  const studentIds = linkedStudents?.map((sg) => sg.students?.id).filter(Boolean) || [];

  const { data: invoices } = useQuery({
    queryKey: ["guardian-invoices", studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, issued_at, student_id, students(first_name, last_name), academic_periods(name)")
        .in("student_id", studentIds)
        .order("issued_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  if (isLoading || !guardian) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const initials = `${guardian.first_name[0]}${guardian.last_name[0]}`.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/guardians"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Guardians</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{guardian.first_name} {guardian.last_name}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-card-foreground">{guardian.first_name} {guardian.last_name}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {guardian.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {guardian.phone}</span>}
                {guardian.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {guardian.email}</span>}
                {guardian.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {guardian.address}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="children">
        <TabsList>
          <TabsTrigger value="children">Children ({linkedStudents?.length || 0})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="children" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Student ID</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs">Relationship</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedStudents?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No linked children.</TableCell></TableRow>
                ) : (
                  linkedStudents?.map((sg) => {
                    const s = sg.students;
                    if (!s) return null;
                    return (
                      <TableRow key={sg.id} className="cursor-pointer" onClick={() => navigate(`/students/${s.id}`)}>
                        <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.student_id_number || "—"}</TableCell>
                        <TableCell>{displayClassName(s.enrolments?.[0]?.classes?.name) || "—"}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{sg.relationship || "—"}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!invoices || invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No invoices.</TableCell></TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.students?.first_name} {inv.students?.last_name}</TableCell>
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

        <TabsContent value="documents" className="mt-4">
          {schoolId && orgId && (
            <DocumentsTab entityType="guardian" entityId={id!} schoolId={schoolId} orgId={orgId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
