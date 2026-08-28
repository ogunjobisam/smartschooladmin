import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const staffSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional(),
  staff_id_number: z.string().trim().max(50).optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  date_of_birth: z.string().optional(),
  employment_date: z.string().optional(),
  position_title: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(),
  send_invite: z.boolean().optional(),
  invite_role: z.string().optional(),
});

type StaffForm = z.infer<typeof staffSchema>;

const STAFF_ROLES = [
  { value: "teacher", label: "Teacher" },
  { value: "principal", label: "Principal" },
  { value: "bursar", label: "Bursar" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "hr_admin", label: "HR Admin" },
];

interface AddStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddStaffDialog({ open, onOpenChange }: AddStaffDialogProps) {
  const { schoolId, orgId } = useAuth();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Partial<StaffForm>>({ send_invite: false, invite_role: "teacher" });

  const set = (field: keyof StaffForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: "" }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = staffSchema.parse(form);
      if (!schoolId) throw new Error("No school selected");
      const { position_title, department, send_invite, invite_role, ...staffData } = parsed;
      const emailVal = staffData.email === "" ? null : (staffData.email || null);

      // Validate email is required if sending invite
      if (send_invite && !emailVal) {
        throw new z.ZodError([{
          code: "custom",
          path: ["email"],
          message: "Email is required to send a login invite",
        }]);
      }

      const { data, error } = await supabase
        .from("staff")
        .insert({
          first_name: staffData.first_name,
          last_name: staffData.last_name,
          email: emailVal,
          phone: staffData.phone || null,
          staff_id_number: staffData.staff_id_number || null,
          gender: staffData.gender || null,
          date_of_birth: staffData.date_of_birth || null,
          employment_date: staffData.employment_date || null,
          school_id: schoolId,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Add position if provided
      if (position_title && data?.id) {
        await supabase.from("staff_positions").insert({
          staff_id: data.id,
          title: position_title,
          department: department || null,
          is_current: true,
        });
      }

      // Send login invite if requested
      if (send_invite && emailVal && data?.id) {
        const { data: inviteResult, error: inviteError } = await supabase.functions.invoke("invite-user", {
          body: {
            email: emailVal,
            full_name: `${staffData.first_name} ${staffData.last_name}`,
            role: invite_role || "teacher",
            org_id: orgId,
            school_id: schoolId,
            staff_id: data.id,
          },
        });
        if (inviteError) {
          // Staff created but invite failed - still show success with warning
          toast({ title: "Staff added (invite failed)", description: `Staff created but login invite failed: ${inviteError.message}`, variant: "destructive" });
          return data;
        }
        // Link user_id to staff record
        if (inviteResult?.user_id) {
          await supabase.from("staff").update({ user_id: inviteResult.user_id }).eq("id", data.id);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast({ title: "Staff added", description: `${form.first_name} ${form.last_name} has been added.${form.send_invite ? " Login invite sent." : ""}` });
      onOpenChange(false);
      setForm({ send_invite: false, invite_role: "teacher" });
      setErrors({});
    },
    onError: (err) => {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach(e => { if (e.path[0]) fieldErrors[e.path[0] as string] = e.message; });
        setErrors(fieldErrors);
      } else {
        toast({ title: "Error", description: err.message || "Failed to add staff.", variant: "destructive" });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.first_name || ""} onChange={(e) => set("first_name", e.target.value)} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.last_name || ""} onChange={(e) => set("last_name", e.target.value)} />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Staff ID</Label>
              <Input value={form.staff_id_number || ""} onChange={(e) => set("staff_id_number", e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender || ""} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={form.position_title || ""} onChange={(e) => set("position_title", e.target.value)} placeholder="e.g. Senior Teacher" />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input value={form.department || ""} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Academics" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Employment Date</Label>
              <Input type="date" value={form.employment_date || ""} onChange={(e) => set("employment_date", e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <Checkbox
              id="send-invite"
              checked={form.send_invite || false}
              onCheckedChange={(v) => set("send_invite", !!v)}
            />
            <Label htmlFor="send-invite" className="cursor-pointer text-sm font-medium">Send login invite (creates a user account)</Label>
          </div>

          {form.send_invite && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
              <Label>System Role</Label>
              <Select value={form.invite_role || "teacher"} onValueChange={(v) => set("invite_role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">An email is required above to send the invite.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add Staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
