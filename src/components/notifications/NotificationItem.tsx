import { formatDistanceToNow } from "date-fns";
import { Bell, FileText, CreditCard, AlertTriangle, UserPlus, Calculator, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationItemProps {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  onClick?: () => void;
}

const typeIcons: Record<string, typeof Bell> = {
  invoice_generated: FileText,
  payment_received: CreditCard,
  overdue_reminder: AlertTriangle,
  guardian_invite: UserPlus,
  staff_invite: UserPlus,
  payroll_pending: Calculator,
  approval_result: CheckSquare,
};

export function NotificationItem({ type, title, message, isRead, createdAt, onClick }: NotificationItemProps) {
  const Icon = typeIcons[type] || Bell;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        !isRead && "bg-accent/5"
      )}
    >
      <div className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        !isRead ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-sm", !isRead && "font-medium")}>{title}</p>
          {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
        </div>
        {message && <p className="mt-0.5 truncate text-xs text-muted-foreground">{message}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </p>
      </div>
    </button>
  );
}
