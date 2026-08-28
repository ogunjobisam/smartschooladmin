import { useState } from "react";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";
import { InviteLinkDialog } from "@/components/auth/InviteLinkDialog";

interface Props {
  studentId: string;
  studentName: string;
  hasLogin: boolean;
}

/**
 * Gives a student their own sign-in, from their student record.
 *
 * Students have no email on their record — schools rarely hold one — so the
 * address is asked for here rather than assumed.
 */
export function InviteStudentButton({ studentId, studentName, hasLogin }: Props) {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<{ email: string; link: string } | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const trimmed = email.trim();
      if (!trimmed) throw new Error("Enter an email address for this student");

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          action: "invite_student",
          email: trimmed,
          full_name: studentName,
          org_id: orgId,
          student_id: studentId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { invite_link?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["student"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success(`${studentName} can now sign in to the student portal`);
      setOpen(false);
      if (data.invite_link) setInviteLink({ email: email.trim(), link: data.invite_link });
      setEmail("");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Failed to invite this student")),
  });

  if (hasLogin) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3 w-3" /> Has portal access
      </span>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Invite to portal
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite {studentName} to the portal</DialogTitle>
            <DialogDescription>
              They will be able to see their own results, attendance and fees — nothing
              else about the school.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="student-email">Email address</Label>
            <Input
              id="student-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) invite.mutate(); }}
            />
            <p className="text-xs text-muted-foreground">
              For younger students this is usually a parent's address.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => invite.mutate()} disabled={invite.isPending || !email.trim()} className="gap-1.5">
              {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteLinkDialog invite={inviteLink} onClose={() => setInviteLink(null)} />
    </>
  );
}
