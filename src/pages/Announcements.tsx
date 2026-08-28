import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendAnnouncementNotifications } from "@/lib/notification-dispatcher";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Announcements() {
  const { orgId, schoolId, user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [targetClassId, setTargetClassId] = useState("");
  const [channelInApp, setChannelInApp] = useState(true);
  const [channelEmail, setChannelEmail] = useState(false);
  const [channelSms, setChannelSms] = useState(false);

  const { data: classes } = useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await supabase.from("classes").select("id, name").eq("school_id", schoolId).order("level_order");
      return data || [];
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
      return data || [];
    },
    enabled: !!orgId,
  });

  const handleSend = async () => {
    if (!orgId || !schoolId || !title.trim() || !body.trim()) {
      toast.error("Please fill in title and body");
      return;
    }
    setSending(true);

    const channels: string[] = [];
    if (channelInApp) channels.push("in_app");
    if (channelEmail) channels.push("email");
    if (channelSms) channels.push("sms");

    // Save announcement
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
        sent_at: new Date().toISOString(),
        sent_by: user?.id,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Failed to save announcement");
      setSending(false);
      return;
    }

    // Dispatch notifications
    const result = await sendAnnouncementNotifications({
      orgId,
      schoolId,
      announcementId: announcement.id,
      title: title.trim(),
      body: body.trim(),
      audience,
      targetClassId: audience === "class" ? targetClassId : undefined,
      channels,
    });

    setSending(false);
    setOpen(false);
    setTitle("");
    setBody("");
    setAudience("all");
    setTargetClassId("");
    setChannelEmail(false);
    setChannelSms(false);
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
    toast.success(`Announcement sent to ${result.sent} recipient(s)`);
  };

  const audienceLabel = (a: string) => {
    switch (a) {
      case "all": return "Everyone";
      case "parents": return "Parents";
      case "staff": return "Staff";
      case "class": return "Class";
      default: return a;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" description="Send notifications to parents, staff, or the entire school.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Send Announcement</DialogTitle>
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
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={channelInApp} onCheckedChange={(v) => setChannelInApp(!!v)} />
                    In-App
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={channelEmail} onCheckedChange={(v) => setChannelEmail(!!v)} />
                    Email
                    <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={channelSms} onCheckedChange={(v) => setChannelSms(!!v)} />
                    SMS
                    <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
                  </label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} className="gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Sending…" : "Send Now"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Announcement History</CardTitle>
          <CardDescription>Previously sent announcements</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Send your first announcement to parents or staff."
              actionLabel="New announcement"
              onAction={() => setOpen(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Title</TableHead>
                  <TableHead className="text-xs">Audience</TableHead>
                  <TableHead className="text-xs">Channels</TableHead>
                  <TableHead className="text-xs">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[300px]">{a.body}</p>
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
                    <TableCell className="text-xs text-muted-foreground">
                      {a.sent_at ? format(new Date(a.sent_at), "MMM d, yyyy HH:mm") : "—"}
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
