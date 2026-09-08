import { supabase } from "@/integrations/supabase/client";
import { createBulkNotifications, type NotificationType } from "./notifications";

/**
 * Alerts that reach families and staff by email, not just inside the app.
 *
 * Everything here writes to the same outbox the delivery page shows, so a queued
 * row means "will be sent by the mailer" — nothing is faked as sent. A recipient
 * who turned email off in their own notification settings is skipped; someone
 * with no login at all still gets the email, because the school holds their
 * address on record.
 */

export interface FamilyContact {
  studentId: string;
  studentName: string;
  userId: string | null;
  email: string | null;
  name: string;
}

type QueueRow = {
  org_id: string;
  school_id: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  entity_type?: string | null;
  entity_id?: string | null;
};

/** Guardians (and the pupils themselves, where they have a login) per student. */
export async function familyContactsFor(studentIds: string[]): Promise<FamilyContact[]> {
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
    .from("student_guardians")
    .select(
      "student_id, students!inner(first_name, last_name), guardians(user_id, email, first_name, last_name)",
    )
    .in("student_id", studentIds);

  if (error) {
    console.error("Could not load guardian contacts:", error);
    return [];
  }

  const contacts: FamilyContact[] = [];
  for (const link of data || []) {
    const g = link.guardians;
    const s = link.students;
    if (!g || !s) continue;
    contacts.push({
      studentId: link.student_id,
      studentName: `${s.first_name} ${s.last_name}`,
      userId: g.user_id,
      email: g.email,
      name: `${g.first_name} ${g.last_name}`,
    });
  }
  return contacts;
}

/** User ids that have switched this kind of email off. */
async function emailOptOuts(userIds: string[], type: string): Promise<Set<string>> {
  const off = new Set<string>();
  if (userIds.length === 0) return off;

  const [{ data: prefs }, { data: settings }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("user_id, channel_email")
      .eq("notification_type", type)
      .in("user_id", userIds),
    supabase.from("notification_settings").select("user_id, email_frequency").in("user_id", userIds),
  ]);

  for (const p of prefs || []) if (p.channel_email === false) off.add(p.user_id);
  for (const s of settings || []) if (s.email_frequency === "off") off.add(s.user_id);
  return off;
}

async function queueEmails(rows: QueueRow[]) {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("outbound_message_queue").insert(rows);
  if (error) {
    console.error("Could not queue alert emails:", error);
    return 0;
  }
  return rows.length;
}

/** Nudge the mailer so queued alerts go out now rather than on the next sweep. */
async function drainSoon() {
  try {
    await supabase.functions.invoke("process-message-queue", { body: {} });
  } catch (error) {
    // The queue is drained on a schedule too, so a failed nudge is not fatal.
    console.warn("Could not trigger the mailer:", error);
  }
}

interface AlertOptions {
  orgId: string;
  schoolId: string;
  type: NotificationType;
  subject: string;
  entityType?: string;
  entityId?: string;
  /** One message per contact — return null to skip that contact. */
  bodyFor: (contact: FamilyContact) => string | null;
  /** Extra in-app recipients with no email (e.g. the pupil's own login). */
  extraInApp?: { userId: string; title: string; message: string }[];
  contacts: FamilyContact[];
}

