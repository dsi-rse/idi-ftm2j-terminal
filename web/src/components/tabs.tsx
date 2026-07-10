"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ComponentPropsWithoutRef, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TabsRootProps = ComponentPropsWithoutRef<typeof BaseTabs.Root>;

/**
 * The root of the {@link Tabs} compound component. Wraps Base UI's `Tabs.Root`
 * as a `<div>` container.
 */
function TabsRoot({ className, ...props }: TabsRootProps) {
  return (
    <BaseTabs.Root {...props} className={cn("flex flex-col", className)} />
  );
}
TabsRoot.displayName = "Tabs.Root";

type TabsHeaderProps = ComponentPropsWithoutRef<typeof BaseTabs.List>;

/**
 * The tab strip. Renders Base UI's `Tabs.List` with a bottom border and
 * horizontal gap between triggers.
 */
function TabsHeader({ className, ...props }: TabsHeaderProps) {
  return (
    <BaseTabs.List
      {...props}
      className={cn("flex gap-1 border-b border-muted/25", className)}
    />
  );
}
TabsHeader.displayName = "Tabs.Header";

type TabsTriggerProps = ComponentPropsWithoutRef<typeof BaseTabs.Tab>;

/**
 * A single tab button. Small uppercase text; the selected tab is underlined
 * with the site's primary color.
 */
function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return (
    <BaseTabs.Tab
      {...props}
      className={cn(
        "flex-1 text-left cursor-pointer",
        "px-3 py-2 text-xs text-muted",
        "border-b-2 border-transparent -mb-px",
        "data-[active]:text-primary data-[active]:border-primary",
        "hover:text-foreground transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    />
  );
}
TabsTrigger.displayName = "Tabs.Trigger";

type TabsBodyProps = HTMLAttributes<HTMLDivElement>;

/**
 * A plain container for the tab panels; grows to fill remaining vertical
 * space and scrolls independently.
 */
function TabsBody({ className, ...props }: TabsBodyProps) {
  return (
    <div {...props} className={cn("flex-1 overflow-y-auto py-3", className)} />
  );
}
TabsBody.displayName = "Tabs.Body";

type TabsPanelProps = ComponentPropsWithoutRef<typeof BaseTabs.Panel>;

/**
 * A tab panel — content shown when its matching {@link TabsTrigger} is
 * selected.
 */
function TabsPanel({ className, ...props }: TabsPanelProps) {
  return (
    <BaseTabs.Panel
      {...props}
      className={cn("focus:outline-none", className)}
    />
  );
}
TabsPanel.displayName = "Tabs.Panel";

/**
 * A compound tabs component built on Base UI's `Tabs`, themed to the site.
 * Compose as:
 *
 * ```tsx
 * <Tabs defaultValue="all">
 *   <Tabs.Header>
 *     <Tabs.Trigger value="all">All</Tabs.Trigger>
 *     <Tabs.Trigger value="recent">Recent</Tabs.Trigger>
 *   </Tabs.Header>
 *   <Tabs.Body>
 *     <Tabs.Panel value="all">…</Tabs.Panel>
 *     <Tabs.Panel value="recent">…</Tabs.Panel>
 *   </Tabs.Body>
 * </Tabs>
 * ```
 */
export const Tabs = Object.assign(TabsRoot, {
  Root: TabsRoot,
  Header: TabsHeader,
  Trigger: TabsTrigger,
  Body: TabsBody,
  Panel: TabsPanel,
});
