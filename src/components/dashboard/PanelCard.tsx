import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TONE, type Tone } from "@/components/dashboard/tones";

interface PanelCardProps {
  /**
   * The small gold label above the title — "Events", "Finance", "Academic
   * Insight". Says what kind of thing this is; the title says which one.
   */
  eyebrow?: string;
  /** Title case, not upper case — the display face supplies the small caps. */
  title: ReactNode;
  icon?: LucideIcon;
  /** The icon tile's colour — see `tones.ts`. Defaults to the brand navy. */
  tone?: Tone;
  /** Right of the title, before the icon tile: a filter, a link, a count. */
  action?: ReactNode;
  children: ReactNode;
  /** Drop the body padding when the content manages its own — a table, a chart. */
  flush?: boolean;
  className?: string;
}

/**
 * The workhorse container: a cream header band carrying an eyebrow, a title and
 * an icon tile, over a white body.
 *
 * Distinct from a plain `Card` in that the header is a *band* — filled and
 * separated by a hairline — which is what lets several of these stack down a
 * page without the eye losing track of where one ends.
 */
export function PanelCard({
  eyebrow,
  title,
  icon: Icon,
  tone = "navy",
  action,
  children,
  flush,
  className,
}: PanelCardProps) {
  return (
    <Card className={cn("overflow-hidden border-border/70 shadow-royal", className)}>
      <div className="flex items-start gap-3 border-b border-border/70 bg-[hsl(var(--panel-band))] px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            // gold-ink, not gold: this is small text on cream and has to stay
            // readable. The decorative gold is reserved for rules and tiles.
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-ink">
              {eyebrow}
            </p>
          )}
          <h3 className="font-display mt-0.5 truncate text-base font-semibold text-primary sm:text-lg">
            {title}
          </h3>
        </div>

        {action}

        {Icon && (
          <span
            aria-hidden
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-tile",
              TONE[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>

      <div className={cn(!flush && "p-4 sm:p-5")}>{children}</div>
    </Card>
  );
}
