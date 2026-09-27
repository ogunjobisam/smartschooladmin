import * as React from "react";
import { LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon = Inbox, title, description, actionLabel, onAction }, ref) => {
    return (
      <div
        ref={ref}
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gold/45 bg-gold-soft/25 py-14 text-center"
      >
        <div className="rounded-full bg-gold-soft p-4">
          <Icon className="h-8 w-8 text-gold-ink" />
        </div>
        <h3 className="font-display mt-4 text-lg font-semibold text-primary">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        {actionLabel && onAction && (
          <Button onClick={onAction} className="mt-4" size="sm">{actionLabel}</Button>
        )}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";
