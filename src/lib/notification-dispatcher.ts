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
  const formattedAmount = params.amount.toLocaleString();
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
      recipientEmail: guardian.email ?? undefined,
      recipientPhone: guardian.phone ?? undefined,
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
/**
 * Who wants to hear about events, and how.
 *
 * Every recipient's saved preferences decide the channels: an opted-out person
 * gets nothing, and someone who ticked email but has no address on file simply
 * has nothing to queue. Reminder timing comes from the same settings, so the
 * copy that lands before the event respects each person's lead time.
 */
async function eventAudienceContacts(orgId: string, schoolId: string, audience: string) {
  const contacts: { userId: string | null; email: string | null; phone: string | null }[] = [];

  const wantsStaff = audience === "staff" || audience === "all";
  const wantsParents = audience === "parents" || audience === "all";
  const wantsStudents = audience === "students" || audience === "all";

  if (wantsStaff) {
    const { data } = await supabase
      .from("staff")
      .select("user_id, email, phone")
      .eq("school_id", schoolId)
      .eq("employment_status", "active");
    for (const s of data || []) contacts.push({ userId: s.user_id, email: s.email, phone: s.phone });
  }

  if (wantsParents) {
    const { data } = await supabase
      .from("guardians")
      .select("user_id, email, phone")
      .eq("org_id", orgId);
    for (const g of data || []) contacts.push({ userId: g.user_id, email: g.email, phone: g.phone });
  }

  if (wantsStudents) {
    const { data } = await supabase
      .from("students")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .not("user_id", "is", null);
    for (const s of data || []) contacts.push({ userId: s.user_id, email: null, phone: null });
  }

  return contacts;
}

interface EventChannelChoice {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  remind: boolean;
  leadMinutes: number;
}

const DEFAULT_CHOICE: EventChannelChoice = {
  inApp: true,
  email: true,
  sms: false,
  remind: true,
  leadMinutes: 1440,
};

/** Saved per-recipient preferences for event messages, keyed by user id. */
async function eventChannelChoices(userIds: string[]): Promise<Map<string, EventChannelChoice>> {
  const choices = new Map<string, EventChannelChoice>();
  if (userIds.length === 0) return choices;

  const [{ data: prefs }, { data: settings }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("user_id, channel_in_app, channel_email, channel_sms")
      .eq("notification_type", "school_event")
      .in("user_id", userIds),
    supabase
      .from("notification_settings")
      .select("user_id, email_frequency, sms_frequency, in_app_frequency, event_reminders_enabled, event_reminder_lead_minutes")
      .in("user_id", userIds),
  ]);

  const prefBy = new Map((prefs || []).map((p) => [p.user_id, p]));
  const setBy = new Map((settings || []).map((s) => [s.user_id, s]));

  for (const userId of userIds) {
    const pref = prefBy.get(userId);
    const setting = setBy.get(userId);
    choices.set(userId, {
      inApp: (pref?.channel_in_app ?? DEFAULT_CHOICE.inApp) && setting?.in_app_frequency !== "off",
      email: (pref?.channel_email ?? DEFAULT_CHOICE.email) && setting?.email_frequency !== "off",
      sms: (pref?.channel_sms ?? DEFAULT_CHOICE.sms) && setting?.sms_frequency !== "off",
      remind: setting?.event_reminders_enabled ?? DEFAULT_CHOICE.remind,
      leadMinutes: setting?.event_reminder_lead_minutes ?? DEFAULT_CHOICE.leadMinutes,
    });
  }

  return choices;
}

