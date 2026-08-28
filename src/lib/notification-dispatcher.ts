import { supabase } from "@/integrations/supabase/client";
import { createNotification, createBulkNotifications, type NotificationType } from "./notifications";

/**
 * Notification dispatcher backbone.
 * Sends in-app notifications immediately and queues SMS/email for future delivery.
 * When real SMS/email integrations are added, the queue processor will pick these up.
 */

interface DispatchParams {
  orgId: string;
  schoolId?: string;
  userId: string;
  type: NotificationType | "fee_reminder" | "payment_confirmation" | "school_announcement";
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channels?: ("in_app" | "email" | "sms")[];
}

export async function dispatchNotification(params: DispatchParams) {
  const channels = params.channels || ["in_app"];

  // Always send in-app notification
  if (channels.includes("in_app")) {
    await createNotification({
      orgId: params.orgId,
      schoolId: params.schoolId,
      userId: params.userId,
      type: params.type as NotificationType,
      title: params.title,
      message: params.message,
      entityType: params.entityType,
      entityId: params.entityId,
    });
  }

  // Queue email/SMS for future processing
  const queueItems: { channel: string; recipient: string; subject: string; body: string }[] = [];

  if (channels.includes("email") && params.recipientEmail) {
    queueItems.push({
      channel: "email",
      recipient: params.recipientEmail,
      subject: params.title,
      body: params.message || params.title,
    });
  }

  if (channels.includes("sms") && params.recipientPhone) {
    queueItems.push({
      channel: "sms",
      recipient: params.recipientPhone,
      subject: params.title,
      body: params.message || params.title,
    });
  }

  if (queueItems.length > 0) {
    const { error } = await supabase.from("outbound_message_queue").insert(
      queueItems.map((item) => ({
        org_id: params.orgId,
        // The processor puts this school's name on the From line and falls back
        // to its address for reply-to.
        school_id: params.schoolId ?? null,
        channel: item.channel,
        recipient: item.recipient,
        subject: item.subject,
        body: item.body,
        status: "queued",
      }))
    );
    if (error) console.error("Failed to queue outbound messages:", error);
  }
}

/**
 * Send fee reminder notifications to guardians of students with overdue invoices.
 */
