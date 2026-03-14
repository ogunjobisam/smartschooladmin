import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Bell } from "lucide-react";

export default function NotificationHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications-history", user?.id, filter],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter === "unread") query = query.eq("is_read", false);
      if (filter !== "all" && filter !== "unread") query = query.eq("type", filter as any);

      const { data } = await query;
      return data || [];
    },
    enabled: !!user,
  });

  const handleClick = async (n: any) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      queryClient.invalidateQueries({ queryKey: ["notifications-history"] });
    }
    if (n.entity_type === "invoice" && n.entity_id) navigate(`/invoices/${n.entity_id}`);
    else if (n.entity_type === "payroll_run" && n.entity_id) navigate(`/payroll/${n.entity_id}`);
    else if (n.entity_type === "approval") navigate("/approvals");
    else if (n.entity_type === "payment") navigate("/payments");
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.id);
    queryClient.invalidateQueries({ queryKey: ["notifications-history"] });
  };

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="View your notification history.">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="invoice_generated">Invoices</SelectItem>
              <SelectItem value="payment_received">Payments</SelectItem>
              <SelectItem value="overdue_reminder">Overdue</SelectItem>
              <SelectItem value="payroll_pending">Payroll</SelectItem>
              <SelectItem value="approval_result">Approvals</SelectItem>
            </SelectContent>
          </Select>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </div>
      </PageHeader>

      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : notifications.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications" description="You're all caught up!" />
          ) : (
            <div className="divide-y">
              {notifications.map((n: any) => (
                <NotificationItem
                  key={n.id}
                  id={n.id}
                  type={n.type}
                  title={n.title}
                  message={n.message}
                  isRead={n.is_read}
                  createdAt={n.created_at}
                  onClick={() => handleClick(n)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
