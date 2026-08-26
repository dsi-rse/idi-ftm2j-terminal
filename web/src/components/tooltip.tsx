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

/**
 * Coordinates all tooltips under it: a shared open/close delay, and — the part
 * that matters here — it groups their timers so one tooltip's popup is torn down
 * before the next opens. Mount once near the app root. Without it, moving
 * between adjacent triggers could leave two popups briefly mounted, which read
 * as a clipped or doubled tooltip.
 */
const TooltipProvider = BaseTooltip.Provider;

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
      <BaseTooltip.Positioner sideOffset={sideOffset} collisionPadding={8}>
        <BaseTooltip.Popup
          {...popupProps}
          className={cn(
            // z-50 keeps the portalled popup above header/section stacking
            // contexts; collisionPadding on the positioner keeps a long body
            // from clipping against the viewport edge near the top of the page.
            "z-50 bg-background border border-muted/25 rounded-sm shadow-md p-3 text-sm text-foreground max-w-xs",
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
  Provider: TooltipProvider,
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
});
