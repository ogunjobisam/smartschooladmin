import { useState } from "react";
import { ArrowLeft, Search, CreditCard, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNaira } from "@/lib/mock-data";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const searchResults = [
  { id: 'STU-002', name: 'Fatima Suleiman', class: 'JSS3', school: 'Ikeja', balance: 110_000_00, invoiceId: 'INV-2026-0002' },
  { id: 'STU-003', name: 'David Okoro', class: 'SS2', school: 'Lekki', balance: 360_000_00, invoiceId: 'INV-2026-0003' },
  { id: 'STU-005', name: 'Ibrahim Musa', class: 'SS3', school: 'Lekki', balance: 280_000_00, invoiceId: 'INV-2026-0005' },
  { id: 'STU-007', name: 'Tunde Bakare', class: 'SS1', school: 'Ikeja', balance: 350_000_00, invoiceId: 'INV-2026-0007' },
];

export default function RecordPayment() {
  const [selectedStudent, setSelectedStudent] = useState<typeof searchResults[0] | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/payments"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <span className="text-sm text-muted-foreground">Payments</span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium">Record Payment</span>
      </div>

      <PageHeader title="Record Payment" description="Search for a student and record a fee payment." />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Student Search */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Find Student</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or ID…" className="pl-9" />
            </div>
            <div className="space-y-1">
              {searchResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted ${selectedStudent?.id === s.id ? 'bg-accent/10 ring-1 ring-accent' : ''}`}
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.id} • {s.class} • {s.school}</p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-destructive">{formatNaira(s.balance)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Payment Form */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h3 className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-accent" /> Payment Details</h3>

            {selectedStudent ? (
              <>
                <div className="rounded-md bg-muted/50 p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{selectedStudent.name}</span>
                    <StatusBadge status="overdue" />
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedStudent.id} • {selectedStudent.class} • {selectedStudent.school}</p>
                  <p className="text-xs">Outstanding: <span className="font-mono font-semibold tabular-nums text-destructive">{formatNaira(selectedStudent.balance)}</span></p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Amount (₦)</Label>
                    <Input type="number" placeholder="0" className="font-mono tabular-nums" />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="transfer">Bank Transfer</SelectItem>
                        <SelectItem value="pos">POS</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Reference Number</Label>
                    <Input placeholder="e.g. TRF-12345" className="font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" defaultValue="2026-03-14" className="tabular-nums" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Allocate to Invoice</Label>
                  <Select defaultValue={selectedStudent.invoiceId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={selectedStudent.invoiceId}>{selectedStudent.invoiceId} — {formatNaira(selectedStudent.balance)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input placeholder="Additional payment notes…" />
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button variant="outline">Cancel</Button>
                  <Button className="gap-1.5"><CheckCircle className="h-4 w-4" /> Record Payment</Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-12 text-center">
                <CreditCard className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Select a student from the list to record a payment.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
