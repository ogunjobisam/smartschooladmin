import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertCircle, Clock, Loader2, Mail, RefreshCw, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";

const MANAGER_ROLES = ["super_admin", "proprietor", "group_admin", "school_admin", "principal"];

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-destructive/10 text-destructive",
};

/**
 * Delivery tracking for every email and SMS the app queues.
 *
 * Queued, sent and failed are the only states that matter operationally, so the
 * screen is built around them: filter, see the error, retry. Each retry is
 * written to the audit log, because "who resent this to a parent" is a question
 * schools do ask.
 */
export default function MessageDelivery() {
  const { orgId, schoolId, user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const canManage = MANAGER_ROLES.includes(userRole || "");

  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");
  const [search, setSearch] = useState("");

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["message-delivery", orgId, status, channel],
    queryFn: async () => {
      let query = supabase
        .from("outbound_message_queue")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") query = query.eq("status", status);
      if (channel !== "all") query = query.eq("channel", channel);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId && canManage,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter(
      (m) =>
        m.recipient.toLowerCase().includes(term) ||
        (m.subject || "").toLowerCase().includes(term),
    );
  }, [messages, search]);

  const counts = useMemo(() => {
    const tally = { queued: 0, sent: 0, failed: 0 };
    for (const m of messages) {
      if (m.status === "queued") tally.queued++;
      else if (m.status === "sent") tally.sent++;
      else if (m.status === "failed") tally.failed++;
    }
    return tally;
  }, [messages]);

  const logRetry = async (detail: string, ids: string[]) => {
    if (!orgId) return;
    const { error } = await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: user?.id ?? null,
      action: "message_retried",
      entity_type: "outbound_message",
      entity_id: ids.length === 1 ? ids[0] : null,
      detail,
      new_values: { message_ids: ids, status: "queued" },
    } as never);
    if (error) console.error("Could not write the retry to the audit log", error);
  };

  const retry = useMutation({
    mutationFn: async (row: (typeof messages)[number]) => {
      const { error } = await supabase
        .from("outbound_message_queue")
        .update({
          status: "queued",
          attempts: 0,
          processed_at: null,
          error_message: null,
          scheduled_for: null,
          retried_by: user?.id ?? null,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
      await logRetry(`Requeued ${row.channel} to ${row.recipient}`, [row.id]);
    },
    onSuccess: () => {
      toast.success("Message put back in the queue");
      queryClient.invalidateQueries({ queryKey: ["message-delivery"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not retry that message")),
  });

  const retryAllFailed = useMutation({
    mutationFn: async () => {
      const ids = messages.filter((m) => m.status === "failed").map((m) => m.id);
      if (ids.length === 0) throw new Error("Nothing has failed");
      const { error } = await supabase
        .from("outbound_message_queue")
        .update({
          status: "queued",
          attempts: 0,
          processed_at: null,
          error_message: null,
          retried_by: user?.id ?? null,
          last_attempt_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
      await logRetry(`Requeued ${ids.length} failed message${ids.length === 1 ? "" : "s"}`, ids);
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} message${count === 1 ? "" : "s"} requeued`);
      queryClient.invalidateQueries({ queryKey: ["message-delivery"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not requeue the failed messages")),
  });

  const drain = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-message-queue", {
        body: { school_id: schoolId },
      });
      if (error) throw error;
      return data as { sent?: number; failed?: number; deferred?: number };
    },
    onSuccess: (result) => {
      toast.success(
        `Queue processed — ${result?.sent ?? 0} sent, ${result?.failed ?? 0} failed, ${result?.deferred ?? 0} waiting`,
      );
      queryClient.invalidateQueries({ queryKey: ["message-delivery"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not process the queue")),
  });

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Email status" description="Email and SMS delivery for your school." />
        <EmptyState
          icon={AlertCircle}
          title="Not available for your role"
          description="Only school administrators can see message delivery."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email status"
        description="Every school alert queued by email or SMS — when it was queued, and whether it has been sent."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => retryAllFailed.mutate()}
            disabled={retryAllFailed.isPending || counts.failed === 0}
          >
            {retryAllFailed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Retry failed
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => drain.mutate()} disabled={drain.isPending}>
            {drain.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send queued now
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Queued", value: counts.queued, icon: Clock },
          { label: "Sent", value: counts.sent, icon: Send },
          { label: "Failed", value: counts.failed, icon: AlertCircle },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                </div>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search recipient or subject"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-64"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nothing to show"
              description="Messages appear here as soon as the school sends an announcement, reminder or event alert."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Queued at</TableHead>
                    <TableHead>Sent at</TableHead>
                    <TableHead className="hidden lg:table-cell">Scheduled</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5 text-sm">
                          {m.channel === "sms" ? <Smartphone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                          {m.recipient}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <p className="truncate text-sm">{m.subject || "—"}</p>
                        {m.error_message && (
                          <p className="truncate text-xs text-destructive" title={m.error_message}>
                            {m.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[m.status] ?? ""} variant="secondary">
                          {m.status}
                        </Badge>
                        {m.attempts > 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">×{m.attempts}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(parseISO(m.created_at), "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {m.status === "sent" && m.processed_at
                          ? format(parseISO(m.processed_at), "d MMM, HH:mm")
                          : m.status === "sent"
                            ? "Sent"
                            : "Not sent yet"}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                        {m.scheduled_for ? format(parseISO(m.scheduled_for), "d MMM, HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={retry.isPending || m.status === "sent"}
                          onClick={() => retry.mutate(m)}
                        >
                          <RefreshCw className="h-3 w-3" /> Retry
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
    </div>
  );
}
