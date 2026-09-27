import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  /**
   * Written in ordinary title case — "Fee Intelligence", not "FEE
   * INTELLIGENCE". The display face renders lowercase as small capitals, so
   * upper-casing here would flatten the two letter heights that give the
   * heading its shape.
   */
  children: ReactNode;
  /** Right-hand note, e.g. "Updated 10:49:16 AM". */
  meta?: ReactNode;
  className?: string;
}

/**
 * The rule that separates one band of a page from the next: a gold diamond, the
 * title, an optional note, then a gold rule running to the edge.
 *
 * Used instead of a bare <h2> so the bands stay identical across pages — the
 * thing that makes a long dashboard read as one document rather than a stack of
 * unrelated cards.
 */
export function SectionHeading({ children, meta, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Decorative: the heading text already names the section. */}
      <span aria-hidden className="text-sm leading-none text-gold">◆</span>

      <h2 className="font-display text-lg font-semibold tracking-wide text-primary sm:text-xl">
        {children}
      </h2>

      {meta && (
        <span className="font-display whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
          {meta}
        </span>
      )}

      {/* Fades out rather than stopping dead, so it reads as a flourish. */}
      <span
        aria-hidden
        className="h-px min-w-6 flex-1 bg-gradient-to-r from-gold/70 to-gold/0"
      />
    </div>
  );
}
