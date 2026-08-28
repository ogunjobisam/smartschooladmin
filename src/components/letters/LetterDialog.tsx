import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/use-currency";
import { logAudit } from "@/lib/audit";
import {
  LETTER_KINDS, letterSubject, printLetters,
  type LetterKind, type LetterRecipient,
} from "@/lib/letters";

export interface LetterTarget extends LetterRecipient {
  studentId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: LetterTarget[];
  defaultKind?: LetterKind;
  /** Shown in the dialog so the user knows what is about to be printed. */
  contextLabel?: string;
}

const SIGNATORY_KEY = "letters:signatory";
const INSTRUCTIONS_KEY = "letters:instructions";

export function LetterDialog({ open, onOpenChange, targets, defaultKind = "fee_reminder", contextLabel }: Props) {
  const { schoolId, orgId, user } = useAuth();
  const { currency } = useCurrency();

  const [kind, setKind] = useState<LetterKind>(defaultKind);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [respondBy, setRespondBy] = useState("");
  const [instructions, setInstructions] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryRole, setSignatoryRole] = useState("Bursar");
  const [includeSlip, setIncludeSlip] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    // The signatory and payment details barely change between letters, so remember them.
    const savedSig = localStorage.getItem(SIGNATORY_KEY);
    if (savedSig) {
      try {
        const parsed = JSON.parse(savedSig) as { name?: string; role?: string };
        if (parsed.name) setSignatoryName(parsed.name);
        if (parsed.role) setSignatoryRole(parsed.role);
      } catch { /* ignore malformed cache */ }
    }
    const savedInstructions = localStorage.getItem(INSTRUCTIONS_KEY);
    if (savedInstructions) setInstructions(savedInstructions);
  }, [open, defaultKind]);

  const { data: school } = useQuery({
    queryKey: ["letter-school", schoolId],
    enabled: !!schoolId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("name, address, email, phone, logo_url")
        .eq("id", schoolId!)
        .maybeSingle();
      return data;
    },
  });

  const studentIds = useMemo(() => targets.map((t) => t.studentId).filter(Boolean), [targets]);

  // Address each letter to the guardian on record; students whose guardian is not
  // recorded still get a letter, addressed generically, rather than being skipped.
  const { data: guardianNames, isLoading: loadingGuardians } = useQuery({
    queryKey: ["letter-guardians", studentIds.join(",")],
    enabled: open && studentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_guardians")
        .select("student_id, is_primary, guardians(first_name, last_name)")
        .in("student_id", studentIds);
      const map: Record<string, string> = {};
      (data || []).forEach((row) => {
        const g = row.guardians;
        if (!g) return;
        const name = `${g.first_name} ${g.last_name}`.trim();
        if (!map[row.student_id] || row.is_primary) map[row.student_id] = name;
      });
      return map;
    },
  });

  const missingGuardians = studentIds.filter((id) => !guardianNames?.[id]).length;

  const handlePrint = async () => {
    if (!school) return;
    if (kind === "general" && !body.trim()) {
      toast.error("Write the message you want the parents to read.");
      return;
    }
    setPrinting(true);
    const recipients: LetterRecipient[] = targets.map((t) => ({
      ...t,
      guardianName: t.guardianName || guardianNames?.[t.studentId] || null,
    }));

    const opened = printLetters(
      recipients,
      {
        kind,
        subject: subject.trim() || undefined,
        body,
        respondBy: respondBy || undefined,
        paymentInstructions: instructions,
        signatoryName,
        signatoryRole,
        includeSlip,
      },
      {
        name: school.name,
        address: school.address,
        email: school.email,
        phone: school.phone,
        logoUrl: school.logo_url,
        currency,
      },
    );

    if (!opened) {
      setPrinting(false);
      toast.error("Your browser blocked the print window. Allow pop-ups for this site and try again.");
      return;
    }

    localStorage.setItem(SIGNATORY_KEY, JSON.stringify({ name: signatoryName, role: signatoryRole }));
    localStorage.setItem(INSTRUCTIONS_KEY, instructions);

    if (orgId) {
      await logAudit({
        orgId,
        userId: user?.id,
        action: "letters_generated",
        entityType: "parent_letter",
        entityId: targets.length === 1 ? targets[0].studentId : schoolId,
        detail: `Printed ${targets.length} "${letterSubject(kind, subject)}" letter${targets.length === 1 ? "" : "s"} to hand to students${contextLabel ? ` (${contextLabel})` : ""}.`,
        newValues: {
          kind,
          count: targets.length,
          respond_by: respondBy || null,
          students: targets.slice(0, 50).map((t) => t.studentId),
        },
      });
    }

    setPrinting(false);
    onOpenChange(false);
    toast.success(`${targets.length} letter${targets.length === 1 ? "" : "s"} ready to print.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Print letters for parents</DialogTitle>
          <DialogDescription>
            For guardians without email or a portal login. Each letter prints on its own page with a tear-off slip the parent
            signs and the student brings back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p>
              <strong>{targets.length}</strong> letter{targets.length === 1 ? "" : "s"}
              {contextLabel ? ` — ${contextLabel}` : ""}
            </p>
            {loadingGuardians ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Looking up guardian names…
              </p>
            ) : missingGuardians > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {missingGuardians} letter{missingGuardians === 1 ? "" : "s"} will be addressed to "Parent / Guardian" — no guardian
                is recorded for {missingGuardians === 1 ? "that student" : "those students"}.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Letter type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as LetterKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LETTER_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {LETTER_KINDS.find((k) => k.value === kind)?.description}
            </p>
          </div>

          {kind === "general" ? (
            <>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mid-term break" />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write the letter in your own words. Leave a blank line between paragraphs."
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Please pay or respond by</Label>
              <Input type="date" value={respondBy} onChange={(e) => setRespondBy(e.target.value)} />
              <p className="text-xs text-muted-foreground">Optional. Leave blank to ask for payment "as soon as possible".</p>
            </div>
          )}

          {kind !== "general" && (
            <div className="space-y-2">
              <Label>How to pay</Label>
              <Textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={"Bank transfer: Zenith Bank 1234567890 (School Name)\nOr pay at the bursary, Monday–Friday, 8am–3pm."}
              />
              <p className="text-xs text-muted-foreground">Printed in a box on the letter. Saved for next time.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Signed by</Label>
              <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="Mrs A. Okoro" />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input value={signatoryRole} onChange={(e) => setSignatoryRole(e.target.value)} placeholder="Bursar" />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={includeSlip} onCheckedChange={(v) => setIncludeSlip(v === true)} className="mt-0.5" />
            <span>Include the tear-off acknowledgement slip for the parent to sign and return.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePrint} disabled={printing || !school || targets.length === 0}>
            {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            Print {targets.length} letter{targets.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
