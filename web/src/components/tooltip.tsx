"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type TooltipRootProps = ComponentPropsWithoutRef<typeof BaseTooltip.Root>;

/**
 * The root of the {@link Tooltip} compound component. Wraps Base UI's
 * `Tooltip.Root`; hover, focus, and press interactions on the trigger
 * open the tooltip.
 */
function TooltipRoot(props: TooltipRootProps) {
  return <BaseTooltip.Root {...props} />;
}
TooltipRoot.displayName = "Tooltip.Root";

const TooltipTrigger = BaseTooltip.Trigger;

type TooltipContentProps = {
  title: string;
  className?: string;
  sideOffset?: number;
} & Omit<ComponentPropsWithoutRef<typeof BaseTooltip.Popup>, "title">;

/**
 * The floating content surface for a {@link Tooltip}. Renders a small
 * uppercase title above the body (passed as `children`), portalled and
 * positioned relative to the trigger.
 */
function TooltipContent({
  title,
  className,
  sideOffset = 6,
  children,
  ...popupProps
}: PropsWithChildren<TooltipContentProps>) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset}>
        <BaseTooltip.Popup
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
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
TooltipContent.displayName = "Tooltip.Content";

/**
 * A compound tooltip built on Base UI's `Tooltip`, styled to the site's
 * palette. Compose as:
 *
 * ```tsx
 * <Tooltip>
 *   <Tooltip.Trigger render={<button>Info</button>} />
 *   <Tooltip.Content title="Details">…body…</Tooltip.Content>
 * </Tooltip>
 * ```
 */
export const Tooltip = Object.assign(TooltipRoot, {
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
});
