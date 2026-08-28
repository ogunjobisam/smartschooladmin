import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Loader2, Save, Trash2, Pencil, Sparkles, Lock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canManageTemplates } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { DEFAULT_TEMPLATES, PLACEHOLDERS } from "@/lib/notification-template-defaults";
import { toast } from "sonner";

const TEMPLATE_TYPES = [
  { value: "fee_reminder", label: "Fee Reminder" },
  { value: "payment_confirmation", label: "Payment Confirmation" },
  { value: "school_announcement", label: "School Announcement" },
  { value: "overdue_reminder", label: "Overdue Reminder" },
  { value: "invoice_generated", label: "Invoice Generated" },
];

const CHANNELS = [
  { value: "in_app", label: "In-App" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

interface TemplateRow {
  id: string;
  type: string;
  channel: string;
  subject: string;
  body: string;
  is_active: boolean;
}

export default function NotificationTemplates() {
  const { orgId, userRole, user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = canManageTemplates(userRole);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [type, setType] = useState("");
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["notification-templates", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("notification_templates")
        .select("*")
        .eq("org_id", orgId)
        .order("type")
        .order("channel");
      return (data || []) as TemplateRow[];
    },
    enabled: !!orgId,
  });

  const resetForm = () => {
    setEditingId(null);
    setType("");
    setChannel("email");
    setSubject("");
    setBody("");
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (t: TemplateRow) => {
    setEditingId(t.id);
    setType(t.type);
    setChannel(t.channel);
    setSubject(t.subject || "");
    setBody(t.body || "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!orgId || !type || !channel) return;
    setSaving(true);

    const existing = editingId ? templates.find((t) => t.id === editingId) : undefined;
    const { error } = await supabase.from("notification_templates").upsert(
      {
        ...(editingId ? { id: editingId } : {}),
        org_id: orgId,
        type,
        channel,
        subject: subject.trim(),
        body: body.trim(),
        is_active: existing ? existing.is_active : true,
      },
      { onConflict: "org_id,type,channel" },
    );
    setSaving(false);

    if (error) {
      toast.error("Failed to save template");
      return;
    }

    await logAudit({
      orgId,
      userId: user?.id,
      action: editingId ? "notification_template_updated" : "notification_template_created",
      entityType: "notification_template",
      entityId: editingId,
      detail: `${editingId ? "Updated" : "Created"} ${channel} template for ${type.replace(/_/g, " ")}`,
      oldValues: existing ? { subject: existing.subject, body: existing.body } : null,
      newValues: { type, channel, subject: subject.trim(), body: body.trim() },
    });

    toast.success(editingId ? "Template updated" : "Template saved");
    setOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
  };

  const handleLoadDefaults = async () => {
    if (!orgId) return;
    setSeeding(true);
    // Existing wording wins: defaults only fill the gaps.
    const existingKeys = new Set(templates.map((t) => `${t.type}|${t.channel}`));
    const missing = DEFAULT_TEMPLATES.filter((d) => !existingKeys.has(`${d.type}|${d.channel}`));

    if (missing.length === 0) {
      setSeeding(false);
      toast.info("All default templates are already in place");
      return;
    }

    const { error } = await supabase.from("notification_templates").insert(
      missing.map((d) => ({
        org_id: orgId,
        type: d.type,
        channel: d.channel,
        subject: d.subject,
        body: d.body,
        is_active: true,
      })),
    );
    setSeeding(false);

    if (error) {
      toast.error("Could not load the default templates");
      return;
    }

    await logAudit({
      orgId,
      userId: user?.id,
      action: "notification_templates_defaults_loaded",
      entityType: "notification_template",
      detail: `Loaded ${missing.length} default notification template(s)`,
      newValues: { added: missing.map((d) => `${d.type}:${d.channel}`) },
    });

    queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    toast.success(`${missing.length} default template${missing.length === 1 ? "" : "s"} added`);
  };

  const handleToggle = async (t: TemplateRow) => {
    if (!orgId) return;
    await supabase.from("notification_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    await logAudit({
      orgId,
      userId: user?.id,
      action: t.is_active ? "notification_template_disabled" : "notification_template_enabled",
      entityType: "notification_template",
      entityId: t.id,
      detail: `${t.is_active ? "Disabled" : "Enabled"} ${t.channel} template for ${t.type.replace(/_/g, " ")}`,
    });
    queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
  };

  const handleDelete = async (t: TemplateRow) => {
    if (!orgId) return;
    await supabase.from("notification_templates").delete().eq("id", t.id);
    await logAudit({
      orgId,
      userId: user?.id,
      action: "notification_template_deleted",
      entityType: "notification_template",
      entityId: t.id,
      detail: `Deleted ${t.channel} template for ${t.type.replace(/_/g, " ")}`,
      oldValues: { type: t.type, channel: t.channel, subject: t.subject, body: t.body },
    });
    queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    toast.success("Template deleted");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Templates"
        description="The wording used for fee reminders, receipts and announcements across SMS, email and in-app alerts."
      >
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleLoadDefaults} disabled={seeding}>
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Load defaults
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Template
            </Button>
          </div>
        )}
      </PageHeader>

      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You can read the templates your school uses. Only the proprietor, group admin, school
            admin or principal can change them.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
          <CardDescription>
            Used when sending notifications on each channel. Placeholders such as {"{{student_name}}"} are
            replaced when the message goes out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description={
                canEdit
                  ? "Load our default wording for fee reminders, receipts and announcements, then edit anything you want to change."
                  : "Your school has not set up any notification templates yet."
              }
              actionLabel={canEdit ? "Load default templates" : undefined}
              onAction={canEdit ? handleLoadDefaults : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Channel</TableHead>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Active</TableHead>
                    {canEdit && <TableHead className="w-24 text-xs" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{t.type?.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{t.channel}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">{t.subject || "—"}</TableCell>
                      <TableCell>
                        <Switch checked={t.is_active} disabled={!canEdit} onCheckedChange={() => handleToggle(t)} />
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit template" : "Create template"}</DialogTitle>
            <DialogDescription>Changes are recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType} disabled={!!editingId}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={setChannel} disabled={!!editingId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="e.g. Fee reminder for {{student_name}}"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea rows={7} placeholder="Write your template message…" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex flex-wrap gap-1">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBody((b) => `${b}${p}`)}
                    className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !type || !channel} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "Save changes" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
