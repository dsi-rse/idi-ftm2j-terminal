"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";

import { cn } from "@/lib/utils";

type DrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext(caller: string) {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error(`${caller} must be rendered inside <Drawer>`);
  }
  return ctx;
}

type DrawerRootProps = {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /**
   * Width applied at `md` and above while open. Kept a prop rather than a
   * constant because the width is a layout decision belonging to the caller —
   * passing it through `className` instead would collide with the collapsed
   * `md:w-0` under tailwind-merge and break the closed state.
   */
  openWidthClassName?: string;
};

/**
 * The root of the {@link Drawer} compound component. Renders an inline
 * `<aside>` — not a modal overlay — so the drawer participates in the flex
 * layout of the surrounding row and shares its vertical space with the main
 * content.
 *
 * Manages the open/closed state, either uncontrolled (`defaultOpen`) or
 * controlled (`open` + `onOpenChange`).
 */
function DrawerRoot({
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
  openWidthClassName = "md:w-1/4",
  children,
}: PropsWithChildren<DrawerRootProps>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const value = useMemo<DrawerContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, setOpen, toggle],
  );

  return (
    <DrawerContext.Provider value={value}>
      <aside
        data-open={open ? "" : undefined}
        className={cn(
          // Distinct panel background (same tone as the site search input)
          // so the drawer reads as an elevated surface over the page.
          "flex flex-col bg-muted-foreground",
          "transition-[width] duration-200 ease-out",
          // Border + shadow only when open; when collapsed, the drawer
          // renders as an empty zero-width column.
          open && "border-r border-muted/40 shadow-md",
          // Desktop: 1/4 page width when open, 0 when closed.
          // `md:min-w-0` overrides flexbox's default `min-width: auto`,
          // which would otherwise keep the aside sized to its min-content
          // and prevent the closed state from truly collapsing to zero.
          open ? openWidthClassName : "md:w-0 md:min-w-0",
          // Desktop min-height fills the visible page area even when the
          // surrounding flex row is content-sized; drawer can grow taller
          // if content demands it.
          "md:min-h-[calc(100dvh-10rem)]",
          // Mobile: full screen (fixed overlay) when open; hidden when closed.
          open
            ? "fixed inset-0 z-40 w-full md:relative md:inset-auto md:z-auto"
            : "hidden md:relative md:flex",
          className,
        )}
      >
        {children}
      </aside>
    </DrawerContext.Provider>
  );
}
DrawerRoot.displayName = "Drawer.Root";

type DrawerSlotProps = HTMLAttributes<HTMLDivElement>;

/**
 * The header row of the {@link Drawer}. Hidden when the drawer is collapsed.
 */
function DrawerHeader({ className, children, ...props }: DrawerSlotProps) {
  const { open } = useDrawerContext("Drawer.Header");
  if (!open) return null;
  return (
    <div
      {...props}
      className={cn("px-4 py-3 border-b border-muted/25", className)}
    >
      {children}
    </div>
  );
}
DrawerHeader.displayName = "Drawer.Header";

/**
 * The main scrollable body of the {@link Drawer}. Hidden when the drawer is
 * collapsed. Takes remaining vertical space via `flex-1`.
 */
function DrawerBody({ className, children, ...props }: DrawerSlotProps) {
  const { open } = useDrawerContext("Drawer.Body");
  if (!open) return null;
  return (
    <div
      {...props}
      className={cn("flex-1 overflow-y-auto px-4 py-2", className)}
    >
      {children}
    </div>
  );
}
DrawerBody.displayName = "Drawer.Body";

/**
 * The footer row of the {@link Drawer}. Hidden when the drawer is collapsed.
 */
function DrawerFooter({ className, children, ...props }: DrawerSlotProps) {
  const { open } = useDrawerContext("Drawer.Footer");
  if (!open) return null;
  return (
    <div
      {...props}
      className={cn("px-4 py-3 border-t border-muted/25", className)}
    >
      {children}
    </div>
  );
}
DrawerFooter.displayName = "Drawer.Footer";

/**
 * A compound left-side drawer that lives inline in a flex row (between the
 * navbar and footer) alongside the main content. Compose as:
 *
 * ```tsx
 * <Drawer open={open} onOpenChange={setOpen}>
 *   <Drawer.Header>…</Drawer.Header>
 *   <Drawer.Body>…</Drawer.Body>
 *   <Drawer.Footer>…</Drawer.Footer>
 * </Drawer>
 * ```
 */
export const Drawer = Object.assign(DrawerRoot, {
  Root: DrawerRoot,
  Header: DrawerHeader,
  Body: DrawerBody,
  Footer: DrawerFooter,
});
