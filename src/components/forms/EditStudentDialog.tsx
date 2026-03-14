import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
  student_id_number: string | null;
  gender: string | null;
  date_of_birth: string | null;
  student_type: string | null;
  status: string;
  address: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentData;
}

export function EditStudentDialog({ open, onOpenChange, student }: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    student_id_number: "",
    gender: "",
    date_of_birth: "",
    student_type: "",
    status: "",
    address: "",
  });

  useEffect(() => {
    if (open && student) {
      setForm({
        first_name: student.first_name || "",
        last_name: student.last_name || "",
        student_id_number: student.student_id_number || "",
        gender: student.gender || "",
        date_of_birth: student.date_of_birth || "",
        student_type: student.student_type || "day",
        status: student.status || "active",
        address: student.address || "",
      });
    }
  }, [open, student]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    if (form.first_name.trim().length > 100 || form.last_name.trim().length > 100) {
      toast.error("Name must be less than 100 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          student_id_number: form.student_id_number.trim() || null,
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
          student_type: form.student_type || null,
          status: form.status as any,
          address: form.address.trim() || null,
        })
        .eq("id", student.id);

      if (error) throw error;
      toast.success("Student updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["student", student.id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update student.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Student ID</Label>
              <Input value={form.student_id_number} onChange={(e) => set("student_id_number", e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.student_type} onValueChange={(v) => set("student_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="boarding">Boarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
