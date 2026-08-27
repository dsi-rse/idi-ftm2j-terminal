"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type PopoverRootProps = ComponentPropsWithoutRef<typeof BasePopover.Root>;

/**
 * The root of the {@link Popover} compound component. Wraps Base UI's
 * `Popover.Root`, which opens on **click/tap** (and dismisses on outside click
 * or Escape) — unlike {@link Tooltip}, which is hover/focus only. Use this for
 * an affordance the user is meant to click, such as an info icon, so it works
 * on touch devices too.
 */
function PopoverRoot(props: PopoverRootProps) {
  return <BasePopover.Root {...props} />;
}
PopoverRoot.displayName = "Popover.Root";

const PopoverTrigger = BasePopover.Trigger;

type PopoverContentProps = {
  title: string;
  className?: string;
  sideOffset?: number;
} & Omit<ComponentPropsWithoutRef<typeof BasePopover.Popup>, "title">;

/**
 * The floating content surface for a {@link Popover}. Styled to match
 * {@link Tooltip} — a small uppercase title above the body — so a click
 * affordance and a hover one read the same. Portalled, collision-aware, and
 * layered above surrounding stacking contexts.
 */
function PopoverContent({
  title,
  className,
  sideOffset = 6,
  children,
  ...popupProps
}: PropsWithChildren<PopoverContentProps>) {
  return (
    <BasePopover.Portal>
      {/* z-index goes on the Positioner (the positioned element); a class on
          the static Popup is ignored. Must beat the sticky tab bar (z-10). */}
      <BasePopover.Positioner
        className="z-50"
        sideOffset={sideOffset}
        collisionPadding={8}
      >
        <BasePopover.Popup
          {...popupProps}
          className={cn(
            "bg-background border border-muted/25 rounded-sm shadow-md p-3 text-sm text-foreground max-w-xs",
            className,
          )}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted font-medium mb-2">
            {title}
          </div>
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
PopoverContent.displayName = "Popover.Content";

/**
 * A compound popover built on Base UI's `Popover`, styled to the site's
 * palette and matching {@link Tooltip}. Opens on click/tap. Compose as:
 *
 * ```tsx
 * <Popover>
 *   <Popover.Trigger render={<InfoButton aria-label="About X" />} />
 *   <Popover.Content title="X">…body…</Popover.Content>
 * </Popover>
 * ```
 */
export const Popover = Object.assign(PopoverRoot, {
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
  Content: PopoverContent,
});
