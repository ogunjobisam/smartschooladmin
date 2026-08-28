/**
 * Starter wording for every notification the app can send. Schools can edit
 * these freely — the defaults only exist so nobody starts from a blank page.
 */
export interface TemplateDefault {
  type: string;
  channel: "in_app" | "email" | "sms";
  subject: string;
  body: string;
}

export const PLACEHOLDERS = [
  "{{student_name}}",
  "{{guardian_name}}",
  "{{staff_name}}",
  "{{school_name}}",
  "{{amount}}",
  "{{balance}}",
  "{{invoice_number}}",
  "{{due_date}}",
  "{{term}}",
  "{{message}}",
];

export const DEFAULT_TEMPLATES: TemplateDefault[] = [
  {
    type: "invoice_generated",
    channel: "email",
    subject: "{{school_name}}: Invoice {{invoice_number}} for {{student_name}}",
    body: "Dear {{guardian_name}},\n\nAn invoice of {{amount}} has been raised for {{student_name}} for {{term}}. Payment is due on {{due_date}}.\n\nYou can view the invoice and pay online from the parent portal.\n\nThank you,\n{{school_name}}",
  },
  {
    type: "invoice_generated",
    channel: "in_app",
    subject: "New invoice for {{student_name}}",
    body: "Invoice {{invoice_number}} of {{amount}} is due on {{due_date}}.",
  },
  {
    type: "invoice_generated",
    channel: "sms",
    subject: "New invoice",
    body: "{{school_name}}: Invoice {{invoice_number}} of {{amount}} for {{student_name}} is due {{due_date}}.",
  },
  {
    type: "fee_reminder",
    channel: "email",
    subject: "{{school_name}}: Fee reminder for {{student_name}}",
    body: "Dear {{guardian_name}},\n\nThis is a friendly reminder that {{balance}} remains outstanding on {{student_name}}'s fees for {{term}}. Kindly settle before {{due_date}}.\n\nIf you have already paid, please ignore this message.\n\nThank you,\n{{school_name}}",
  },
  {
    type: "fee_reminder",
    channel: "in_app",
    subject: "Fee reminder",
    body: "{{balance}} is outstanding on {{student_name}}'s fees for {{term}}.",
  },
  {
    type: "fee_reminder",
    channel: "sms",
    subject: "Fee reminder",
    body: "{{school_name}}: {{balance}} outstanding on {{student_name}}'s fees. Kindly pay before {{due_date}}.",
  },
  {
    type: "overdue_reminder",
    channel: "email",
    subject: "{{school_name}}: Overdue fees for {{student_name}}",
    body: "Dear {{guardian_name}},\n\nOur records show {{balance}} on invoice {{invoice_number}} is now past its due date of {{due_date}}. Please arrange payment or contact the bursary to agree a plan.\n\nThank you,\n{{school_name}}",
  },
  {
    type: "overdue_reminder",
    channel: "in_app",
    subject: "Overdue fees",
    body: "Invoice {{invoice_number}} ({{balance}}) is past due. Please arrange payment.",
  },
  {
    type: "overdue_reminder",
    channel: "sms",
    subject: "Overdue fees",
    body: "{{school_name}}: {{balance}} on invoice {{invoice_number}} is overdue. Please contact the bursary.",
  },
  {
    type: "payment_confirmation",
    channel: "email",
    subject: "{{school_name}}: Payment received — thank you",
    body: "Dear {{guardian_name}},\n\nWe have received {{amount}} towards {{student_name}}'s fees. Your outstanding balance is now {{balance}}.\n\nYour receipt is available in the parent portal.\n\nThank you,\n{{school_name}}",
  },
  {
    type: "payment_confirmation",
    channel: "in_app",
    subject: "Payment received",
    body: "{{amount}} received for {{student_name}}. Balance: {{balance}}.",
  },
  {
    type: "payment_confirmation",
    channel: "sms",
    subject: "Payment received",
    body: "{{school_name}}: We received {{amount}} for {{student_name}}. Balance {{balance}}. Thank you.",
  },
  {
    type: "school_announcement",
    channel: "email",
    subject: "{{school_name}}: {{subject}}",
    body: "Dear parent/guardian,\n\n{{message}}\n\nThank you,\n{{school_name}}",
  },
  {
    type: "school_announcement",
    channel: "in_app",
    subject: "{{school_name}} announcement",
    body: "{{message}}",
  },
  {
    type: "school_announcement",
    channel: "sms",
    subject: "Announcement",
    body: "{{school_name}}: {{message}}",
  },
];