async function dispatchFamilyAlert(options: AlertOptions) {
  const userIds = [...new Set(options.contacts.map((c) => c.userId).filter((id): id is string => !!id))];
  const optedOut = await emailOptOuts(userIds, options.type);

  const rows: QueueRow[] = [];
  const inApp: Parameters<typeof createBulkNotifications>[0] = [];
  const seen = new Set<string>();

  for (const contact of options.contacts) {
    const body = options.bodyFor(contact);
    if (!body) continue;

    if (contact.userId) {
      inApp.push({
        orgId: options.orgId,
        schoolId: options.schoolId,
        userId: contact.userId,
        type: options.type,
        title: options.subject,
        message: body,
        entityType: options.entityType,
        entityId: options.entityId,
      });
    }

    if (!contact.email) continue;
    if (contact.userId && optedOut.has(contact.userId)) continue;

    const key = `${contact.email.toLowerCase()}|${body}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      org_id: options.orgId,
      school_id: options.schoolId,
      channel: "email",
      recipient: contact.email,
      subject: options.subject,
      body,
      status: "queued",
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
    });
  }

  for (const extra of options.extraInApp || []) {
    inApp.push({
      orgId: options.orgId,
      schoolId: options.schoolId,
      userId: extra.userId,
      type: options.type,
      title: extra.title,
      message: extra.message,
      entityType: options.entityType,
      entityId: options.entityId,
    });
  }

  if (inApp.length > 0) await createBulkNotifications(inApp);
  const queued = await queueEmails(rows);
  if (queued > 0) await drainSoon();

  return { queued, notified: inApp.length };
}

/**
 * Absence and lateness: a parent hears the same day, which is the whole point of
 * marking a register in the morning.
 */
export async function sendAbsenceAlerts(params: {
  orgId: string;
  schoolId: string;
  className: string;
  dateLabel: string;
  students: { id: string; status: string }[];
}) {
  const flagged = params.students.filter((s) => s.status === "absent" || s.status === "late");
  if (flagged.length === 0) return { queued: 0, notified: 0 };

  const statusBy = new Map(flagged.map((s) => [s.id, s.status]));
  const contacts = await familyContactsFor(flagged.map((s) => s.id));

  return dispatchFamilyAlert({
    orgId: params.orgId,
    schoolId: params.schoolId,
    type: "attendance_alert" as NotificationType,
    subject: `Attendance update — ${params.dateLabel}`,
    entityType: "attendance",
    contacts,
    bodyFor: (contact) => {
      const status = statusBy.get(contact.studentId);
      if (!status) return null;
      const wording =
        status === "absent"
          ? `was marked absent from ${params.className}`
          : `arrived late to ${params.className}`;
      return (
        `Dear ${contact.name},\n\n${contact.studentName} ${wording} on ${params.dateLabel}.\n\n` +
        `If this is unexpected, please contact the school office so we can update our records.\n\n` +
        `You can see the full attendance history any time by signing in to the parent portal.`
      );
    },
  });
}

/** Results are out: parents and pupils are told, and can open their report card. */
export async function sendResultsPublishedAlerts(params: {
  orgId: string;
  schoolId: string;
  examId: string;
  examName: string;
  className: string;
  termName?: string | null;
  students: { id: string; userId: string | null }[];
}) {
  if (params.students.length === 0) return { queued: 0, notified: 0 };

  const contacts = await familyContactsFor(params.students.map((s) => s.id));
  const term = params.termName ? ` (${params.termName})` : "";
  const subject = `${params.examName} results are now available`;

  return dispatchFamilyAlert({
    orgId: params.orgId,
    schoolId: params.schoolId,
    type: "results_published" as NotificationType,
    subject,
    entityType: "exam",
    entityId: params.examId,
    contacts,
    bodyFor: (contact) =>
      `Dear ${contact.name},\n\n${contact.studentName}'s results for ${params.examName}${term} in ${params.className} have been published.\n\n` +
      `Sign in to the parent portal to see each subject's score and to download the report card.`,
    extraInApp: params.students
      .filter((s) => !!s.userId)
      .map((s) => ({
        userId: s.userId!,
        title: subject,
        message: `Your results for ${params.examName}${term} are published. Open My Results to see each subject and download your report card.`,
      })),
  });
}

/** A payment landed: the family gets the receipt details straight away. */
export async function sendReceiptAlert(params: {
  orgId: string;
  schoolId: string;
  studentId: string;
  amountLabel: string;
  receiptNumber?: string | null;
  invoiceNumber?: string | null;
  paymentId?: string;
  balanceLabel?: string | null;
}) {
  const contacts = await familyContactsFor([params.studentId]);
  const subject = params.receiptNumber
    ? `Payment received — receipt ${params.receiptNumber}`
    : "Payment received";

  return dispatchFamilyAlert({
    orgId: params.orgId,
    schoolId: params.schoolId,
    type: "payment_confirmation" as NotificationType,
    subject,
    entityType: "payment",
    entityId: params.paymentId,
    contacts,
    bodyFor: (contact) =>
      `Dear ${contact.name},\n\nWe have received ${params.amountLabel} towards ${contact.studentName}'s fees` +
      (params.invoiceNumber ? ` for invoice ${params.invoiceNumber}` : "") +
      `.\n\n` +
      (params.receiptNumber ? `Receipt number: ${params.receiptNumber}\n` : "") +
      (params.balanceLabel ? `Remaining balance: ${params.balanceLabel}\n` : "") +
      `\nThank you. Your receipt is also available to download from the parent portal.`,
  });
}
