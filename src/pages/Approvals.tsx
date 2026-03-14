import { CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatNaira, pendingApprovals } from "@/lib/mock-data";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell
} from "@/components/ui/table";

export default function Approvals() {
  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Review and approve pending requests." />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Requester</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingApprovals.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.type}</TableCell>
                <TableCell className="max-w-xs text-sm">{a.description}</TableCell>
                <TableCell className="text-muted-foreground">{a.requester}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{a.date}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">{formatNaira(a.amount)}</TableCell>
                <TableCell><StatusBadge status="pending" /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="default" className="h-7 text-xs">Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs">Reject</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
