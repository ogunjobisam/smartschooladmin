import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

export type NotificationType =
  | "invoice_generated"
  | "payment_received"
  | "overdue_reminder"
  | "guardian_invite"
  | "staff_invite"
  | "payroll_pending"
  | "approval_result"
  | "recognition_published";

interface CreateNotificationParams {
  orgId: string;
  schoolId?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  const { error } = await supabase.from("notifications").insert({
    org_id: params.orgId,
    school_id: params.schoolId || null,
    user_id: params.userId,
    type: params.type as Enums<"notification_type">,
    title: params.title,
    message: params.message || "",
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
  });
  if (error) console.error("Failed to create notification:", error);
  return { error };
}

export async function createBulkNotifications(
  notifications: CreateNotificationParams[]
) {
  if (notifications.length === 0) return;
  const rows = notifications.map((n) => ({
    org_id: n.orgId,
    school_id: n.schoolId || null,
    user_id: n.userId,
    type: n.type as Enums<"notification_type">,
    title: n.title,
    message: n.message || "",
    entity_type: n.entityType || null,
    entity_id: n.entityId || null,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("Failed to create bulk notifications:", error);
  return { error };
}

export async function markNotificationRead(id: string) {
  return supabase.from("notifications").update({ is_read: true }).eq("id", id);
}

export async function markAllNotificationsRead(userId: string) {
  return supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
}
