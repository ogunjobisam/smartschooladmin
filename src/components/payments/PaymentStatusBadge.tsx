import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  initiated: { label: "Initiated", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "status-pending" },
  successful: { label: "Successful", className: "status-paid" },
  failed: { label: "Failed", className: "status-overdue" },
  reversed: { label: "Reversed", className: "bg-muted text-muted-foreground" },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.initiated;
  return (
    <Badge variant="secondary" className={cn("text-[11px]", config.className)}>
      {config.label}
    </Badge>
  );
}
