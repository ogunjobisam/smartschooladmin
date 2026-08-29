import { formatCurrency } from "@/lib/format";

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
  const win = window.open("", "_blank");
  if (!win) return;

  const lineItemsHtml = data.lineItems.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${i.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">${i.category}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${fmt(i.amount)}</td>
    </tr>
  `).join("");

  const paymentsHtml = data.payments.length > 0 ? `
    <h3 style="margin:32px 0 12px;font-size:14px;font-weight:600">Payment History</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Date</th>
        <th style="padding:8px 12px;text-align:right;font-weight:600;border-bottom:2px solid #e2e8f0">Amount</th>
        <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Method</th>
        <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Reference</th>
      </tr></thead>
      <tbody>${data.payments.map(p => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${p.date}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${fmt(p.amount)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${p.method}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;color:#64748b">${p.reference}</td>
        </tr>
      `).join("")}</tbody>
    </table>
  ` : "";

  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="Logo" style="height:48px;width:48px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:48px;width:48px;background:#1e293b;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px">${data.schoolName[0]}</div>`;

  const statusColor = data.status === "paid" ? "#16a34a" : data.status === "overdue" ? "#dc2626" : "#f59e0b";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${data.invoiceNumber}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 20mm; } .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 40px 24px; }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
    <div style="display:flex;gap:12px;align-items:center">
      ${logoHtml}
      <div>
        <h1 style="margin:0;font-size:20px;font-weight:700">${data.schoolName}</h1>
        ${data.schoolAddress ? `<p style="margin:2px 0;font-size:12px;color:#64748b">${data.schoolAddress}</p>` : ""}
        ${data.schoolEmail ? `<p style="margin:2px 0;font-size:12px;color:#64748b">${data.schoolEmail}${data.schoolPhone ? ` • ${data.schoolPhone}` : ""}</p>` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <h2 style="margin:0;font-size:24px;font-weight:700;font-family:monospace">${data.invoiceNumber}</h2>
      <span style="display:inline-block;margin-top:4px;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;color:white;background:${statusColor};text-transform:uppercase">${data.status}</span>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;font-size:13px">
    <div>
      <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:600">Bill To</p>
      <p style="margin:4px 0;font-weight:600">${data.studentName}</p>
      <p style="margin:0;color:#64748b">ID: ${data.studentId} • ${data.className}</p>
    </div>
    <div style="text-align:right">
      <p style="margin:0"><span style="color:#64748b">Period:</span> ${data.periodName}</p>
      <p style="margin:4px 0"><span style="color:#64748b">Issued:</span> ${new Date(data.issuedAt).toLocaleDateString()}</p>
      <p style="margin:0"><span style="color:#64748b">Due:</span> ${data.dueDate || "—"}</p>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f8fafc">
      <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Description</th>
      <th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Category</th>
      <th style="padding:8px 12px;text-align:right;font-weight:600;border-bottom:2px solid #e2e8f0">Amount</th>
    </tr></thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>

  <div style="margin-top:16px;text-align:right;font-size:14px">
    <p style="margin:4px 0"><span style="color:#64748b">Total:</span> <strong style="font-family:monospace">${fmt(data.totalAmount)}</strong></p>
    <p style="margin:4px 0"><span style="color:#64748b">Paid:</span> <span style="font-family:monospace;color:#16a34a">${fmt(data.totalPaid)}</span></p>
    <p style="margin:4px 0;font-size:16px"><span style="color:#64748b">Balance Due:</span> <strong style="font-family:monospace;color:${data.balance > 0 ? '#dc2626' : '#16a34a'}">${fmt(data.balance)}</strong></p>
  </div>

  ${paymentsHtml}

  <div class="no-print" style="margin-top:32px;text-align:center">
    <button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Print Invoice</button>
  </div>
</body></html>`;

  win.document.write(html);
  win.document.close();
}

interface ReceiptPrintData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
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
  const win = window.open("", "_blank");
  if (!win) return;

  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="Logo" style="height:48px;width:48px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:48px;width:48px;background:#1e293b;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px">${data.schoolName[0]}</div>`;

  const allocationsHtml = data.invoiceAllocations.length > 0 ? `
    <h3 style="margin:24px 0 8px;font-size:13px;font-weight:600">Applied to Invoices</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:6px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Invoice</th>
        <th style="padding:6px 12px;text-align:right;font-weight:600;border-bottom:2px solid #e2e8f0">Amount</th>
      </tr></thead>
      <tbody>${data.invoiceAllocations.map(a => `
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace">${a.invoiceNumber}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${fmt(a.amount)}</td>
        </tr>
      `).join("")}</tbody>
    </table>
  ` : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payment Receipt</title>
<style>
  @media print { body { margin: 0; } @page { margin: 20mm; } .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 40px 24px; }
</style></head><body>
  <div style="text-align:center;margin-bottom:24px">
    <div style="display:inline-flex;align-items:center;gap:12px">
      ${logoHtml}
      <div style="text-align:left">
        <h1 style="margin:0;font-size:20px;font-weight:700">${data.schoolName}</h1>
        ${data.schoolAddress ? `<p style="margin:2px 0;font-size:12px;color:#64748b">${data.schoolAddress}</p>` : ""}
      </div>
    </div>
    <h2 style="margin:16px 0 4px;font-size:18px;color:#16a34a;text-transform:uppercase;letter-spacing:2px">Payment Receipt</h2>
  </div>

  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:600">Student</span><p style="margin:4px 0;font-weight:600">${data.studentName}</p><p style="margin:0;color:#64748b;font-size:12px">ID: ${data.studentId}</p></div>
      <div style="text-align:right"><span style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:600">Reference</span><p style="margin:4px 0;font-family:monospace;font-weight:600">${data.referenceNumber}</p></div>
      <div><span style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:600">Date</span><p style="margin:4px 0">${new Date(data.paymentDate).toLocaleDateString()}</p></div>
      <div style="text-align:right"><span style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:600">Method</span><p style="margin:4px 0">${data.method}</p></div>
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:2px solid #e2e8f0;text-align:center">
      <span style="color:#64748b;font-size:11px;text-transform:uppercase;font-weight:600">Amount Paid</span>
      <p style="margin:4px 0;font-size:28px;font-weight:700;font-family:monospace;color:#16a34a">${fmt(data.amount)}</p>
    </div>
  </div>

  ${allocationsHtml}

  <p style="margin-top:32px;text-align:center;font-size:11px;color:#94a3b8">This is a computer-generated receipt. No signature required.</p>

  <div class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Print Receipt</button>
  </div>
</body></html>`;

  win.document.write(html);
  win.document.close();
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
}

export function printTranscript(data: TranscriptData) {
  const win = window.open("", "_blank");
  if (!win) return;

  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="Logo" style="height:56px;width:56px;object-fit:contain;border-radius:8px" />`
    : `<div style="height:56px;width:56px;background:#1e293b;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:24px">${data.schoolName[0]}</div>`;

  const attendancePct = data.attendanceTotal > 0
    ? Math.round((data.attendancePresent / data.attendanceTotal) * 100)
    : 0;
  const attendanceColor = attendancePct >= 80 ? "#16a34a" : attendancePct >= 60 ? "#f59e0b" : "#dc2626";

  // Group scores by period
  const periodMap = new Map<string, TranscriptScore[]>();
  data.scores.forEach(s => {
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
      <div style="margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0;font-size:14px;font-weight:700;color:#1e293b">${period}</h3>
          <span style="font-size:12px;color:#64748b">Average: <strong>${avgPct}%</strong></span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f1f5f9">
            <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Subject</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Exam</th>
            <th style="padding:6px 10px;text-align:right;font-weight:600;border-bottom:2px solid #e2e8f0">Score</th>
            <th style="padding:6px 10px;text-align:center;font-weight:600;border-bottom:2px solid #e2e8f0">Grade</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Date</th>
          </tr></thead>
          <tbody>${scores.map(s => `
            <tr>
              <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0">${s.subjectName}</td>
              <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">${s.examName}</td>
              <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${s.score ?? "—"}/${s.maxScore}</td>
              <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:center"><span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#f1f5f9;font-weight:600;font-size:11px">${s.grade || "—"}</span></td>
              <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">${s.examDate || "—"}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    `;
  });

  if (data.scores.length === 0) {
    scoresHtml = `<p style="color:#94a3b8;text-align:center;padding:16px">No exam records found.</p>`;
  }

  const awardsHtml = data.awards.length > 0 ? `
    <div style="margin-top:24px">
      <h3 style="margin:0 0 8px;font-size:14px;font-weight:700;border-bottom:2px solid #1e293b;padding-bottom:4px">Awards & Achievements</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Title</th>
          <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Description</th>
          <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Period</th>
          <th style="padding:6px 10px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0">Date</th>
        </tr></thead>
        <tbody>${data.awards.map(a => `
          <tr>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">${a.title}</td>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">${a.description || "—"}</td>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0">${a.periodName || "—"}</td>
            <td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;color:#64748b">${a.date}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  ` : "";

  const generated = data.generatedAt || new Date().toLocaleDateString();

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Student Transcript — ${data.studentName}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 15mm 20mm; } .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 32px 24px; }
</style></head><body>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #1e293b;padding-bottom:16px">
    <div style="display:flex;gap:12px;align-items:center">
      ${logoHtml}
      <div>
        <h1 style="margin:0;font-size:22px;font-weight:800">${data.schoolName}</h1>
        ${data.schoolAddress ? `<p style="margin:2px 0;font-size:11px;color:#64748b">${data.schoolAddress}</p>` : ""}
        ${data.schoolEmail ? `<p style="margin:2px 0;font-size:11px;color:#64748b">${data.schoolEmail}${data.schoolPhone ? ` • ${data.schoolPhone}` : ""}</p>` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <h2 style="margin:0;font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#1e293b">Student Transcript</h2>
      <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">Generated: ${generated}</p>
    </div>
  </div>

  <!-- Student Info -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;padding:16px;background:#f8fafc;border-radius:8px;font-size:13px">
    <div>
      <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:1px">Student Name</p>
      <p style="margin:4px 0 0;font-weight:700;font-size:15px">${data.studentName}</p>
    </div>
    <div>
      <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:1px">Student ID</p>
      <p style="margin:4px 0 0;font-family:monospace;font-weight:600">${data.studentIdNumber || "—"}</p>
    </div>
    <div>
      <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:1px">Current Class</p>
      <p style="margin:4px 0 0;font-weight:600">${data.className}</p>
    </div>
    ${data.dateOfBirth ? `<div>
      <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:1px">Date of Birth</p>
      <p style="margin:4px 0 0">${data.dateOfBirth}</p>
    </div>` : ""}
    ${data.gender ? `<div>
      <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:1px">Gender</p>
      <p style="margin:4px 0 0">${data.gender}</p>
    </div>` : ""}
    <div>
      <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:1px">Enrolled Since</p>
      <p style="margin:4px 0 0">${new Date(data.enrolmentDate).toLocaleDateString()}</p>
    </div>
  </div>

  <!-- Attendance Summary -->
  <div style="margin-bottom:24px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;display:flex;align-items:center;gap:16px">
    <div style="flex:1">
      <p style="margin:0;font-size:13px;font-weight:700">Attendance Summary</p>
      <p style="margin:2px 0 0;font-size:12px;color:#64748b">${data.attendancePresent} present out of ${data.attendanceTotal} recorded days</p>
    </div>
    <div style="text-align:center">
      <span style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:18px;font-weight:800;font-family:monospace;color:white;background:${attendanceColor}">${attendancePct}%</span>
    </div>
  </div>

  <!-- Exam Scores by Period -->
  <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;border-bottom:2px solid #1e293b;padding-bottom:4px">Academic Performance</h2>
  ${scoresHtml}

  ${awardsHtml}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8">
    <span>This transcript is issued by ${data.schoolName}.</span>
    <span>Page 1</span>
  </div>

  <div class="no-print" style="margin-top:24px;text-align:center">
    <button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Print Transcript</button>
  </div>
</body></html>`;

  win.document.write(html);
  win.document.close();
}

export interface IdCardData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  holderName: string;
  holderKind: "Student" | "Staff";
  idNumber: string;
  subtitle: string;
  photoUrl?: string | null;
  extraRows: { label: string; value: string }[];
  validUntil?: string | null;
}

/**
 * Print a true CR80 credit-card sized identity card (85.6mm x 54mm).
 * The page itself is set to the card size so the printer produces a card,
 * never a small card floating on an A4 sheet. Front prints on page 1,
 * back on page 2 (feed the same card back in, or print duplex).
 */
export function printIdCard(data: IdCardData) {
  const win = window.open("", "_blank");
  if (!win) return;

  const brand = data.primaryColor || "#1e293b";
  const initials = data.holderName.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const photoHtml = data.photoUrl
    ? `<img src="${data.photoUrl}" alt="${data.holderName}" class="photo" />`
    : `<div class="photo photo-fallback">${initials}</div>`;

  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="" class="logo" />`
    : `<div class="logo logo-fallback">${data.schoolName[0]}</div>`;

  const rows = data.extraRows
    .map((r) => `<div class="row"><span class="k">${r.label}</span><span class="v">${r.value}</span></div>`)
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${data.holderKind} ID — ${data.holderName}</title>
<style>
  :root { --brand: ${brand}; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#0f172a; margin:0; padding:28px; background:#eef2f7; }
  .sheet { display:flex; flex-wrap:wrap; gap:18px; }
  .card {
    width:85.6mm; height:54mm; border-radius:3.2mm; overflow:hidden; background:#fff;
    position:relative; box-shadow:0 6px 20px rgba(15,23,42,.18);
  }

  /* ---------- front ---------- */
  .band { height:15mm; background:linear-gradient(135deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 62%, #000) 100%); color:#fff; padding:2.6mm 4mm; display:flex; align-items:center; gap:2.6mm; }
  .band:after { content:""; position:absolute; top:-6mm; right:-8mm; width:26mm; height:26mm; border-radius:50%; background:rgba(255,255,255,.12); }
  .logo { height:9mm; width:9mm; object-fit:contain; border-radius:1.6mm; background:#fff; flex:none; }
  .logo-fallback { display:flex; align-items:center; justify-content:center; color:var(--brand); font-weight:800; font-size:11pt; }
  .school { margin:0; font-size:8.4pt; font-weight:800; line-height:1.15; letter-spacing:.01em; }
  .kind { margin:.3mm 0 0; font-size:5.6pt; letter-spacing:.16em; text-transform:uppercase; opacity:.9; }
  .body { padding:3.4mm 4mm; display:flex; gap:3.4mm; height:calc(54mm - 15mm - 5mm); }
  .photo { height:26mm; width:21mm; object-fit:cover; border-radius:1.6mm; border:.4mm solid #fff; box-shadow:0 0 0 .3mm #cbd5e1; flex:none; }
  .photo-fallback { display:flex; align-items:center; justify-content:center; background:#e2e8f0; color:#475569; font-size:16pt; font-weight:800; }
  .name { margin:0; font-size:10.5pt; font-weight:800; line-height:1.15; }
  .sub { margin:.6mm 0 2.2mm; font-size:6.8pt; color:#64748b; }
  .idbox { display:inline-block; padding:.8mm 2mm; border-radius:1.2mm; background:color-mix(in srgb, var(--brand) 10%, #fff); border:.25mm solid color-mix(in srgb, var(--brand) 28%, #fff); margin-bottom:1.6mm; }
  .idbox .k { display:block; font-size:5.2pt; letter-spacing:.14em; text-transform:uppercase; color:#64748b; }
  .idbox .v { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:8.6pt; font-weight:700; color:var(--brand); }
  .row { display:flex; gap:2mm; align-items:baseline; }
  .row .k { font-size:5.8pt; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; min-width:14mm; }
  .row .v { font-size:6.9pt; font-weight:600; }
  .foot { position:absolute; left:0; right:0; bottom:0; height:5mm; background:#f1f5f9; border-top:.25mm solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; padding:0 4mm; font-size:5.4pt; color:#64748b; letter-spacing:.06em; text-transform:uppercase; }

  /* ---------- back ---------- */
  .back { padding:4mm; display:flex; flex-direction:column; justify-content:space-between; }
  .stripe { position:absolute; top:6mm; left:0; right:0; height:8mm; background:#0f172a; }
  .back-inner { margin-top:16mm; }
  .back h4 { margin:0 0 1.2mm; font-size:6.4pt; letter-spacing:.14em; text-transform:uppercase; color:var(--brand); }
  .back p { margin:0; font-size:5.9pt; color:#475569; line-height:1.5; }
  .sign { display:flex; align-items:flex-end; justify-content:space-between; gap:3mm; }
  .sign .line { flex:1; border-bottom:.3mm solid #94a3b8; height:5mm; }
  .sign small { font-size:5.2pt; color:#94a3b8; display:block; margin-top:.8mm; letter-spacing:.08em; text-transform:uppercase; }
  .valid { font-size:5.6pt; color:#64748b; white-space:nowrap; text-align:right; }

  .no-print { margin-top:22px; }
  .hint { font-size:12px; color:#64748b; margin:10px 0 0; }

  @page { size: 85.6mm 54mm; margin: 0; }
  @media print {
    body { background:#fff; padding:0; margin:0; }
    .sheet { display:block; gap:0; }
    .no-print, .hint { display:none !important; }
    .card { box-shadow:none; border-radius:0; width:85.6mm; height:54mm; page-break-after:always; break-after:page; }
    .card:last-child { page-break-after:auto; break-after:auto; }
  }
</style></head><body>
  <div class="sheet">
    <div class="card">
      <div class="band">
        ${logoHtml}
        <div style="min-width:0">
          <p class="school">${data.schoolName}</p>
          <p class="kind">${data.holderKind} Identity Card</p>
        </div>
      </div>
      <div class="body">
        ${photoHtml}
        <div style="min-width:0;flex:1">
          <p class="name">${data.holderName}</p>
          <p class="sub">${data.subtitle}</p>
          <div class="idbox"><span class="k">ID Number</span><span class="v">${data.idNumber}</span></div>
          ${rows}
        </div>
      </div>
      <div class="foot">
        <span>${data.validUntil ? `Valid until ${data.validUntil}` : "Property of the school"}</span>
        <span>${data.holderKind}</span>
      </div>
    </div>

    <div class="card back">
      <div class="stripe"></div>
      <div class="back-inner">
        <h4>Conditions of use</h4>
        <p>
          This card remains the property of ${data.schoolName} and must be carried on school premises at all
          times. It is not transferable. If found, please return it to the school office${data.schoolAddress ? ` at ${data.schoolAddress}` : ""}${data.schoolPhone ? ` or call ${data.schoolPhone}` : ""}.
        </p>
      </div>
      <div class="sign">
        <div>
          <div class="line"></div>
          <small>Authorised signature</small>
        </div>
        <span class="valid">${data.idNumber}${data.validUntil ? `<br/>Valid until ${data.validUntil}` : ""}</span>
      </div>
    </div>
  </div>

  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:${brand};color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer">Print ID card</button>
    <p class="hint">Prints at exact card size (85.6 × 54 mm) — front on page 1, back on page 2. In the print dialog choose scale 100% (not “Fit to page”).</p>
  </div>
</body></html>`;

  win.document.write(html);
  win.document.close();
}
