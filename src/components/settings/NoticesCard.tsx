import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { noticeState } from "@/lib/notices";

interface NoticesCardProps {
  schoolId: string | null;
  canManage: boolean;
}

const STATE_STYLES: Record<ReturnType<typeof noticeState>, string> = {
  live: "border-success/30 bg-success/10 text-success",
  draft: "border-border bg-muted text-muted-foreground",
  scheduled: "border-primary/30 bg-primary/10 text-primary",
  expired: "border-border bg-muted text-muted-foreground",
};

const STATE_LABELS: Record<ReturnType<typeof noticeState>, string> = {
  live: "Showing now",
  draft: "Draft",
  scheduled: "Starts later",
  expired: "Finished",
};

/**
 * Notices on the school's public page. Kept next to the application form
 * because they are the same thing to a school: what a stranger sees.
 */
export function NoticesCard({ schoolId, canManage }: NoticesCardProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const { data: notices = [], isLoading } = useQuery({
    queryKey: ["school-notices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_notices")
        .select("*")
        .eq("school_id", schoolId!)
        .order("display_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const reset = () => { setTitle(""); setBody(""); setStartsOn(""); setEndsOn(""); setAdding(false); };

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the notice a headline");
      if (startsOn && endsOn && endsOn < startsOn) {
        throw new Error("The end date is before the start date");
      }
      const { error } = await supabase.from("school_notices").insert({
        school_id: schoolId!,
        title: title.trim(),
        body: body.trim() || null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        display_order: notices.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice saved as a draft", { description: "Publish it when you are ready for it to show." });
      queryClient.invalidateQueries({ queryKey: ["school-notices"] });
      reset();
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not save the notice")),
  });

  const setPublished = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase.from("school_notices").update({ is_published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["school-notices"] }),
    onError: (err) => toast.error(getErrorMessage(err, "Could not update the notice")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_notices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice removed");
      queryClient.invalidateQueries({ queryKey: ["school-notices"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not remove the notice")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4" /> Notices
        </CardTitle>
        <CardDescription>
          Short standing statements — resumption dates, when admissions open, a PTA
          meeting. They show on your public page and to parents and students.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {notices.map((notice) => {
              const state = noticeState(notice);
              return (
                <li key={notice.id} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {notice.title}
                      <Badge variant="outline" className={`text-[10px] ${STATE_STYLES[state]}`}>
                        {STATE_LABELS[state]}
                      </Badge>
                    </p>
                    {notice.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{notice.body}</p>}
                    {(notice.starts_on || notice.ends_on) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notice.starts_on ? `From ${notice.starts_on}` : "From now"}
                        {notice.ends_on ? ` until ${notice.ends_on}` : ""}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={notice.is_published}
                        onCheckedChange={(checked) => setPublished.mutate({ id: notice.id, is_published: checked })}
                        aria-label="Published"
                      />
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(notice.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (adding ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="notice-title">Headline</Label>
              <Input id="notice-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Second term resumes 6 January" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notice-body">Detail <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="notice-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="notice-start">Show from</Label>
                <Input id="notice-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notice-end">Show until</Label>
                <Input id="notice-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} className="gap-1.5">
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save notice
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add a notice
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
