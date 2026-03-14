import { ClipboardList, Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";

const reports = [
  { id: 'rpt-1', name: 'Proprietor Weekly Summary', description: 'High-level overview of fees, payroll, and key metrics across all schools.', category: 'Executive' },
  { id: 'rpt-2', name: 'Monthly Fee Collection Report', description: 'Detailed breakdown of fees collected by class, school, and payment method.', category: 'Finance' },
  { id: 'rpt-3', name: 'Outstanding Fees Report', description: 'All unpaid and overdue invoices with ageing analysis.', category: 'Finance' },
  { id: 'rpt-4', name: 'Payroll Summary Report', description: 'Summary of payroll runs, gross/net amounts, and deductions by school.', category: 'HR' },
  { id: 'rpt-5', name: 'Student Enrolment Report', description: 'Current enrolment counts by class, school, and status.', category: 'Academic' },
  { id: 'rpt-6', name: 'Exceptions Report', description: 'All fee waivers, arrears exceptions, and salary change requests.', category: 'Governance' },
];

export default function Reports() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Generate and download operational reports." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <div key={r.id} className="flex flex-col justify-between rounded-lg border bg-card p-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{r.category}</span>
              </div>
              <h3 className="text-sm font-semibold text-card-foreground">{r.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Download className="h-3 w-3" /> CSV</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Download className="h-3 w-3" /> PDF</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
