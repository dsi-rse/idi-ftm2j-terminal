import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type FeatureCardGridProps = HTMLAttributes<HTMLDivElement>;

/**
 * A row of {@link FeatureCard}s: one column on narrow screens, one per card
 * from `md` up.
 */
function FeatureCardGrid({ className, ...props }: FeatureCardGridProps) {
  return (
    <div
      {...props}
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-3", className)}
    />
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
 * icon, a display-face title, and a sentence of prose. Used on the landing
 * page to say what a company page holds before the reader opens one.
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
        "flex flex-col gap-3 rounded-sm border border-muted/25 bg-overlay/40 p-5",
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-6 text-primary")} />
      <h3 className={cn("type-display text-base")}>{title}</h3>
      <p className={cn("type-body m-0")}>{children}</p>
    </div>
  );
}
FeatureCardRoot.displayName = "FeatureCard";

export const FeatureCard = Object.assign(FeatureCardRoot, {
  Root: FeatureCardRoot,
  Grid: FeatureCardGrid,
});
