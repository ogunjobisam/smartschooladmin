import { supabase } from "@/integrations/supabase/client";
import { dispatchNotification } from "./notification-dispatcher";

/**
 * Update emails for the people who run the school.
 *
 * A head teacher should not have to sign in to find out that a register was
 * marked, results were entered, or a payment landed. Each change queues an
 * email (and an in-app alert) for every school admin, principal and owner
 * attached to that school.
 *
 * The contacts come from a security-definer lookup because a class teacher
 * cannot read other people's role rows directly — see school_admin_contacts().
 */
export type SchoolUpdateArea = "attendance" | "exam_results" | "fees";

const AREA_TITLES: Record<SchoolUpdateArea, string> = {
  attendance: "Attendance updated",
  exam_results: "Exam results updated",
  fees: "Fees updated",
};

interface Params {
  orgId: string;
  schoolId: string;
  area: SchoolUpdateArea;
  /** One line describing exactly what changed, used as the email body. */
  summary: string;
  /** Where in the app the change happened, e.g. "/attendance". */
  link?: string;
  entityType?: string;
  entityId?: string;
  /** Do not email the person who made the change. */
  excludeUserId?: string | null;
}

export async function notifySchoolAdmins({
  orgId,
  schoolId,
  area,
  summary,
  link,
  entityType,
  entityId,
  excludeUserId,
}: Params): Promise<{ notified: number }> {
  if (!orgId || !schoolId) return { notified: 0 };

  const { data, error } = await supabase.rpc("school_admin_contacts", { _school_id: schoolId });
  if (error) {
    console.error("Could not load school admin contacts:", error);
    return { notified: 0 };
  }

  const contacts = (data || []).filter((c) => c.user_id && c.user_id !== excludeUserId);
  if (contacts.length === 0) return { notified: 0 };

  const title = AREA_TITLES[area];
  const message = link ? `${summary} View it at ${link} when you next sign in.` : summary;

  await Promise.all(
    contacts.map((contact) =>
      dispatchNotification({
        orgId,
        schoolId,
        userId: contact.user_id as string,
        type: "school_announcement",
        title,
        message,
        entityType,
        entityId,
        recipientEmail: contact.email ?? undefined,
        channels: contact.email ? ["in_app", "email"] : ["in_app"],
      }).catch((err) => console.error("Failed to notify school admin:", err))
    )
  );

  return { notified: contacts.length };
}
