import { formatCurrency } from "@/lib/format";

/**
 * Printed letters exist for the very common case of a guardian with no email or
 * smartphone: the school prints the letter, hands it to the student, and the
 * student takes it home. Every letter therefore carries the full detail a parent
 * needs offline (amounts, deadline, how to pay, who to speak to) plus a tear-off
 * slip the parent signs and the student returns, so the school has a paper trail
 * that the message actually arrived.
 */

export type LetterKind = "fee_reminder" | "overdue_notice" | "final_notice" | "general";

export const LETTER_KINDS: { value: LetterKind; label: string; description: string }[] = [
  { value: "fee_reminder", label: "Fee reminder", description: "Polite reminder that fees are due." },
  { value: "overdue_notice", label: "Overdue notice", description: "Firmer notice that the deadline has passed." },
  { value: "final_notice", label: "Final notice", description: "Last written warning before further action." },
  { value: "general", label: "General letter", description: "Any other message, in your own words." },
];

export interface LetterSchool {
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  currency?: string;
}

export interface LetterRecipient {
  /** Who the letter is addressed to, e.g. "Mr & Mrs Adeyemi". Falls back to a generic salutation. */
  guardianName?: string | null;
  studentName: string;
  studentIdNumber?: string | null;
  className?: string | null;
  invoiceNumber?: string | null;
  balance?: number | null;
  dueDate?: string | null;
  daysOverdue?: number | null;
  periodName?: string | null;
}

