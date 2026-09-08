import { formatCurrency } from "@/lib/format";
import {
  DocumentSchool,
  documentShell,
  esc,
  footerHtml,
  letterheadHtml,
  openDocument,
  printButtonHtml,
  shortDate,
  statusChipHtml,
} from "@/lib/document-theme";

/**
 * Invoices, receipts and transcripts. All three are built as standalone branded
 * documents through `document-theme`, so they carry the school's logo, colours
 * and letterhead and print consistently on A4.
 */

function schoolOf(data: {
  schoolName: string;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
}): DocumentSchool {
  return {
    name: data.schoolName,
    address: data.schoolAddress,
    email: data.schoolEmail,
    phone: data.schoolPhone,
    logoUrl: data.logoUrl,
    primaryColor: data.primaryColor,
    accentColor: data.accentColor,
  };
}

// ─── Invoice ──────────────────────────────────────────────────

interface InvoicePrintData {
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueDate: string | null;
  schoolName: string;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  studentName: string;
  studentId: string;
  className: string;
  periodName: string;
  lineItems: { description: string; category: string; amount: number }[];
  totalAmount: number;
  totalPaid: number;
  balance: number;
  payments: { date: string; amount: number; method: string; reference: string }[];
  currency?: string;
}

export function printInvoice(data: InvoicePrintData) {
  const fmt = (v: number) => formatCurrency(v, data.currency || "NGN");
  const school = schoolOf(data);

  const lineItems = data.lineItems
    .map(
      (i) => `<tr>
        <td>${esc(i.description)}</td>
        <td class="muted">${esc(i.category)}</td>
        <td class="num">${fmt(i.amount)}</td>
      </tr>`
    )
    .join("");

  const payments = data.payments.length
    ? `<p class="section-title">Payments received</p>
    <table class="doc">
      <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${data.payments
        .map(
          (p) => `<tr>
            <td>${shortDate(p.date)}</td>
            <td>${esc(p.method)}</td>
            <td class="mono muted" style="font-size:11px">${esc(p.reference)}</td>
            <td class="num">${fmt(p.amount)}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>`
    : "";

  const body = `
  ${letterheadHtml(school, {
    kicker: "Invoice",
    title: data.invoiceNumber,
    meta: [`Issued ${shortDate(data.issuedAt)}`, `Due ${data.dueDate ? shortDate(data.dueDate) : "—"}`],
    extra: `<p style="margin-top:6px">${statusChipHtml(data.status)}</p>`,
  })}

  <div class="grid-2">
    <div class="card">
      <p class="label">Billed to</p>
      <p class="value" style="font-size:15px">${esc(data.studentName)}</p>
      <p class="muted" style="font-size:11.5px">ID ${esc(data.studentId)} • ${esc(data.className)}</p>
    </div>
    <div class="card">
      <p class="label">Academic period</p>
      <p class="value">${esc(data.periodName)}</p>
      <p class="muted" style="font-size:11.5px">Please quote ${esc(data.invoiceNumber)} on any payment.</p>
    </div>
  </div>

  <p class="section-title">Fee breakdown</p>
  <table class="doc">
    <thead><tr><th>Description</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${lineItems}</tbody>
    <tfoot><tr><td colspan="2">Total charged</td><td class="num">${fmt(data.totalAmount)}</td></tr></tfoot>
  </table>

  <div class="total-box">
    <div class="row"><span>Total charged</span><span class="mono">${fmt(data.totalAmount)}</span></div>
    <div class="row"><span>Total paid</span><span class="mono">${fmt(data.totalPaid)}</span></div>
    <div class="row headline"><span>${data.balance > 0 ? "Balance due" : "Balance"}</span><span class="mono">${fmt(
      data.balance
    )}</span></div>
  </div>

  ${payments}
  ${footerHtml(school, `Invoice ${data.invoiceNumber} issued by ${school.name}.`)}
  ${printButtonHtml("Print invoice")}`;

  openDocument(documentShell(school, { title: `Invoice ${data.invoiceNumber}`, body }));
}

// ─── Receipt ──────────────────────────────────────────────────

interface ReceiptPrintData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  studentName: string;
  studentId: string;
  paymentDate: string;
  amount: number;
  method: string;
  referenceNumber: string;
  invoiceAllocations: { invoiceNumber: string; amount: number }[];
  currency?: string;
}

export function printReceipt(data: ReceiptPrintData) {
  const fmt = (v: number) => formatCurrency(v, data.currency || "NGN");
  const school = schoolOf(data);

  const allocations = data.invoiceAllocations.length
    ? `<p class="section-title">Applied to invoices</p>
    <table class="doc">
      <thead><tr><th>Invoice</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${data.invoiceAllocations
        .map(
          (a) => `<tr><td class="mono">${esc(a.invoiceNumber)}</td><td class="num">${fmt(a.amount)}</td></tr>`
        )
        .join("")}</tbody>
    </table>`
    : "";

  const body = `
  ${letterheadHtml(school, {
    kicker: "Official receipt",
    title: data.referenceNumber,
    meta: [`Received ${shortDate(data.paymentDate)}`],
    extra: `<p style="margin-top:6px"><span class="chip chip-good">Paid</span></p>`,
  })}

  <div style="text-align:center;padding:26px 18px;border:1px solid var(--brand-border);border-radius:16px;background:var(--brand-soft)">
    <p class="label">Amount received</p>
    <p class="mono" style="margin-top:6px;font-size:34px;font-weight:800;color:var(--brand)">${fmt(data.amount)}</p>
    <p class="muted" style="margin-top:6px;font-size:11.5px">Paid by ${esc(data.method)}</p>
  </div>

  <div class="grid-2" style="margin-top:20px">
    <div><p class="label">Student</p><p class="value">${esc(data.studentName)}</p><p class="muted" style="font-size:11.5px">ID ${esc(
      data.studentId
    )}</p></div>
    <div style="text-align:right"><p class="label">Reference</p><p class="value mono">${esc(
      data.referenceNumber
    )}</p></div>
  </div>

  ${allocations}

  <div class="sign-row">
    <div class="sign-line">Received by (name &amp; signature)</div>
    <div class="sign-line">School stamp</div>
  </div>

  ${footerHtml(school, "Keep this receipt as proof of payment.")}
  ${printButtonHtml("Print receipt")}`;

  openDocument(documentShell(school, { title: `Receipt ${data.referenceNumber}`, body, size: "narrow", maxWidth: 700 }));
}

// ─── Student Transcript ───────────────────────────────────────

interface TranscriptScore {
  examName: string;
  examDate: string | null;
  subjectName: string;
  score: number | null;
  maxScore: number;
  grade: string | null;
  periodName: string;
}

interface TranscriptAward {
  title: string;
  description: string | null;
  date: string;
  periodName: string | null;
}

export interface TranscriptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  studentName: string;
  studentIdNumber: string;
  className: string;
  dateOfBirth: string | null;
  gender: string | null;
  enrolmentDate: string;
  scores: TranscriptScore[];
  attendanceTotal: number;
  attendancePresent: number;
  awards: TranscriptAward[];
  generatedAt?: string;
  /** Overrides the default "Student Transcript" heading, e.g. a term report card. */
  documentTitle?: string;
  documentKicker?: string;
}

export function printTranscript(data: TranscriptData) {
  const school = schoolOf(data);

  const attendancePct =
    data.attendanceTotal > 0 ? Math.round((data.attendancePresent / data.attendanceTotal) * 100) : 0;
  const attendanceChip = attendancePct >= 80 ? "chip chip-good" : attendancePct >= 60 ? "chip chip-warn" : "chip chip-bad";

  const periodMap = new Map<string, TranscriptScore[]>();
  data.scores.forEach((s) => {
    const key = s.periodName || "Unassigned";
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(s);
  });

  let scoresHtml = "";
  periodMap.forEach((scores, period) => {
    const totalScore = scores.reduce((a, s) => a + (s.score || 0), 0);
    const totalMax = scores.reduce((a, s) => a + s.maxScore, 0);
    const avgPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

    scoresHtml += `
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <p style="font-size:13px;font-weight:700;color:var(--brand)">${esc(period)}</p>
          <span class="chip">Average ${avgPct}%</span>
        </div>
        <table class="doc">
          <thead><tr><th>Subject</th><th>Exam</th><th style="text-align:right">Score</th><th style="text-align:center">Grade</th><th>Date</th></tr></thead>
          <tbody>${scores
            .map(
              (s) => `<tr>
                <td style="font-weight:600">${esc(s.subjectName)}</td>
                <td class="muted">${esc(s.examName)}</td>
                <td class="num">${s.score ?? "—"}/${s.maxScore}</td>
                <td style="text-align:center"><span class="chip">${esc(s.grade || "—")}</span></td>
                <td class="muted">${shortDate(s.examDate)}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`;
  });

  if (data.scores.length === 0) {
    scoresHtml = `<p class="muted" style="text-align:center;padding:18px">No exam records found.</p>`;
  }

  const awardsHtml = data.awards.length
    ? `<p class="section-title">Awards &amp; achievements</p>
      <table class="doc">
        <thead><tr><th>Title</th><th>Description</th><th>Period</th><th>Date</th></tr></thead>
        <tbody>${data.awards
          .map(
            (a) => `<tr>
              <td style="font-weight:600">${esc(a.title)}</td>
              <td class="muted">${esc(a.description || "—")}</td>
              <td>${esc(a.periodName || "—")}</td>
              <td class="muted">${shortDate(a.date)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`
    : "";

  const generated = data.generatedAt || new Date().toLocaleDateString();

  const body = `
  ${letterheadHtml(school, {
    kicker: data.documentKicker || "Official record",
    title: data.documentTitle || "Student Transcript",
    meta: [`Generated ${generated}`],
  })}

  <div class="card grid-3">
    <div><p class="label">Student name</p><p class="value" style="font-size:15px">${esc(data.studentName)}</p></div>
    <div><p class="label">Student ID</p><p class="value mono">${esc(data.studentIdNumber || "—")}</p></div>
    <div><p class="label">Current class</p><p class="value">${esc(data.className)}</p></div>
    ${data.dateOfBirth ? `<div><p class="label">Date of birth</p><p class="value">${esc(data.dateOfBirth)}</p></div>` : ""}
    ${data.gender ? `<div><p class="label">Gender</p><p class="value">${esc(data.gender)}</p></div>` : ""}
    <div><p class="label">Enrolled since</p><p class="value">${shortDate(data.enrolmentDate)}</p></div>
  </div>

  <div style="margin-top:16px;display:flex;align-items:center;gap:16px;padding:14px 18px;border:1px solid var(--brand-border);border-radius:12px">
    <div style="flex:1">
      <p style="font-weight:700">Attendance summary</p>
      <p class="muted" style="font-size:11.5px">${data.attendancePresent} present out of ${data.attendanceTotal} recorded days</p>
    </div>
    <span class="${attendanceChip}" style="font-size:15px;padding:6px 16px">${attendancePct}%</span>
  </div>

  <p class="section-title">Academic performance</p>
  ${scoresHtml}
  ${awardsHtml}

  <div class="sign-row">
    <div class="sign-line">Class teacher</div>
    <div class="sign-line">Head of school</div>
  </div>

  ${footerHtml(school, `This transcript is issued by ${school.name}.`)}
  ${printButtonHtml("Print transcript")}`;

  openDocument(documentShell(school, { title: `${data.documentTitle || "Student Transcript"} — ${data.studentName}`, body }));
}

export type { IdCardData, IdCardRenderOptions } from "./id-card";
export { printIdCard, buildIdCardHtml, buildProfileQr, CR80 } from "./id-card";
