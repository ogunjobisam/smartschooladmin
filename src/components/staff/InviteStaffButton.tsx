import { useState } from "react";
import { Mail } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STAFF_ROLES = [
  { value: "teacher", label: "Teacher" },
  { value: "principal", label: "Principal" },
  { value: "bursar", label: "Bursar" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "hr_admin", label: "HR Admin" },
];

interface InviteStaffButtonProps {
  staffId: string;
  staffName: string;
  staffEmail: string | null;
  hasUserId: boolean;
}

export function InviteStaffButton({ staffId, staffName, staffEmail, hasUserId }: InviteStaffButtonProps) {
  const { orgId, schoolId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("teacher");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!staffEmail) throw new Error("Staff member has no email address. Please add an email first.");
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: staffEmail,
          full_name: staffName,
          role,
          org_id: orgId,
          school_id: schoolId,
          staff_id: staffId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-detail", staffId] });
      toast({ title: "Invite sent", description: `${staffName} can now log in to the system.` });
      setOpen(false);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to send invite.", variant: "destructive" });
    },
  });

  if (hasUserId) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)} disabled={!staffEmail}>
        <Mail className="h-3.5 w-3.5" /> Send Login Invite
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Login Invite</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This will create a login account for <strong>{staffName}</strong> ({staffEmail}) and assign them a system role.
            </p>
            <div className="space-y-1.5">
              <Label>System Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Sending…" : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
