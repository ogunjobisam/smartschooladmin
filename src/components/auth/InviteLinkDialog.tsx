import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  invite: { email: string; link: string } | null;
  onClose: () => void;
}

/**
 * Shows the set-password link after an invite.
 *
 * The invite is also queued as an email, but a school that has not configured a
 * mail provider needs to be able to pass the link on by hand — otherwise the new
 * account is unusable and nothing on screen says why.
 */
export function InviteLinkDialog({ invite, onClose }: Props) {
  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select the link and copy it manually.");
    }
  };

  return (
    <Dialog open={!!invite} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {invite?.email} their sign-in link</DialogTitle>
          <DialogDescription>
            We have queued this as an email. If your school has not set up an email provider
            yet, copy the link and send it yourself — the account cannot be used until they
            set a password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              readOnly
              value={invite?.link ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="outline" className="shrink-0 gap-1.5" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This link expires, so send it soon. A new one can always be issued from the
            sign-in page's &ldquo;Forgot password&rdquo; link.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
