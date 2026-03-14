import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";

interface PayslipData {
  staffName: string;
  staffId: string;
  department: string;
  position: string;
  periodLabel: string;
  runDate: string;
  basic: number;
  allowances: number;
  deductions: number;
  netPay: number;
  bankName?: string;
  accountNumber?: string;
  schoolName: string;
}

export function PayslipView({ data }: { data: PayslipData }) {
  const { formatMoney: formatAmount } = useCurrency();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Payslip - ${data.staffName}</title>
      <style>
        body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
        .header h1 { font-size: 18px; margin: 0; }
        .header p { font-size: 12px; color: #64748b; margin: 4px 0 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .field { font-size: 12px; }
        .field .label { color: #64748b; margin-bottom: 2px; }
        .field .value { font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
        th { background: #f8fafc; font-weight: 600; }
        .total { font-weight: 700; font-size: 14px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 32px; }
      </style></head><body>
      ${content.innerHTML}
      <div class="footer">This is a computer-generated payslip and does not require a signature.</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Payslip</CardTitle>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-3.5 w-3.5" /> Print
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={printRef}>
          <div className="header mb-4 border-b pb-4 text-center">
            <h1 className="text-lg font-bold">{data.schoolName}</h1>
            <p className="text-sm text-muted-foreground">Payslip for {data.periodLabel}</p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Employee:</span> <strong>{data.staffName}</strong></div>
            <div><span className="text-muted-foreground">Staff ID:</span> <strong>{data.staffId || "N/A"}</strong></div>
            <div><span className="text-muted-foreground">Department:</span> <strong>{data.department || "N/A"}</strong></div>
            <div><span className="text-muted-foreground">Position:</span> <strong>{data.position || "N/A"}</strong></div>
            <div><span className="text-muted-foreground">Pay Date:</span> <strong>{data.runDate}</strong></div>
            {data.bankName && <div><span className="text-muted-foreground">Bank:</span> <strong>{data.bankName} — ****{data.accountNumber?.slice(-4)}</strong></div>}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="px-3 py-2">Basic Salary</td><td className="px-3 py-2 text-right">{formatAmount(data.basic)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2">Allowances</td><td className="px-3 py-2 text-right">{formatAmount(data.allowances)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2 font-medium">Gross Pay</td><td className="px-3 py-2 text-right font-medium">{formatAmount(data.basic + data.allowances)}</td></tr>
              <tr className="border-b"><td className="px-3 py-2">Deductions (Tax, Pension, etc.)</td><td className="px-3 py-2 text-right text-destructive">-{formatAmount(data.deductions)}</td></tr>
              <tr className="border-b bg-muted/20">
                <td className="px-3 py-2 font-bold">Net Pay</td>
                <td className="px-3 py-2 text-right font-bold">{formatAmount(data.netPay)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
