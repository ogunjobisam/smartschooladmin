import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type Status = 'paid' | 'pending' | 'overdue' | 'void' | 'active' | 'inactive' | 'approved' | 'draft';

const statusStyles: Record<Status, string> = {
  paid: "bg-success/10 text-success border-success/20",
  active: "bg-success/10 text-success border-success/20",
  approved: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  draft: "bg-muted text-muted-foreground border-border",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  void: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
};

export const StatusBadge = React.forwardRef<HTMLDivElement, { status: Status }>(
  ({ status }, ref) => {
    return (
      <Badge ref={ref} variant="outline" className={cn("text-[11px] font-medium capitalize", statusStyles[status])}>
        {status}
      </Badge>
    );
  }
);
StatusBadge.displayName = "StatusBadge";
