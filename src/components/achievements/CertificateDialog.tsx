import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  printCertificates,
  type CertificateKind,
  type CertificateRecipient,
  type CertificateSchool,
} from "@/lib/certificates";

const STORAGE_KEY = "achievement-certificate-signatory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: CertificateRecipient[];
  school: CertificateSchool;
}

/**
 * Certificates and award letters print from the browser rather than a PDF
 * service: schools print in bulk on their own headed card stock, and a print
 * dialog is the one route that works the same on every machine in a Nigerian
 * school office.
 */
export function CertificateDialog({ open, onOpenChange, recipients, school }: Props) {
  const [kind, setKind] = useState<CertificateKind>("certificate");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryRole, setSignatoryRole] = useState("Head of School");
  const [countersignName, setCountersignName] = useState("");
  const [countersignRole, setCountersignRole] = useState("");
  const [note, setNote] = useState("");

  // The signatory is the same person every time, so remember it.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        setSignatoryName(saved.signatoryName || "");
        setSignatoryRole(saved.signatoryRole || "Head of School");
        setCountersignName(saved.countersignName || "");
        setCountersignRole(saved.countersignRole || "");
      }
    } catch {
      /* ignore unreadable preferences */
    }
  }, []);

  const handlePrint = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ signatoryName, signatoryRole, countersignName, countersignRole }),
      );
    } catch {
      /* ignore */
    }

    const ok = printCertificates(
      recipients,
      { kind, signatoryName, signatoryRole, countersignName, countersignRole, note },
      school,
    );
    if (!ok) {
      toast.error("Your browser blocked the print window. Allow pop-ups for this site and try again.");
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Print for {recipients.length} recipient{recipients.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Only published recognitions can be printed, so what you hand out always matches the record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Document</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as CertificateKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="certificate">Certificate (landscape, for framing)</SelectItem>
                <SelectItem value="letter">Award letter (portrait, for signing and filing)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cert-sign-name">Signed by</Label>
              <Input
                id="cert-sign-name"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="Mrs A. Ogundele"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-sign-role">Role</Label>
              <Input
                id="cert-sign-role"
                value={signatoryRole}
                onChange={(e) => setSignatoryRole(e.target.value)}
                placeholder="Head of School"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-counter-name">Countersigned by (optional)</Label>
              <Input
                id="cert-counter-name"
                value={countersignName}
                onChange={(e) => setCountersignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert-counter-role">Role</Label>
              <Input
                id="cert-counter-role"
                value={countersignRole}
                onChange={(e) => setCountersignRole(e.target.value)}
                placeholder="Chair, PTA"
              />
            </div>
          </div>

          {kind === "letter" && (
            <div className="space-y-2">
              <Label htmlFor="cert-note">Extra paragraph (optional)</Label>
              <Textarea
                id="cert-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Prizes will be presented at the end-of-term assembly on Friday."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePrint} disabled={recipients.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            Open print view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
