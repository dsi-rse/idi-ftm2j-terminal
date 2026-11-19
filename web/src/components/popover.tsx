"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type PopoverRootProps = ComponentPropsWithoutRef<typeof BasePopover.Root>;

/**
 * The root of the {@link Popover} compound component. Wraps Base UI's
 * `Popover.Root`. It opens on **click/tap** and, from the trigger below, on
 * hover too, and dismisses on outside click or Escape. Unlike {@link Tooltip},
 * which is hover/focus only and closes when its trigger is clicked, it works on
 * touch devices and survives the click a reader gives an info icon.
 */
function PopoverRoot(props: PopoverRootProps) {
  return <BasePopover.Root {...props} />;
}
PopoverRoot.displayName = "Popover.Root";

type PopoverTriggerProps = ComponentPropsWithoutRef<typeof BasePopover.Trigger>;

/**
 * Opens on click/tap and also on hover, so a mouse reader gets the quick peek a
 * tooltip gives while a tap still works. Base UI keeps a hover-opened popup open
 * while the pointer travels into it, and a click pins it open. Pass
 * `openOnHover={false}` for a trigger that should open on click only.
 */
function PopoverTrigger(props: PopoverTriggerProps) {
  return <BasePopover.Trigger openOnHover delay={200} {...props} />;
}
PopoverTrigger.displayName = "Popover.Trigger";

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
            "bg-background border border-muted/25 rounded-card shadow-md p-3 text-sm text-foreground max-w-xs",
            className,
          )}
        >
          <div className="type-label mb-2">
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
 * palette and matching {@link Tooltip}. Opens on click/tap and on hover.
 * Compose as:
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