export async function sendFeeReminders(orgId: string, schoolId: string) {
  // Get overdue invoices with student + guardian info
  const { data: overdueInvoices } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, total_amount, amount_paid, due_date,
      students!inner(id, first_name, last_name, student_guardians(guardian_id, guardians(id, first_name, last_name, email, phone, user_id)))
    `)
    .eq("school_id", schoolId)
    .in("status", ["pending", "overdue"]);

  if (!overdueInvoices?.length) return { sent: 0 };

  const notifications: Parameters<typeof createBulkNotifications>[0] = [];

  for (const inv of overdueInvoices) {
    const student = inv.students;
    const guardianLinks = student?.student_guardians || [];
    const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);

    for (const link of guardianLinks) {
      const guardian = link.guardians;
      if (!guardian?.user_id) continue;

      notifications.push({
        orgId,
        schoolId,
        userId: guardian.user_id,
        type: "fee_reminder" as NotificationType,
        title: `Fee reminder for ${student.first_name} ${student.last_name}`,
        message: `Invoice ${inv.invoice_number} has an outstanding balance. Please make payment at your earliest convenience.`,
        entityType: "invoice",
        entityId: inv.id,
      });
    }
  }

  if (notifications.length > 0) {
    await createBulkNotifications(notifications);
  }

  return { sent: notifications.length };
}

/**
 * Send payment confirmation notification after a payment is recorded.
 */
export async function sendPaymentConfirmation(params: {
  orgId: string;
  schoolId: string;
  studentId: string;
  amount: number;
  paymentId: string;
  invoiceNumber?: string;
}) {
  // Get student + guardians
  const { data: student } = await supabase
    .from("students")
    .select("first_name, last_name, student_guardians(guardian_id, guardians(user_id, email, phone))")
    .eq("id", params.studentId)
    .maybeSingle();

  if (!student) return;

  const guardianLinks = student.student_guardians || [];
  const formattedAmount = (params.amount / 100).toLocaleString();
  const title = `Payment confirmed for ${student.first_name} ${student.last_name}`;
  const message = params.invoiceNumber
    ? `Payment of ₦${formattedAmount} received for invoice ${params.invoiceNumber}.`
    : `Payment of ₦${formattedAmount} received. Thank you!`;

  for (const link of guardianLinks) {
    const guardian = link.guardians;
    if (!guardian?.user_id) continue;

    await dispatchNotification({
      orgId: params.orgId,
      schoolId: params.schoolId,
      userId: guardian.user_id,
      type: "payment_confirmation",
      title,
      message,
      entityType: "payment",
      entityId: params.paymentId,
      recipientEmail: guardian.email,
      recipientPhone: guardian.phone,
      channels: ["in_app"],
    });
  }
}

/**
 * Send school announcement to the target audience.
 */
export async function sendAnnouncementNotifications(params: {
  orgId: string;
  schoolId: string;
  announcementId: string;
  title: string;
  body: string;
  audience: string;
  targetClassId?: string;
  channels: string[];
}) {
  let userIds: string[] = [];
  // Collected alongside the ids so the announcement can also be emailed. The
  // `channels` argument used to be accepted and ignored, which made the email
  // and SMS checkboxes on the announcement dialog silently do nothing.
  const emails: string[] = [];

  if (params.audience === "parents" || params.audience === "all") {
    // Get all guardians with user_ids
    const { data: guardians } = await supabase
      .from("guardians")
      .select("user_id, email")
      .eq("org_id", params.orgId)
      .not("user_id", "is", null);
    if (guardians) {
      userIds.push(...guardians.map((g) => g.user_id!));
      emails.push(...guardians.map((g) => g.email).filter((e): e is string => !!e));
    }
  }

  if (params.audience === "staff" || params.audience === "all") {
    const { data: staffMembers } = await supabase
      .from("staff")
      .select("user_id, email")
      .eq("school_id", params.schoolId)
      .not("user_id", "is", null);
    if (staffMembers) {
      userIds.push(...staffMembers.map((s) => s.user_id!));
      emails.push(...staffMembers.map((s) => s.email).filter((e): e is string => !!e));
    }
  }

  if (params.audience === "class" && params.targetClassId) {
    // Get students in class → their guardians
    const { data: enrolments } = await supabase
      .from("enrolments")
      .select("students(student_guardians(guardians(user_id, email)))")
      .eq("class_id", params.targetClassId);
    if (enrolments) {
      for (const e of enrolments) {
        const student = e.students;
        const links = student?.student_guardians || [];
        for (const link of links) {
          if (link.guardians?.user_id) userIds.push(link.guardians.user_id);
          if (link.guardians?.email) emails.push(link.guardians.email);
        }
      }
    }
  }

  // Deduplicate
  userIds = [...new Set(userIds)];

  if (userIds.length === 0) return { sent: 0 };

  const notifications = userIds.map((uid) => ({
    orgId: params.orgId,
    schoolId: params.schoolId,
    userId: uid,
    type: "school_announcement" as NotificationType,
    title: params.title,
    message: params.body,
    entityType: "announcement",
    entityId: params.announcementId,
  }));

  await createBulkNotifications(notifications);

  // Queue the email copies. They wait in the outbox until someone drains it
  // from Settings → Notifications, so `queued` here means "will go out", not
  // "has gone out" — the caller reports it as such.
  let queuedEmails = 0;
  if (params.channels.includes("email")) {
    const recipients = [...new Set(emails)];
    if (recipients.length > 0) {
      const { error } = await supabase.from("outbound_message_queue").insert(
        recipients.map((recipient) => ({
          org_id: params.orgId,
          school_id: params.schoolId,
          channel: "email",
          recipient,
          subject: params.title,
          body: params.body || params.title,
          status: "queued",
        }))
      );
      if (error) console.error("Failed to queue announcement emails:", error);
      else queuedEmails = recipients.length;
    }
  }

  return { sent: userIds.length, queuedEmails };
}

/**
 * Tell the audience about a newly created calendar event.
 *
 * In-app alerts go to everyone in the audience who has a login. Email and SMS
 * copies are queued only for the contacts that actually have an address or a
 * number on file — a parent with neither still gets the in-app entry and sees
 * the event on their dashboard.
 */
export async function sendEventNotifications(params: {
  orgId: string;
  schoolId: string;
  eventId: string;
  title: string;
  when: string;
  location?: string | null;
  description?: string | null;
  audience: string;
  channels: ("in_app" | "email" | "sms")[];
}) {
  const userIds: string[] = [];
  const emails: string[] = [];
  const phones: string[] = [];

  const wantsStaff = params.audience === "staff" || params.audience === "all";
  const wantsParents = params.audience === "parents" || params.audience === "all";
  const wantsStudents = params.audience === "students" || params.audience === "all";

  if (wantsStaff) {
    const { data } = await supabase
      .from("staff")
      .select("user_id, email, phone")
      .eq("school_id", params.schoolId)
      .eq("employment_status", "active");
    for (const s of data || []) {
      if (s.user_id) userIds.push(s.user_id);
      if (s.email) emails.push(s.email);
      if (s.phone) phones.push(s.phone);
    }
  }

  if (wantsParents) {
    const { data } = await supabase
      .from("guardians")
      .select("user_id, email, phone")
      .eq("org_id", params.orgId);
    for (const g of data || []) {
      if (g.user_id) userIds.push(g.user_id);
      if (g.email) emails.push(g.email);
      if (g.phone) phones.push(g.phone);
    }
  }

  if (wantsStudents) {
    const { data } = await supabase
      .from("students")
      .select("user_id")
      .eq("school_id", params.schoolId)
      .eq("status", "active")
      .not("user_id", "is", null);
    for (const s of data || []) if (s.user_id) userIds.push(s.user_id);
  }

  const body = [
    params.when,
    params.location ? `Venue: ${params.location}` : null,
    params.description || null,
  ]
    .filter(Boolean)
    .join("\n");

  const recipients = [...new Set(userIds)];
  if (recipients.length > 0) {
    await createBulkNotifications(
      recipients.map((uid) => ({
        orgId: params.orgId,
        schoolId: params.schoolId,
        userId: uid,
        // The notification enum has no dedicated event value, so events ride
        // on the announcement type and are told apart by entity_type.
        type: "school_announcement" as NotificationType,
        title: `New event: ${params.title}`,
        message: body,
        entityType: "event",
        entityId: params.eventId,
      }))
    );
  }

  const queue: { channel: string; recipient: string }[] = [];
  if (params.channels.includes("email")) {
    for (const recipient of [...new Set(emails)]) queue.push({ channel: "email", recipient });
  }
  if (params.channels.includes("sms")) {
    for (const recipient of [...new Set(phones)]) queue.push({ channel: "sms", recipient });
  }

  let queued = 0;
  if (queue.length > 0) {
    const { error } = await supabase.from("outbound_message_queue").insert(
      queue.map((item) => ({
        org_id: params.orgId,
        school_id: params.schoolId,
        channel: item.channel,
        recipient: item.recipient,
        subject: `New event: ${params.title}`,
        body: `${params.title}\n${body}`,
        status: "queued",
      }))
    );
    if (error) console.error("Failed to queue event messages:", error);
    else queued = queue.length;
  }

  return { sent: recipients.length, queued };
}
