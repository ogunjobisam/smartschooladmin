import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { TONE, type Tone } from "@/components/dashboard/tones";

export type StatTone = Tone;

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  /**
   * The icon tile's colour. Pass one per card down a grid so the metrics tell
   * each other apart — see `tones.ts`. Defaults to the brand navy, which is
   * right for a lone card and wrong for a row of eight.
   */
  tone?: StatTone;
  className?: string;
  mono?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  tone = "navy",
  className,
  mono = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        // The gold left edge is the card's signature; `overflow-hidden` keeps it
        // inside the rounded corner instead of poking past it.
        "relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 pl-5 shadow-royal sm:p-5 sm:pl-6",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gold" />

      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-tile", TONE[tone])}
        >
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
            {title}
          </p>
          {/* Long money values (₦435,000,000) must shrink and wrap rather than
              run under the icon on a narrow screen. */}
          <p
            className={cn(
              "break-all text-xl font-bold leading-tight text-primary sm:text-2xl",
              mono ? "font-mono tabular-nums" : "font-display",
            )}
          >
            {value}
          </p>
          {subtitle && <p className="text-[11px] text-muted-foreground sm:text-xs">{subtitle}</p>}
          {trend && (
            <p
              className={cn(
                "text-[11px] font-medium sm:text-xs",
                trend.positive ? "text-success" : "text-destructive",
              )}
            >
              {trend.positive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
