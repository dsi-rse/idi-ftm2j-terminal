import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type FeatureCardGridProps = HTMLAttributes<HTMLDivElement>;

/**
 * A stack of {@link FeatureCard}s. Single column by default -- the cards are
 * horizontal, so they read as a list and fit a narrow column; pass
 * `md:grid-cols-3` via `className` where there is room to set them abreast.
 */
function FeatureCardGrid({ className, ...props }: FeatureCardGridProps) {
  return (
    <div {...props} className={cn("grid grid-cols-1 gap-3", className)} />
  );
}
FeatureCardGrid.displayName = "FeatureCard.Grid";

type FeatureCardProps = {
  /** Icon drawn in the accent colour above the title. */
  icon: LucideIcon;
  title: string;
  className?: string;
};

/**
 * A bordered card naming one kind of information the site carries: an accent
 * icon beside a display-face title and a sentence of prose. Used on the
 * landing page to say what a company page holds before the reader opens one.
 */
function FeatureCardRoot({
  icon: Icon,
  title,
  className,
  children,
}: PropsWithChildren<FeatureCardProps>) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-sm border border-muted/25 bg-overlay/40 p-4",
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0 text-primary")} />
      <div className={cn("flex min-w-0 flex-col gap-1")}>
        <h3 className={cn("type-display text-base")}>{title}</h3>
        <p className={cn("type-body m-0")}>{children}</p>
      </div>
    </div>
  );
}
FeatureCardRoot.displayName = "FeatureCard";

export const FeatureCard = Object.assign(FeatureCardRoot, {
  Root: FeatureCardRoot,
  Grid: FeatureCardGrid,
});
