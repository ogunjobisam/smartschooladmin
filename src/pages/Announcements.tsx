import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Plus, Loader2, Pencil, Trash2, Infinity as InfinityIcon, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendAnnouncementNotifications } from "@/lib/notification-dispatcher";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { format } from "date-fns";
import { sortBySection } from "@/lib/sections";

type DisplayMode = "one_off" | "scheduled" | "perpetual";

const MODES: { value: DisplayMode; label: string; hint: string }[] = [
  { value: "one_off", label: "Send once now", hint: "Delivered immediately and kept as a record." },
  { value: "scheduled", label: "Show between dates", hint: "Stays on the noticeboard between the dates you choose." },
  { value: "perpetual", label: "Stay up until removed", hint: "Remains on the noticeboard until you change or remove it." },
];

const toLocalInput = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";

const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  target_class_id: string | null;
  channels: string[] | null;
  status: string;
  sent_at: string | null;
  display_mode: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

export default function Announcements() {
  const { orgId, schoolId, user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Create form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [targetClassId, setTargetClassId] = useState("");
  const [channelInApp, setChannelInApp] = useState(true);
  const [channelEmail, setChannelEmail] = useState(false);
  const [mode, setMode] = useState<DisplayMode>("one_off");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  // Edit / remove state
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMode, setEditMode] = useState<DisplayMode>("perpetual");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [removing, setRemoving] = useState<AnnouncementRow | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return sortBySection(data || []);
    },
    enabled: !!schoolId,
  });

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("school_announcements")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as AnnouncementRow[];
    },
    enabled: !!orgId,
  });

  const standing = announcements.filter((a) => a.display_mode !== "one_off");
  const history = announcements.filter((a) => a.display_mode === "one_off");

  const isLive = (a: AnnouncementRow) => {
    if (!a.is_active) return false;
    const now = Date.now();
    if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
    if (a.ends_at && new Date(a.ends_at).getTime() < now) return false;
    return true;
  };

  const resetCreateForm = () => {
    setTitle("");
    setBody("");
    setAudience("all");
    setTargetClassId("");
    setChannelEmail(false);
    setMode("one_off");
    setStartsAt("");
    setEndsAt("");
    setIsPinned(false);
  };

  const handleSend = async () => {
    if (!orgId || !schoolId || !title.trim() || !body.trim()) {
      toast.error("Please fill in title and body");
      return;
    }
    if (mode === "scheduled" && !startsAt) {
      toast.error("Choose when the announcement should start showing");
      return;
    }
    setSending(true);

    const channels: string[] = [];
    if (channelInApp) channels.push("in_app");
    if (channelEmail) channels.push("email");

    const startIso = mode === "one_off" ? new Date().toISOString() : toIso(startsAt) || new Date().toISOString();
    const endIso = mode === "scheduled" ? toIso(endsAt) : null;
    // Only alert people once the announcement is actually live; a future-dated
    // one waits on the noticeboard instead of pinging everyone early.
    const notifyNow = new Date(startIso).getTime() <= Date.now();

    const { data: announcement, error } = await supabase
      .from("school_announcements")
      .insert({
        org_id: orgId,
        school_id: schoolId,
        title: title.trim(),
        body: body.trim(),
        audience,
        target_class_id: audience === "class" ? targetClassId || null : null,
        channels,
        status: "sent",
        sent_at: notifyNow ? new Date().toISOString() : null,
        sent_by: user?.id,
        display_mode: mode,
        starts_at: startIso,
        ends_at: endIso,
        is_active: true,
        is_pinned: isPinned,
        updated_by: user?.id,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Failed to save announcement");
      setSending(false);
      return;
    }

    let result: { sent: number; queuedEmails?: number } = { sent: 0, queuedEmails: 0 };
    if (notifyNow && channels.length) {
      result = await sendAnnouncementNotifications({
        orgId,
        schoolId,
        announcementId: announcement.id,
        title: title.trim(),
        body: body.trim(),
        audience,
        targetClassId: audience === "class" ? targetClassId : undefined,
        channels,
      });
    }

    await logAudit({
      orgId,
      userId: user?.id,
      action: "announcement_created",
      entityType: "school_announcement",
      entityId: announcement.id,
      detail: `Created ${MODES.find((m) => m.value === mode)!.label.toLowerCase()} announcement "${title.trim()}" for ${audienceLabel(audience)}`,
      newValues: {
        title: title.trim(), body: body.trim(), audience, display_mode: mode,
        starts_at: startIso, ends_at: endIso, channels, is_active: true, is_pinned: isPinned,
      },
    });

    setSending(false);
    setOpen(false);
    resetCreateForm();
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
    queryClient.invalidateQueries({ queryKey: ["standing-announcements"] });

    if (notifyNow) {
      toast.success(`Announcement published to ${result.sent} recipient(s)`, {
        description: result.queuedEmails
          ? `${result.queuedEmails} email${result.queuedEmails === 1 ? "" : "s"} queued — send them from Settings → Notifications.`
          : undefined,
      });
    } else {
      toast.success("Announcement scheduled", {
        description: `It will appear from ${format(new Date(startIso), "d MMM yyyy, HH:mm")}.`,
      });
    }
  };

  const openEdit = (a: AnnouncementRow) => {
    setEditing(a);
    setEditTitle(a.title);
    setEditBody(a.body);
    setEditMode((a.display_mode as DisplayMode) || "perpetual");
    setEditStart(toLocalInput(a.starts_at));
    setEditEnd(toLocalInput(a.ends_at));
    setEditActive(a.is_active);
  };

  const handleUpdate = async () => {
    if (!editing || !orgId) return;
    if (!editTitle.trim() || !editBody.trim()) {
      toast.error("Please fill in title and body");
      return;
    }
    setSavingEdit(true);

    const next = {
      title: editTitle.trim(),
      body: editBody.trim(),
      display_mode: editMode,
      starts_at: editMode === "one_off" ? editing.starts_at : toIso(editStart),
      ends_at: editMode === "scheduled" ? toIso(editEnd) : null,
      is_active: editActive,
      updated_by: user?.id,
    };

    const { error } = await supabase.from("school_announcements").update(next).eq("id", editing.id);
    setSavingEdit(false);

    if (error) {
      toast.error("Could not update the announcement");
      return;
    }

    await logAudit({
      orgId,
      userId: user?.id,
      action: editActive === false && editing.is_active ? "announcement_withdrawn" : "announcement_updated",
      entityType: "school_announcement",
      entityId: editing.id,
      detail: `Updated announcement "${next.title}"${!editActive ? " and took it down" : ""}`,
      oldValues: {
        title: editing.title, body: editing.body, display_mode: editing.display_mode,
        starts_at: editing.starts_at, ends_at: editing.ends_at, is_active: editing.is_active,
      },
      newValues: next,
    });

    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
    queryClient.invalidateQueries({ queryKey: ["standing-announcements"] });
    toast.success("Announcement updated");
  };

  const handleRemove = async () => {
    if (!removing || !orgId) return;
    const target = removing;
    const { error } = await supabase.from("school_announcements").delete().eq("id", target.id);
    if (error) {
      toast.error("Could not remove the announcement");
      return;
    }

    await logAudit({
      orgId,
      userId: user?.id,
      action: "announcement_removed",
      entityType: "school_announcement",
      entityId: target.id,
      detail: `Removed announcement "${target.title}"`,
      oldValues: {
        title: target.title, body: target.body, audience: target.audience,
        display_mode: target.display_mode, starts_at: target.starts_at,
        ends_at: target.ends_at, is_active: target.is_active,
      },
    });

    setRemoving(null);
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
    queryClient.invalidateQueries({ queryKey: ["standing-announcements"] });
    toast.success("Announcement removed");
  };

  function audienceLabel(a: string) {
    switch (a) {
      case "all": return "Everyone";
      case "parents": return "Parents";
      case "staff": return "Staff";
      case "class": return "Class";
      default: return a;
    }
  }

  const modeBadge = (a: AnnouncementRow) => {
    if (a.display_mode === "perpetual") {
      return <Badge variant="outline" className="gap-1 text-[10px]"><InfinityIcon className="h-3 w-3" /> Always on</Badge>;
    }
    if (a.display_mode === "scheduled") {
      return <Badge variant="outline" className="gap-1 text-[10px]"><CalendarClock className="h-3 w-3" /> Scheduled</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px]">One-off</Badge>;
  };

  const window_ = (a: AnnouncementRow) => {
    if (a.display_mode === "one_off") return a.sent_at ? format(new Date(a.sent_at), "d MMM yyyy, HH:mm") : "—";
    const from = a.starts_at ? format(new Date(a.starts_at), "d MMM yyyy") : "—";
    const to = a.ends_at ? format(new Date(a.ends_at), "d MMM yyyy") : "no end date";
    return `${from} → ${to}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" description="Send a one-off message, or keep a notice up for as long as you need.">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetCreateForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Announcement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="e.g. School Resumes Monday" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea placeholder="Write your announcement message…" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>How long should it run?</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as DisplayMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)!.hint}</p>
              </div>

              {mode !== "one_off" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Show from</Label>
                    <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                  </div>
                  {mode === "scheduled" && (
                    <div className="space-y-2">
                      <Label>Show until</Label>
                      <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="parents">Parents Only</SelectItem>
                    <SelectItem value="staff">Staff Only</SelectItem>
                    <SelectItem value="class">Specific Class</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audience === "class" && (
                <div className="space-y-2">
                  <Label>Select Class</Label>
                  <Select value={targetClassId} onValueChange={setTargetClassId}>
                    <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Delivery Channels</Label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={channelInApp} onCheckedChange={(v) => setChannelInApp(!!v)} />
                    In-App
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={channelEmail} onCheckedChange={(v) => setChannelEmail(!!v)} />
                    Email
                  </label>
                  {/* SMS has no provider yet, so the box is disabled rather than
                      accepted and quietly ignored. */}
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={false} disabled />
                    SMS
                    <Badge variant="outline" className="text-[10px]">Not available yet</Badge>
                  </label>
                </div>
                {channelEmail && (
                  <p className="text-xs text-muted-foreground">
                    Emails are queued, then sent from Settings → Notifications.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} className="gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Saving…" : mode === "one_off" ? "Send Now" : "Publish"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Standing notices — scheduled and always-on */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standing announcements</CardTitle>
          <CardDescription>Notices that stay on the noticeboard. Change or remove them at any time.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : standing.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing standing at the moment. Create an announcement and choose “Stay up until removed”
              or “Show between dates”.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Title</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Audience</TableHead>
                    <TableHead className="text-xs">Showing</TableHead>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standing.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="max-w-[280px] truncate text-xs text-muted-foreground">{a.body}</p>
                      </TableCell>
                      <TableCell>{modeBadge(a)}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{audienceLabel(a.audience)}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{window_(a)}</TableCell>
                      <TableCell>
                        {isLive(a)
                          ? <Badge className="text-[10px]">Live</Badge>
                          : <Badge variant="outline" className="text-[10px]">{a.is_active ? "Not yet showing" : "Taken down"}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRemoving(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Announcement history</CardTitle>
          <CardDescription>One-off messages already sent</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Send your first announcement to parents or staff."
              actionLabel="New announcement"
              onAction={() => setOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Title</TableHead>
                    <TableHead className="text-xs">Audience</TableHead>
                    <TableHead className="text-xs">Channels</TableHead>
                    <TableHead className="text-xs">Sent</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="max-w-[300px] truncate text-xs text-muted-foreground">{a.body}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{audienceLabel(a.audience)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(a.channels || []).map((ch: string) => (
                            <Badge key={ch} variant="outline" className="text-[10px]">{ch}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {a.sent_at ? format(new Date(a.sent_at), "d MMM yyyy, HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRemoving(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit announcement</DialogTitle>
            <DialogDescription>Every change is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea rows={4} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>How long should it run?</Label>
              <Select value={editMode} onValueChange={(v) => setEditMode(v as DisplayMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.filter((m) => m.value !== "one_off").map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                  <SelectItem value="one_off">Keep as a one-off record</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editMode !== "one_off" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Show from</Label>
                  <Input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                </div>
                {editMode === "scheduled" && (
                  <div className="space-y-2">
                    <Label>Show until</Label>
                    <Input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Showing on the noticeboard</p>
                <p className="text-xs text-muted-foreground">Switch off to take it down without deleting it.</p>
              </div>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={savingEdit} className="gap-1.5">
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              “{removing?.title}” will be taken off the noticeboard permanently. Alerts already
              delivered stay in people's notification lists. This is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
