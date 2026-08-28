import { useState } from "react";
import { Mail } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InviteGuardianButtonProps {
  guardianId: string;
  guardianName: string;
  guardianEmail: string | null;
  hasUserId: boolean;
}

export function InviteGuardianButton({ guardianId, guardianName, guardianEmail, hasUserId }: InviteGuardianButtonProps) {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!guardianEmail) throw new Error("Guardian has no email address. Please add an email first.");
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          action: "invite_guardian",
          email: guardianEmail,
          full_name: guardianName,
          org_id: orgId,
          guardian_id: guardianId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guardians"] });
      queryClient.invalidateQueries({ queryKey: ["student-guardians"] });
      toast({ title: "Invite sent", description: `${guardianName} can now access the parent portal.` });
      setOpen(false);
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to send invite.", variant: "destructive" });
    },
  });

  if (hasUserId) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Mail className="h-3 w-3" /> Has login
      </span>
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={() => setOpen(true)} disabled={!guardianEmail}>
        <Mail className="h-3 w-3" /> Invite
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Parent Portal Invite</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a login account for <strong>{guardianName}</strong> ({guardianEmail}) with parent portal access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Sending…" : "Send Invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
