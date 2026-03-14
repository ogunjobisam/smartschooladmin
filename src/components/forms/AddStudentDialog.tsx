import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const studentSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  student_id_number: z.string().trim().max(50).optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  date_of_birth: z.string().optional(),
  student_type: z.enum(["day", "boarding"]).optional(),
  address: z.string().trim().max(500).optional(),
  class_id: z.string().min(1, "Class is required"),
  // Guardian fields (optional)
  add_guardian: z.boolean().optional(),
  guardian_first_name: z.string().trim().max(100).optional(),
  guardian_last_name: z.string().trim().max(100).optional(),
  guardian_phone: z.string().trim().max(20).optional(),
  guardian_email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  guardian_relationship: z.string().trim().max(50).optional(),
}).refine(
  (data) => !data.add_guardian || (data.guardian_first_name && data.guardian_first_name.length > 0),
  { message: "Guardian first name is required", path: ["guardian_first_name"] }
).refine(
  (data) => !data.add_guardian || (data.guardian_last_name && data.guardian_last_name.length > 0),
  { message: "Guardian last name is required", path: ["guardian_last_name"] }
);

type StudentForm = {
  first_name: string;
  last_name: string;
  student_id_number?: string;
  gender?: "Male" | "Female" | "Other";
  date_of_birth?: string;
  student_type?: "day" | "boarding";
  address?: string;
  class_id: string;
  add_guardian: boolean;
  guardian_first_name?: string;
  guardian_last_name?: string;
  guardian_phone?: string;
  guardian_email?: string;
  guardian_relationship?: string;
};

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddStudentDialog({ open, onOpenChange }: AddStudentDialogProps) {
  const { schoolId, orgId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Partial<StudentForm>>({
    student_type: "day",
    add_guardian: false,
  });

  // Fetch classes for the school
  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("level_order");
      return data || [];
    },
    enabled: !!schoolId && open,
  });

  // Fetch current academic period for enrolment
  const { data: currentPeriod } = useQuery({
    queryKey: ["current-period", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_periods")
        .select("id, name, academic_years!inner(org_id)")
        .eq("is_current", true)
        .eq("academic_years.org_id", orgId!)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId && open,
  });

  const set = (field: keyof StudentForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: "" }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = studentSchema.parse(form);
      if (!schoolId) throw new Error("No school selected");
      if (!currentPeriod) throw new Error("No current academic period set. Please configure one in Settings → Academic Years.");

      // 1. Insert student
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .insert({
          first_name: parsed.first_name,
          last_name: parsed.last_name,
          student_id_number: parsed.student_id_number || null,
          gender: parsed.gender || null,
          date_of_birth: parsed.date_of_birth || null,
          student_type: parsed.student_type || "day",
          address: parsed.address || null,
          school_id: schoolId,
        })
        .select("id")
        .single();
      if (studentError) throw studentError;

      // 2. Create enrolment
      const { error: enrolError } = await supabase
        .from("enrolments")
        .insert({
          student_id: studentData.id,
          class_id: parsed.class_id,
          academic_period_id: currentPeriod.id,
        });
      if (enrolError) throw enrolError;

      // 3. Optionally create guardian and link
      if (parsed.add_guardian && parsed.guardian_first_name && parsed.guardian_last_name) {
        const guardianEmail = parsed.guardian_email === "" ? null : (parsed.guardian_email || null);
        const { data: guardianData, error: guardianError } = await supabase
          .from("guardians")
          .insert({
            first_name: parsed.guardian_first_name,
            last_name: parsed.guardian_last_name,
            phone: parsed.guardian_phone || null,
            email: guardianEmail,
            org_id: orgId!,
          })
          .select("id")
          .single();
        if (guardianError) throw guardianError;

        const { error: linkError } = await supabase
          .from("student_guardians")
          .insert({
            student_id: studentData.id,
            guardian_id: guardianData.id,
            relationship: parsed.guardian_relationship || "parent",
            is_primary: true,
          });
        if (linkError) throw linkError;
      }

      return studentData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["guardians"] });
      toast({ title: "Student added", description: `${form.first_name} ${form.last_name} has been enrolled.` });
      onOpenChange(false);
      setForm({ student_type: "day", add_guardian: false });
      setErrors({});
      if (data?.id) navigate(`/students/${data.id}`);
    },
    onError: (err: any) => {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach(e => { if (e.path[0]) fieldErrors[e.path[0] as string] = e.message; });
        setErrors(fieldErrors);
      } else {
        toast({ title: "Error", description: err.message || "Failed to add student.", variant: "destructive" });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
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
              <Label>Class *</Label>
              <Select value={form.class_id || ""} onValueChange={(v) => set("class_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.class_id && <p className="text-xs text-destructive">{errors.class_id}</p>}
              {!currentPeriod && classes && classes.length > 0 && (
                <p className="text-xs text-amber-600">No current academic period set.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Student ID</Label>
              <Input value={form.student_id_number || ""} onChange={(e) => set("student_id_number", e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.student_type || "day"} onValueChange={(v) => set("student_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="boarding">Boarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Guardian Section */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="add-guardian"
              checked={form.add_guardian || false}
              onCheckedChange={(v) => set("add_guardian", !!v)}
            />
            <Label htmlFor="add-guardian" className="cursor-pointer text-sm font-medium">Add a guardian/parent</Label>
          </div>

          {form.add_guardian && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Guardian First Name *</Label>
                  <Input value={form.guardian_first_name || ""} onChange={(e) => set("guardian_first_name", e.target.value)} />
                  {errors.guardian_first_name && <p className="text-xs text-destructive">{errors.guardian_first_name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Guardian Last Name *</Label>
                  <Input value={form.guardian_last_name || ""} onChange={(e) => set("guardian_last_name", e.target.value)} />
                  {errors.guardian_last_name && <p className="text-xs text-destructive">{errors.guardian_last_name}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.guardian_phone || ""} onChange={(e) => set("guardian_phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.guardian_email || ""} onChange={(e) => set("guardian_email", e.target.value)} />
                  {errors.guardian_email && <p className="text-xs text-destructive">{errors.guardian_email}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Select value={form.guardian_relationship || "parent"} onValueChange={(v) => set("guardian_relationship", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent">Parent</SelectItem>
                    <SelectItem value="father">Father</SelectItem>
                    <SelectItem value="mother">Mother</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                    <SelectItem value="uncle">Uncle</SelectItem>
                    <SelectItem value="aunt">Aunt</SelectItem>
                    <SelectItem value="sibling">Sibling</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add Student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
