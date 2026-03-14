import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Loader2, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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

export default function NotificationTemplates() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState("");
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["notification-templates", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("notification_templates" as any)
        .select("*")
        .eq("org_id", orgId)
        .order("type");
      return (data as any[]) || [];
    },
    enabled: !!orgId,
  });

  const handleSave = async () => {
    if (!orgId || !type || !channel) return;
    setSaving(true);
    const { error } = await supabase.from("notification_templates" as any).upsert({
      org_id: orgId,
      type,
      channel,
      subject: subject.trim(),
      body: body.trim(),
      is_active: true,
    }, { onConflict: "org_id,type,channel" as any });
    setSaving(false);
    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved");
      setOpen(false);
      setType("");
      setChannel("email");
      setSubject("");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    await supabase.from("notification_templates" as any).update({ is_active: !currentActive }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("notification_templates" as any).delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
    toast.success("Template deleted");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Notification Templates" description="Customize message templates for SMS, email, and in-app notifications.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Template</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input placeholder="e.g. Fee Payment Reminder for {{student_name}}" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Use {"{{student_name}}"}, {"{{amount}}"}, {"{{school_name}}"} as placeholders</p>
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea rows={6} placeholder="Write your template message…" value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleSave} disabled={saving || !type || !channel} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
          <CardDescription>These templates will be used when sending notifications via each channel</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : templates.length === 0 ? (
            <EmptyState icon={FileText} title="No templates" description="Create templates to customize your notification messages." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Channel</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs">Active</TableHead>
                  <TableHead className="text-xs w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{t.type?.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{t.channel}</Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{t.subject || "—"}</TableCell>
                    <TableCell>
                      <Switch checked={t.is_active} onCheckedChange={() => handleToggle(t.id, t.is_active)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
