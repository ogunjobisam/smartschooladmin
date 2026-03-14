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
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${formatNaira(p.amount)}</td>
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
    <p style="margin:4px 0"><span style="color:#64748b">Total:</span> <strong style="font-family:monospace">${formatNaira(data.totalAmount)}</strong></p>
    <p style="margin:4px 0"><span style="color:#64748b">Paid:</span> <span style="font-family:monospace;color:#16a34a">${formatNaira(data.totalPaid)}</span></p>
    <p style="margin:4px 0;font-size:16px"><span style="color:#64748b">Balance Due:</span> <strong style="font-family:monospace;color:${data.balance > 0 ? '#dc2626' : '#16a34a'}">${formatNaira(data.balance)}</strong></p>
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
}

export function printReceipt(data: ReceiptPrintData) {
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
          <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${formatNaira(a.amount)}</td>
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
      <p style="margin:4px 0;font-size:28px;font-weight:700;font-family:monospace;color:#16a34a">${formatNaira(data.amount)}</p>
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
