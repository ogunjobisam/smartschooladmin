import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  orgId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
}

/**
 * Write an audit row from the client. Failures are logged, never surfaced: a
 * missing audit line must not make a successful action look broken to the user.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    org_id: entry.orgId,
    user_id: entry.userId ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    detail: entry.detail ?? null,
    old_values: (entry.oldValues ?? null) as never,
    new_values: (entry.newValues ?? null) as never,
  });
  if (error) console.error("audit log failed", error);
}
