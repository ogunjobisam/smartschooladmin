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
import { getErrorMessage } from "@/lib/errors";

interface StaffData {
  id: string;
  first_name: string;
  last_name: string;
  staff_id_number: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  employment_date: string | null;
  employment_status: string;
  qualifications: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffData;
}

export function EditStaffDialog({ open, onOpenChange, staff }: Props) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    staff_id_number: "",
    email: "",
    phone: "",
    gender: "",
    date_of_birth: "",
    employment_date: "",
    employment_status: "",
    qualifications: "",
  });

  useEffect(() => {
    if (open && staff) {
      setForm({
        first_name: staff.first_name || "",
        last_name: staff.last_name || "",
        staff_id_number: staff.staff_id_number || "",
        email: staff.email || "",
        phone: staff.phone || "",
        gender: staff.gender || "",
        date_of_birth: staff.date_of_birth || "",
        employment_date: staff.employment_date || "",
        employment_status: staff.employment_status || "active",
        qualifications: staff.qualifications || "",
      });
    }
  }, [open, staff]);

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
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Invalid email address.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("staff")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          staff_id_number: form.staff_id_number.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
          employment_date: form.employment_date || null,
          employment_status: form.employment_status as any,
          qualifications: form.qualifications.trim() || null,
        })
        .eq("id", staff.id);

      if (error) throw error;
      toast.success("Staff updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["staff-detail", staff.id] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update staff."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Staff</DialogTitle>
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
              <Label>Staff ID</Label>
              <Input value={form.staff_id_number} onChange={(e) => set("staff_id_number", e.target.value)} maxLength={50} />
            </div>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Employment Date</Label>
              <Input type="date" value={form.employment_date} onChange={(e) => set("employment_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.employment_status} onValueChange={(v) => set("employment_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Qualifications</Label>
            <Input value={form.qualifications} onChange={(e) => set("qualifications", e.target.value)} maxLength={500} placeholder="e.g. B.Ed, M.Sc" />
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
