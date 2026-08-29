import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
  mono?: boolean;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, className, mono = false }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">{title}</p>
          {/* Long money values (₦435,000,000) must shrink and wrap rather than
              run under the icon on a narrow screen. */}
          <p
            className={cn(
              "break-all text-lg font-bold leading-tight tracking-tight text-card-foreground sm:text-2xl",
              mono && "font-mono tabular-nums"
            )}
          >
            {value}
          </p>
          {subtitle && <p className="text-[11px] text-muted-foreground sm:text-xs">{subtitle}</p>}
          {trend && (
            <p className={cn("text-[11px] font-medium sm:text-xs", trend.positive ? "text-success" : "text-destructive")}>
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-lg bg-accent/10 p-2 sm:p-2.5">
          <Icon className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
        </div>
      </div>
    </div>
  );
}