export async function sendEventNotifications(params: {
  orgId: string;
  schoolId: string;
  eventId: string;
  title: string;
  when: string;
  location?: string | null;
  description?: string | null;
  startsAt?: string;
  audience: string;
  channels: ("in_app" | "email" | "sms")[];
}) {
  const contacts = await eventAudienceContacts(params.orgId, params.schoolId, params.audience);
  const userIds = [...new Set(contacts.map((c) => c.userId).filter((id): id is string => !!id))];
  const choices = await eventChannelChoices(userIds);

  const body = [
    params.when,
    params.location ? `Venue: ${params.location}` : null,
    params.description || null,
  ]
    .filter(Boolean)
    .join("\n");

  const subject = `New event: ${params.title}`;
  const allowEmail = params.channels.includes("email");
  const allowSms = params.channels.includes("sms");

  // In-app alerts, for everyone who has not turned them off.
  const inAppUsers = userIds.filter((id) => choices.get(id)?.inApp !== false);
  if (inAppUsers.length > 0) {
    await createBulkNotifications(
      inAppUsers.map((uid) => ({
        orgId: params.orgId,
        schoolId: params.schoolId,
        userId: uid,
        type: "school_event" as NotificationType,
        title: subject,
        message: body,
        entityType: "event",
        entityId: params.eventId,
      })),
    );
  }

  // Email and SMS: one row per contact per channel, deduplicated by address.
  const rows: {
    channel: string;
    recipient: string;
    subject: string;
    body: string;
    scheduled_for: string | null;
  }[] = [];
  const seen = new Set<string>();
  const eventStart = params.startsAt ? new Date(params.startsAt) : null;

  const push = (channel: string, recipient: string, scheduledFor: string | null, text: string) => {
    const key = `${channel}:${recipient}:${scheduledFor ?? "now"}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ channel, recipient, subject, body: text, scheduled_for: scheduledFor });
  };

  for (const contact of contacts) {
    const choice = (contact.userId && choices.get(contact.userId)) || DEFAULT_CHOICE;

    if (allowEmail && choice.email && contact.email) {
      push("email", contact.email, null, `${params.title}\n${body}`);
    }
    if (allowSms && choice.sms && contact.phone) {
      push("sms", contact.phone, null, `${params.title} — ${params.when}`);
    }

    // "Remind me": a second copy timed to the recipient's own lead time.
    if (choice.remind && eventStart) {
      const remindAt = new Date(eventStart.getTime() - choice.leadMinutes * 60 * 1000);
      if (remindAt.getTime() > Date.now()) {
        const reminderText = `Reminder: ${params.title}\n${body}`;
        if (allowEmail && choice.email && contact.email) {
          push("email", contact.email, remindAt.toISOString(), reminderText);
        }
        if (allowSms && choice.sms && contact.phone) {
          push("sms", contact.phone, remindAt.toISOString(), `Reminder: ${params.title} — ${params.when}`);
        }
      }
    }
  }

  let queued = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from("outbound_message_queue").insert(
      rows.map((row) => ({
        org_id: params.orgId,
        school_id: params.schoolId,
        channel: row.channel,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        status: "queued",
        entity_type: "event",
        entity_id: params.eventId,
        scheduled_for: row.scheduled_for,
      })),
    );
    if (error) console.error("Failed to queue event messages:", error);
    else queued = rows.length;
  }

  return { sent: inAppUsers.length, queued };
}

/**
 * A published award is news the family wants to hear. Notifies the recipient in
 * the app, and queues email/SMS for the recipient and — for a student — their
 * guardians, using whatever contact details the school holds.
 */
export async function sendRecognitionNotifications(params: {
  orgId: string;
  schoolId: string;
  recognitionId: string;
  subjectType: "student" | "staff";
  studentId: string | null;
  staffId: string | null;
  recipientName: string;
  title: string;
  citation?: string | null;
  awardDate?: string | null;
}) {
  const when = params.awardDate ? new Date(params.awardDate).toLocaleDateString() : null;
  const subject = `Award published: ${params.title}`;
  const bodyFor = (name: string) =>
    [`${name} has been awarded the ${params.title}.`, params.citation || null, when ? `Award date: ${when}` : null]
      .filter(Boolean)
      .join("\n");

  const inAppUsers: string[] = [];
  const contacts: { email: string | null; phone: string | null; name: string }[] = [];

  if (params.subjectType === "student" && params.studentId) {
    const [{ data: student }, { data: links }] = await Promise.all([
      supabase.from("students").select("user_id, first_name, last_name").eq("id", params.studentId).maybeSingle(),
      supabase
        .from("student_guardians")
        .select("guardians(user_id, email, phone, first_name, last_name)")
        .eq("student_id", params.studentId),
    ]);

    if (student?.user_id) inAppUsers.push(student.user_id);

    for (const link of links || []) {
      const g = link.guardians as
        | { user_id: string | null; email: string | null; phone: string | null; first_name: string; last_name: string }
        | null;
      if (!g) continue;
      if (g.user_id) inAppUsers.push(g.user_id);
      contacts.push({ email: g.email, phone: g.phone, name: `${g.first_name} ${g.last_name}` });
    }
  }

  if (params.subjectType === "staff" && params.staffId) {
    const { data: staff } = await supabase
      .from("staff")
      .select("user_id, email, phone")
      .eq("id", params.staffId)
      .maybeSingle();
    if (staff?.user_id) inAppUsers.push(staff.user_id);
    if (staff?.email || staff?.phone) {
      contacts.push({ email: staff.email ?? null, phone: staff.phone ?? null, name: params.recipientName });
    }
  }

  const uniqueUsers = [...new Set(inAppUsers)];
  if (uniqueUsers.length > 0) {
    await createBulkNotifications(
      uniqueUsers.map((userId) => ({
        orgId: params.orgId,
        schoolId: params.schoolId,
        userId,
        type: "recognition_published" as NotificationType,
        title: subject,
        message: bodyFor(params.recipientName),
        entityType: "recognition",
        entityId: params.recognitionId,
      })),
    );
  }

  const rows: { channel: string; recipient: string; subject: string; body: string }[] = [];
  const seen = new Set<string>();
  for (const contact of contacts) {
    const text = bodyFor(params.recipientName);
    if (contact.email && !seen.has(`email:${contact.email}`)) {
      seen.add(`email:${contact.email}`);
      rows.push({ channel: "email", recipient: contact.email, subject, body: text });
    }
    if (contact.phone && !seen.has(`sms:${contact.phone}`)) {
      seen.add(`sms:${contact.phone}`);
      rows.push({ channel: "sms", recipient: contact.phone, subject, body: `${params.recipientName}: ${params.title}` });
    }
  }

  let queued = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from("outbound_message_queue").insert(
      rows.map((row) => ({
        org_id: params.orgId,
        school_id: params.schoolId,
        channel: row.channel,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        status: "queued",
        entity_type: "recognition",
        entity_id: params.recognitionId,
      })),
    );
    if (error) console.error("Failed to queue recognition messages:", error);
    else queued = rows.length;
  }

  return { sent: uniqueUsers.length, queued };
}

/* ------------------------------------------------------------------ *
 * Scheduled invoice reminders
 * ------------------------------------------------------------------ */

interface DeliverySetting {
  in_app_frequency: string;
  email_frequency: string;
  sms_frequency: string;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
}

const DEFAULT_DELIVERY: DeliverySetting = {
  in_app_frequency: "immediate",
  email_frequency: "immediate",
  sms_frequency: "immediate",
  quiet_hours_enabled: false,
  quiet_start: "21:00",
  quiet_end: "07:00",
};

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

function atTime(base: Date, time: string, addDays = 0): Date {
  const d = new Date(base);
  const [h, m] = time.split(":").map((n) => Number(n) || 0);
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * When may we send this person a message?
 *
 * `null` means "now". A digest frequency defers to the next morning or the start
 * of next week, and quiet hours push a send past the end of the quiet window, so
 * nobody's phone buzzes at 3am because a due date rolled over.
 */
export function nextSendTime(setting: DeliverySetting, channel: "email" | "sms", now = new Date()): string | null | false {
  const frequency = channel === "email" ? setting.email_frequency : setting.sms_frequency;
  if (frequency === "off") return false;

  let candidate: Date | null = null;
  if (frequency === "daily") candidate = atTime(now, "08:00", now.getHours() >= 8 ? 1 : 0);
  if (frequency === "weekly") {
    const daysToMonday = (8 - now.getDay()) % 7 || 7;
    candidate = atTime(now, "08:00", daysToMonday);
  }

  if (setting.quiet_hours_enabled) {
    const check = candidate ?? now;
    const mins = check.getHours() * 60 + check.getMinutes();
    const start = minutesOfDay(setting.quiet_start);
    const end = minutesOfDay(setting.quiet_end);
    const inQuiet = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
    if (inQuiet) {
      // The quiet window that wraps midnight ends the following morning.
      const wraps = start > end;
      const sameDayEnd = mins < end;
      candidate = atTime(check, setting.quiet_end, wraps && !sameDayEnd ? 1 : 0);
    }
  }

  return candidate ? candidate.toISOString() : null;
}

async function deliverySettings(userIds: string[]): Promise<Map<string, DeliverySetting>> {
  const map = new Map<string, DeliverySetting>();
  if (userIds.length === 0) return map;
  const { data } = await supabase
    .from("notification_settings")
    .select("user_id, in_app_frequency, email_frequency, sms_frequency, quiet_hours_enabled, quiet_start, quiet_end")
    .in("user_id", userIds);
  for (const row of data || []) {
    map.set(row.user_id, {
      in_app_frequency: row.in_app_frequency,
      email_frequency: row.email_frequency,
      sms_frequency: row.sms_frequency,
      quiet_hours_enabled: row.quiet_hours_enabled,
      quiet_start: row.quiet_start,
      quiet_end: row.quiet_end,
    });
  }
  return map;
}

async function channelPreferences(
  userIds: string[],
  type: "fee_reminder" | "overdue_reminder",
): Promise<Map<string, { inApp: boolean; email: boolean; sms: boolean }>> {
  const map = new Map<string, { inApp: boolean; email: boolean; sms: boolean }>();
  if (userIds.length === 0) return map;
  const { data } = await supabase
    .from("notification_preferences")
    .select("user_id, channel_in_app, channel_email, channel_sms")
    .eq("notification_type", type)
    .in("user_id", userIds);
  for (const row of data || []) {
    map.set(row.user_id, {
      inApp: row.channel_in_app,
      email: row.channel_email,
      sms: row.channel_sms,
    });
  }
  return map;
}

export interface InvoiceReminderOptions {
  orgId: string;
  schoolId: string;
  /** Warn before the due date, chase after it, or both. */
  scope?: "upcoming" | "overdue" | "both";
  /** How many days ahead of the due date counts as "upcoming". */
  daysAhead?: number;
}

/**
 * Reminders for invoices that are about to fall due or already have.
 *
 * Everything here is opt-out aware: a guardian who muted fee reminders on a
 * channel gets nothing on that channel, digest settings and quiet hours decide
 * *when* email/SMS leaves the queue, and the same invoice is never reminded on
 * twice in one run.
 */
export async function sendInvoiceReminders(options: InvoiceReminderOptions) {
  const scope = options.scope ?? "both";
  const daysAhead = options.daysAhead ?? 7;
  const today = new Date();
  const horizon = new Date(today.getTime() + daysAhead * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      `id, invoice_number, total_amount, amount_paid, due_date, status, student_id,
       students!inner(id, first_name, last_name, user_id,
         student_guardians(guardians(user_id, email, phone, first_name, last_name)))`,
    )
    .eq("school_id", options.schoolId)
    .in("status", ["pending", "overdue"]);

  if (error) {
    console.error("Failed to load invoices for reminders:", error);
    return { candidates: 0, sent: 0, queued: 0, skipped: 0 };
  }

  type Target = {
    userId: string | null;
    email: string | null;
    phone: string | null;
    invoiceId: string;
    invoiceNumber: string;
    studentName: string;
    balance: number;
    dueDate: string | null;
    overdue: boolean;
  };

  const targets: Target[] = [];

  for (const inv of invoices || []) {
    const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
    if (balance <= 0) continue;

    const overdue = !!inv.due_date && inv.due_date < iso(today);
    const upcoming = !!inv.due_date && inv.due_date >= iso(today) && inv.due_date <= iso(horizon);
    if (scope === "overdue" && !overdue) continue;
    if (scope === "upcoming" && !upcoming) continue;
    if (scope === "both" && !overdue && !upcoming) continue;

    const student = inv.students as unknown as {
      first_name: string;
      last_name: string;
      user_id: string | null;
      student_guardians: {
        guardians: {
          user_id: string | null;
          email: string | null;
          phone: string | null;
          first_name: string;
          last_name: string;
        } | null;
      }[];
    };
    const studentName = `${student.first_name} ${student.last_name}`;

    for (const link of student.student_guardians || []) {
      const g = link.guardians;
      if (!g) continue;
      targets.push({
        userId: g.user_id,
        email: g.email,
        phone: g.phone,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        studentName,
        balance,
        dueDate: inv.due_date,
        overdue,
      });
    }

    // Older students often manage their own fees; they see it in the app only.
    if (student.user_id) {
      targets.push({
        userId: student.user_id,
        email: null,
        phone: null,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        studentName,
        balance,
        dueDate: inv.due_date,
        overdue,
      });
    }
  }

  if (targets.length === 0) return { candidates: 0, sent: 0, queued: 0, skipped: 0 };

  const userIds = [...new Set(targets.map((t) => t.userId).filter((id): id is string => !!id))];
  const [settings, overduePrefs, upcomingPrefs] = await Promise.all([
    deliverySettings(userIds),
    channelPreferences(userIds, "overdue_reminder"),
    channelPreferences(userIds, "fee_reminder"),
  ]);

  const notifications: Parameters<typeof createBulkNotifications>[0] = [];
  const rows: {
    org_id: string;
    school_id: string;
    channel: string;
    recipient: string;
    subject: string;
    body: string;
    status: string;
    entity_type: string;
    entity_id: string;
    scheduled_for: string | null;
  }[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const target of targets) {
    const type = target.overdue ? "overdue_reminder" : "fee_reminder";
    const prefs = (target.overdue ? overduePrefs : upcomingPrefs).get(target.userId || "") ?? {
      inApp: true,
      email: true,
      sms: false,
    };
    const setting = settings.get(target.userId || "") ?? DEFAULT_DELIVERY;

    const due = target.dueDate ? new Date(target.dueDate).toLocaleDateString() : "shortly";
    const title = target.overdue
      ? `Overdue fees for ${target.studentName}`
      : `Fees due soon for ${target.studentName}`;
    const message = target.overdue
      ? `Invoice ${target.invoiceNumber} was due on ${due} and still has an outstanding balance. Please settle it or contact the school office.`
      : `Invoice ${target.invoiceNumber} is due on ${due}. Please arrange payment before the deadline.`;

    if (target.userId && prefs.inApp && setting.in_app_frequency !== "off") {
      const key = `app:${target.userId}:${target.invoiceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        notifications.push({
          orgId: options.orgId,
          schoolId: options.schoolId,
          userId: target.userId,
          type: type as NotificationType,
          title,
          message,
          entityType: "invoice",
          entityId: target.invoiceId,
        });
      }
    } else if (target.userId) {
      skipped += 1;
    }

    const queue = (channel: "email" | "sms", recipient: string | null) => {
      if (!recipient) return;
      if (channel === "email" && !prefs.email) { skipped += 1; return; }
      if (channel === "sms" && !prefs.sms) { skipped += 1; return; }
      const when = nextSendTime(setting, channel);
      if (when === false) { skipped += 1; return; }
      const key = `${channel}:${recipient}:${target.invoiceId}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        org_id: options.orgId,
        school_id: options.schoolId,
        channel,
        recipient,
        subject: title,
        body: channel === "sms" ? `${title}. ${message}`.slice(0, 300) : message,
        status: "queued",
        entity_type: "invoice",
        entity_id: target.invoiceId,
        scheduled_for: when,
      });
    };

    queue("email", target.email);
    queue("sms", target.phone);
  }

  if (notifications.length > 0) await createBulkNotifications(notifications);

  let queued = 0;
  if (rows.length > 0) {
    const { error: queueError } = await supabase.from("outbound_message_queue").insert(rows);
    if (queueError) console.error("Failed to queue invoice reminders:", queueError);
    else queued = rows.length;
  }

  return {
    candidates: new Set(targets.map((t) => t.invoiceId)).size,
    sent: notifications.length,
    queued,
    skipped,
  };
}