export interface LetterOptions {
  kind: LetterKind;
  /** Only used for the general letter; other kinds compose their own wording. */
  subject?: string;
  body?: string;
  /** Date by which the school expects payment or a response. */
  respondBy?: string;
  /** Free text: bank account, POS availability, office hours. */
  paymentInstructions?: string;
  signatoryName?: string;
  signatoryRole?: string;
  includeSlip?: boolean;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function longDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function letterSubject(kind: LetterKind, custom?: string): string {
  if (kind === "general") return custom?.trim() || "A letter from the school";
  if (kind === "fee_reminder") return "Reminder: school fees due";
  if (kind === "overdue_notice") return "Outstanding school fees";
  return "Final notice: outstanding school fees";
}

/** The wording of the letter, in plain English a parent can act on. */
function letterBody(recipient: LetterRecipient, opts: LetterOptions, currency: string): string {
  const money = (v?: number | null) => formatCurrency(Math.max(v || 0, 0), currency);
  const child = recipient.studentName;
  const cls = recipient.className && recipient.className !== "—" ? ` of ${recipient.className}` : "";
  const term = recipient.periodName && recipient.periodName !== "—" ? ` for ${recipient.periodName}` : "";
  const respondBy = opts.respondBy ? longDate(opts.respondBy) : "";

  if (opts.kind === "general") {
    return opts.body?.trim()
      ? opts.body
      : `We are writing to you concerning your child, ${child}${cls}.`;
  }

  const amount = money(recipient.balance);
  const invoice = recipient.invoiceNumber ? ` (invoice ${recipient.invoiceNumber})` : "";

  if (opts.kind === "fee_reminder") {
    return [
      `We are writing about the school fees for your child, ${child}${cls}.`,
      `The balance outstanding on the account${term} is ${amount}${invoice}.${
        recipient.dueDate ? ` Payment was due on ${longDate(recipient.dueDate)}.` : ""
      }`,
      respondBy
        ? `We would be grateful if payment could reach the school on or before ${respondBy}. If you have already paid, please ignore this letter and send the receipt to the bursary so we can update our records.`
        : `If you have already paid, please ignore this letter and send the receipt to the bursary so we can update our records.`,
      `If it would help to spread the payment, please speak to the bursary — we would rather agree a plan with you than have your child's learning disrupted.`,
    ].join("\n\n");
  }

  if (opts.kind === "overdue_notice") {
    return [
      `The school fees for your child, ${child}${cls}, are now overdue.`,
      `The amount outstanding${term} is ${amount}${invoice}${
        recipient.daysOverdue ? `, which is ${recipient.daysOverdue} day${recipient.daysOverdue === 1 ? "" : "s"} past the due date` : ""
      }.`,
      respondBy
        ? `Kindly settle the balance, or come to the bursary to agree a payment plan, on or before ${respondBy}.`
        : `Kindly settle the balance, or come to the bursary to agree a payment plan, as soon as possible.`,
      `If payment has already been made, please send the receipt to the bursary and we will correct our records immediately.`,
    ].join("\n\n");
  }

  return [
    `This is a final written notice regarding the outstanding school fees for your child, ${child}${cls}.`,
    `The amount outstanding${term} is ${amount}${invoice}${
      recipient.daysOverdue ? `, now ${recipient.daysOverdue} day${recipient.daysOverdue === 1 ? "" : "s"} overdue` : ""
    }. Earlier reminders have not been settled.`,
    respondBy
      ? `Please make payment, or meet the bursary to agree a written payment plan, on or before ${respondBy}. If we do not hear from you by that date we will have to discuss the matter with the school management.`
      : `Please make payment, or meet the bursary to agree a written payment plan, without further delay. If we do not hear from you we will have to discuss the matter with the school management.`,
    `We would much rather resolve this with you directly. If your circumstances have changed, please come and talk to us.`,
  ].join("\n\n");
}

function letterHtml(recipient: LetterRecipient, opts: LetterOptions, school: LetterSchool, index: number): string {
  const currency = school.currency || "NGN";
  const salutation = recipient.guardianName?.trim()
    ? `Dear ${esc(recipient.guardianName.trim())},`
    : `Dear Parent / Guardian of ${esc(recipient.studentName)},`;
  const subject = letterSubject(opts.kind, opts.subject);
  const signatory = opts.signatoryName?.trim() || "The Bursary";
  const signatoryRole = opts.signatoryRole?.trim() || "";

  const logo = school.logoUrl
    ? `<img src="${esc(school.logoUrl)}" alt="" style="height:56px;width:56px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:56px;width:56px;background:#1e293b;border-radius:8px;color:#fff;font-weight:700;font-size:22px;display:flex;align-items:center;justify-content:center">${esc(school.name.charAt(0))}</div>`;

  const detailRows: string[] = [];
  if (recipient.studentIdNumber) detailRows.push(`<tr><td style="padding:3px 12px 3px 0;color:#64748b">Student ID</td><td style="font-family:monospace">${esc(recipient.studentIdNumber)}</td></tr>`);
  if (recipient.className) detailRows.push(`<tr><td style="padding:3px 12px 3px 0;color:#64748b">Class</td><td>${esc(recipient.className)}</td></tr>`);
  if (recipient.periodName) detailRows.push(`<tr><td style="padding:3px 12px 3px 0;color:#64748b">Term</td><td>${esc(recipient.periodName)}</td></tr>`);
  if (recipient.invoiceNumber) detailRows.push(`<tr><td style="padding:3px 12px 3px 0;color:#64748b">Invoice</td><td style="font-family:monospace">${esc(recipient.invoiceNumber)}</td></tr>`);
  if (opts.kind !== "general" && (recipient.balance ?? 0) > 0)
    detailRows.push(`<tr><td style="padding:3px 12px 3px 0;color:#64748b">Amount outstanding</td><td style="font-family:monospace;font-weight:700;color:#b91c1c">${esc(formatCurrency(recipient.balance || 0, currency))}</td></tr>`);
  if (recipient.dueDate) detailRows.push(`<tr><td style="padding:3px 12px 3px 0;color:#64748b">Due date</td><td>${esc(longDate(recipient.dueDate))}</td></tr>`);

  const detailBox = detailRows.length
    ? `<table style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px;border-collapse:separate">${detailRows.join("")}</table>`
    : "";

  const instructions = opts.paymentInstructions?.trim()
    ? `<div style="margin:0 0 16px;padding:12px 14px;background:#f8fafc;border-left:3px solid #1e293b;font-size:13px">
        <p style="margin:0 0 6px;font-weight:600">How to pay</p>${paragraphs(opts.paymentInstructions)}
      </div>`
    : "";

  const slip =
    opts.includeSlip === false
      ? ""
      : `<div style="margin-top:28px;border-top:1px dashed #94a3b8;padding-top:14px;font-size:12px">
          <p style="margin:0 0 10px;font-weight:600">Acknowledgement slip — please sign and return with your child</p>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr>
              <td style="padding:4px 0">Student: <strong>${esc(recipient.studentName)}</strong>${recipient.className ? ` &nbsp; Class: <strong>${esc(recipient.className)}</strong>` : ""}</td>
            </tr>
            <tr><td style="padding:14px 0 4px">Received by (name): ______________________________________</td></tr>
            <tr><td style="padding:14px 0 4px">Signature: ____________________________ Date: ______________</td></tr>
            <tr><td style="padding:14px 0 0;color:#475569">I will pay / I would like to discuss a payment plan (please circle one).</td></tr>
          </table>
        </div>`;

  return `<section class="letter" style="${index > 0 ? "page-break-before:always;" : ""}">
    <header style="display:flex;gap:14px;align-items:center;border-bottom:2px solid #1e293b;padding-bottom:14px;margin-bottom:18px">
      ${logo}
      <div>
        <h1 style="margin:0;font-size:19px;font-weight:700">${esc(school.name)}</h1>
        ${school.address ? `<p style="margin:2px 0;font-size:12px;color:#64748b">${esc(school.address)}</p>` : ""}
        ${school.phone || school.email ? `<p style="margin:2px 0;font-size:12px;color:#64748b">${esc([school.phone, school.email].filter(Boolean).join(" • "))}</p>` : ""}
      </div>
    </header>

    <p style="margin:0 0 14px;font-size:12px;color:#64748b">${esc(longDate(new Date().toISOString()))}</p>
    <p style="margin:0 0 4px;font-size:13px">${salutation}</p>
    <h2 style="margin:14px 0 12px;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.02em">${esc(subject)}</h2>

    ${detailBox}
    <div style="font-size:13px;line-height:1.65">${paragraphs(letterBody(recipient, opts, currency))}</div>
    ${instructions}

    <div style="margin-top:22px;font-size:13px">
      <p style="margin:0 0 26px">Yours faithfully,</p>
      <p style="margin:0;font-weight:600">${esc(signatory)}</p>
      ${signatoryRole ? `<p style="margin:0;font-size:12px;color:#64748b">${esc(signatoryRole)}</p>` : ""}
      <p style="margin:2px 0 0;font-size:12px;color:#64748b">${esc(school.name)}</p>
    </div>

    ${slip}
  </section>`;
}

/**
 * Opens a print window holding one letter per recipient, one per page, so a
 * bursar can print a whole class in a single pass.
 */
export function buildLettersDocument(recipients: LetterRecipient[], opts: LetterOptions, school: LetterSchool): string {
  const title = `${letterSubject(opts.kind, opts.subject)} — ${school.name}`;
  const body = recipients.map((r, i) => letterHtml(r, opts, school, i)).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { margin: 18mm; }
  @media print { .no-print { display: none; } body { padding: 0; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 780px; margin: 0 auto; padding: 28px 22px; }
  .letter { padding-bottom: 8px; }
  p { line-height: 1.6; }
</style></head><body>
  <div class="no-print" style="margin:0 0 20px;text-align:center">
    <button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">
      Print ${recipients.length} letter${recipients.length === 1 ? "" : "s"}
    </button>
  </div>
  ${body}
</body></html>`;
}

export function printLetters(recipients: LetterRecipient[], opts: LetterOptions, school: LetterSchool): boolean {
  if (recipients.length === 0) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildLettersDocument(recipients, opts, school));
  win.document.close();
  return true;
}
