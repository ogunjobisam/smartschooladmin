import { buildPayslipHtml } from "@/lib/payslip";
const school = { name: "Smartever School of Life", address: "12 Ade Ola Street, Ikeja, Lagos", phone: "+234 801 234 5678", email: "office@smartever.ng" };
const html = buildPayslipHtml({ school, currency: "NGN", staffName: "Mrs Adebimpe Okonkwo", staffId: "STF-0012", department: "Science", position: "Senior Teacher", periodLabel: "August 2026", runDate: "2026-08-28", status: "paid", basic: 250000, allowances: 65000, deductions: 42500, pension: 20000, tax: 20000, netPay: 272500, bankName: "GTBank", accountNumber: "0123456789" }, { preview: true });
await Bun.write("/tmp/browser/doc/payslip.html", html);
