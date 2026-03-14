import { useState } from "react";
import { ArrowLeft, Mail, Phone, Building2, Calendar, Banknote, Edit, Lock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";
import { EditStaffDialog } from "@/components/forms/EditStaffDialog";
import { InviteStaffButton } from "@/components/staff/InviteStaffButton";

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const { formatMoney } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("*, staff_positions(title, department, is_current), schools(name)")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: payrollProfile } = useQuery({
    queryKey: ["payroll-profile", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_profiles")
        .select("*")
        .eq("staff_id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: bankDetails } = useQuery({
    queryKey: ["bank-details", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_bank_details")
        .select("*")
        .eq("staff_id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: payslips } = useQuery({
    queryKey: ["staff-payslips", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_run_items")
        .select("id, basic, allowances, deductions, net_pay, payroll_runs(period_label, status)")
        .eq("staff_id", id!)
        .order("created_at", { ascending: false })
        .limit(12);
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading || !staff) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const currentPos = staff.staff_positions?.find((p: any) => p.is_current);
  const initials = `${staff.first_name[0]}${staff.last_name[0]}`.toUpperCase();

  const pp = payrollProfile;
  const grossPay = pp ? (pp.basic_salary || 0) + (pp.housing_allowance || 0) + (pp.transport_allowance || 0) + (pp.other_allowances || 0) : 0;
  const pensionDeduction = pp ? Math.round(grossPay * ((pp.pension_rate || 0) / 100)) : 0;
  const taxDeduction = pp ? Math.round(grossPay * ((pp.tax_rate || 0) / 100)) : 0;
  const netPay = grossPay - pensionDeduction - taxDeduction;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/staff"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Staff</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">{staff.first_name} {staff.last_name}</span>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-card-foreground">{staff.first_name} {staff.last_name}</h2>
                <StatusBadge status={staff.employment_status as any} />
              </div>
              <p className="font-mono text-xs text-muted-foreground">{staff.staff_id_number || "—"}</p>
              <p className="text-sm text-muted-foreground">{currentPos?.title || "—"} • {currentPos?.department || "—"}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Edit className="h-3.5 w-3.5" /> Edit Staff</Button>
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {staff.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {staff.email}</div>}
          {staff.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {staff.phone}</div>}
          <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /> {staff.schools?.name || "—"}</div>
          {staff.employment_date && <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> Joined: {staff.employment_date}</div>}
        </div>
      </div>

      <Tabs defaultValue="salary">
        <TabsList>
          <TabsTrigger value="salary">Salary & Payroll</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
        </TabsList>

        <TabsContent value="salary" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote className="h-4 w-4 text-accent" /> Salary Breakdown</h3>
              {pp ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Basic Salary</span><span className="font-mono tabular-nums">{formatMoney(pp.basic_salary)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Housing Allowance</span><span className="font-mono tabular-nums">{formatMoney(pp.housing_allowance || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Transport Allowance</span><span className="font-mono tabular-nums">{formatMoney(pp.transport_allowance || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Other Allowances</span><span className="font-mono tabular-nums">{formatMoney(pp.other_allowances || 0)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-semibold"><span>Gross Pay</span><span className="font-mono tabular-nums">{formatMoney(grossPay)}</span></div>
                  <div className="flex justify-between text-destructive"><span className="text-muted-foreground">Pension ({pp.pension_rate || 0}%)</span><span className="font-mono tabular-nums">-{formatMoney(pensionDeduction)}</span></div>
                  <div className="flex justify-between text-destructive"><span className="text-muted-foreground">Tax ({pp.tax_rate || 0}%)</span><span className="font-mono tabular-nums">-{formatMoney(taxDeduction)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold text-success"><span>Net Pay</span><span className="font-mono tabular-nums">{formatMoney(netPay)}</span></div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No payroll profile configured.</p>
              )}
            </div>

            <div className="rounded-lg border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-accent" /> Bank Details</h3>
              {bankDetails ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span>{bankDetails.bank_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Account Number</span><span className="font-mono tabular-nums">{bankDetails.account_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Account Name</span><span>{bankDetails.account_name}</span></div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No bank details on file.</p>
              )}
              <p className="text-[11px] text-muted-foreground italic">Bank details are restricted to authorised finance roles.</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payslips" className="mt-4">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-right">Basic</TableHead>
                  <TableHead className="text-xs text-right">Allowances</TableHead>
                  <TableHead className="text-xs text-right">Deductions</TableHead>
                  <TableHead className="text-xs text-right">Net</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No payslips found.</TableCell></TableRow>
                ) : (
                  payslips?.map((ps: any) => (
                    <TableRow key={ps.id}>
                      <TableCell className="font-medium">{ps.payroll_runs?.period_label || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(ps.basic)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatMoney(ps.allowances)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{formatMoney(ps.deductions)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatMoney(ps.net_pay)}</TableCell>
                      <TableCell><StatusBadge status={ps.payroll_runs?.status || "draft"} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {staff && <EditStaffDialog open={editOpen} onOpenChange={setEditOpen} staff={staff} />}
    </div>
  );
}
