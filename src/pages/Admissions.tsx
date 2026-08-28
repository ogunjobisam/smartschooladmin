import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Copy, ExternalLink, Inbox, Link2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ConvertApplicantDialog } from "@/components/admissions/ConvertApplicantDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import { sectionLabel } from "@/lib/sections";
import {
  admissionsUrl, APPLICATION_STATUSES, daysWaiting, FUNNEL_STAGES, funnelCounts,
  isStale, nextStatuses, statusHint, statusLabel, type ApplicationStatus,
} from "@/lib/admissions";
import type { Tables } from "@/integrations/supabase/types";

type Application = Tables<"applications">;

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  new: "border-primary/30 bg-primary/10 text-primary",
  reviewing: "border-warning/30 bg-warning/10 text-warning",
  interview: "border-warning/30 bg-warning/10 text-warning",
  offered: "border-success/30 bg-success/10 text-success",
  accepted: "border-success/30 bg-success/10 text-success",
  enrolled: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  withdrawn: "border-border bg-muted text-muted-foreground",
};

/**
 * The roles the "Admissions staff can manage applications" policy allows.
 * Bursars can read the funnel — they plan fees around it — but every write they
 * attempted was refused by row-level security, so the controls are hidden
 * rather than left to fail.
 */
const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal"];

export default function Admissions() {
  const { schoolId, userRole } = useAuth();
  const canManage = MANAGER_ROLES.includes(userRole || "");
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<ApplicationStatus | "open" | "all">("open");
  const [selected, setSelected] = useState<Application | null>(null);
  const [converting, setConverting] = useState<Application | null>(null);
  const [notes, setNotes] = useState("");

  const { data: school } = useQuery({
    queryKey: ["school-admissions", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, admissions_slug, admissions_open")
        .eq("id", schoolId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const counts = useMemo(() => funnelCounts(applications), [applications]);

  const visible = useMemo(() => {
    if (filter === "all") return applications;
    if (filter === "open") return applications.filter((a) => APPLICATION_STATUSES.find((s) => s.value === a.status)?.open);
    return applications.filter((a) => a.status === filter);
  }, [applications, filter]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status, decisionNotes }: { id: string; status: ApplicationStatus; decisionNotes?: string }) => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("applications")
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: session.user?.id ?? null,
          ...(decisionNotes !== undefined ? { decision_notes: decisionNotes || null } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application updated");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      setSelected(null);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not update the application")),
  });

  const publicUrl = school?.admissions_slug
    ? admissionsUrl(school.admissions_slug, window.location.origin)
    : null;

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copied", { description: "Paste it into WhatsApp, your website or a flyer." });
    } catch {
      // Clipboard access is denied in some browsers and every insecure origin.
      toast.error("Could not copy", { description: publicUrl });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Admissions" description="Applications from your public form, and where each one has got to.">
        {publicUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" /> Copy application link
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Preview
              </a>
            </Button>
          </div>
        )}
      </PageHeader>

      {school && !school.admissions_open && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <Link2 className="h-4 w-4 text-warning" />
            <span>
              Your application form is closed, so the public page turns families away.
              Open it in <strong>Settings → Admissions</strong> when you are ready for applications.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {FUNNEL_STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setFilter(stage)}
            className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 ${
              filter === stage ? "border-primary bg-primary/5" : "bg-card"
            }`}
          >
            <p className="text-2xl font-semibold tabular-nums">{counts[stage]}</p>
            <p className="text-xs text-muted-foreground">{statusLabel(stage)}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="admissions-filter" className="text-xs text-muted-foreground">Showing</Label>
        <Select value={filter} onValueChange={(v) => setFilter(v as ApplicationStatus | "open" | "all")}>
          <SelectTrigger id="admissions-filter" className="h-8 w-56 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Still in progress</SelectItem>
            <SelectItem value="all">Everything</SelectItem>
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={applications.length === 0 ? "No applications yet" : "Nothing at this stage"}
          description={
            applications.length === 0
              ? publicUrl
                ? "Share your application link and applications will land here."
                : "Set an admissions link in Settings → Admissions, then share it."
              : "Try a different stage, or show everything."
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead className="hidden sm:table-cell">Section</TableHead>
                <TableHead className="hidden md:table-cell">Parent / guardian</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Waiting</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((application) => {
                const waiting = daysWaiting(application.created_at);
                return (
                  <TableRow
                    key={application.id}
                    className="cursor-pointer"
                    onClick={() => { setSelected(application); setNotes(application.decision_notes || ""); }}
                  >
                    <TableCell>
                      <p className="font-medium">{application.applicant_first_name} {application.applicant_last_name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{application.reference}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{sectionLabel(application.section)}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      <p>{application.guardian_name}</p>
                      <p className="text-xs text-muted-foreground">{application.guardian_phone}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[application.status]}`}>
                        {statusLabel(application.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm tabular-nums">
                      <span className={isStale(application) ? "inline-flex items-center gap-1 text-destructive" : "text-muted-foreground"}>
                        {isStale(application) && <Clock className="h-3.5 w-3.5" />}
                        {waiting === 0 ? "Today" : `${waiting}d`}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canManage && application.status === "accepted" && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConverting(application)}>
                          <UserPlus className="h-3.5 w-3.5" /> Enrol
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected?.applicant_first_name} {selected?.applicant_last_name}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{selected?.reference}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Date of birth</dt><dd>{selected.date_of_birth || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Gender</dt><dd>{selected.gender || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Applying for</dt><dd>{sectionLabel(selected.section)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Previous school</dt><dd>{selected.previous_school || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Parent / guardian</dt><dd>{selected.guardian_name}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{selected.guardian_phone}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="break-all">{selected.guardian_email || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Heard about us via</dt><dd>{selected.source || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Address</dt><dd>{selected.guardian_address || "—"}</dd></div>
                {selected.message && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Their message</dt>
                    <dd className="whitespace-pre-wrap">{selected.message}</dd>
                  </div>
                )}
              </dl>

              <div className="space-y-1.5">
                <Label htmlFor="decision-notes">Notes</Label>
                <Textarea
                  id="decision-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Interview date, what was agreed, why the decision went the way it did."
                />
              </div>

              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">{statusHint(selected.status)}</p>
                {!canManage ? (
                  <p className="text-sm text-muted-foreground">
                    You can follow this application, but only an administrator or the
                    principal can move it or enrol the applicant.
                  </p>
                ) : selected.status === "enrolled" ? (
                  <p className="text-sm text-muted-foreground">
                    This applicant is on the roll and can no longer be moved.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {nextStatuses(selected.status).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: selected.id, status, decisionNotes: notes })}
                      >
                        {statusLabel(status)}
                      </Button>
                    ))}
                  </div>
                )}
                {canManage && selected.status === "accepted" && (
                  <Button
                    size="sm"
                    className="mt-1 gap-1.5"
                    onClick={() => { setConverting(selected); setSelected(null); }}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Enrol as a student
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConvertApplicantDialog
        application={converting}
        onOpenChange={(v) => { if (!v) setConverting(null); }}
      />
    </div>
  );
}
