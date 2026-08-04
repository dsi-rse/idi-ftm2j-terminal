import { PropsWithChildren, ReactNode } from "react";

import { Footer } from "@/views/footer";
import { Navbar } from "@/views/navbar";

/**
 * Marks the element that scrolls in this shell. Read by consumers that need to
 * observe scroll position — see `company-tabs.tsx`, which uses it as its
 * IntersectionObserver root.
 */
export const SCROLL_PANE_ATTR = "data-scroll-pane";

type TerminalShellProps = {
  /**
   * Fixed-width column rendered to the left of the content pane on desktop,
   * hidden below the breakpoint. Callers are expected to provide their own
   * narrow-viewport affordance (the companies route uses a drawer).
   */
  sidebar?: ReactNode;
};

/**
 * The terminal layout: navigation pinned to the top, an optional fixed sidebar,
 * and a content pane that scrolls on its own.
 *
 * Distinct from {@link StandardPageLayout}, which scrolls the document and
 * suits ordinary content pages. This shell is for the dense, app-like views
 * where the chrome should stay put while data scrolls under it.
 *
 * Below `md` the shell deliberately reverts to document scroll: a nested pane
 * inside a short mobile viewport fights the browser's own scrolling and address
 * bar behaviour. Anything reading {@link SCROLL_PANE_ATTR} must therefore cope
 * with the pane not being the scroller — check its computed `overflow-y` rather
 * than assuming.
 *
 * The footer sits inside the pane, so it scrolls with the content rather than
 * pinning to the viewport bottom.
 */
export function TerminalShell({
  sidebar,
  children,
}: PropsWithChildren<TerminalShellProps>) {
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <div className="shrink-0">
        <Navbar />
      </div>
      <div className="flex flex-1 md:min-h-0">
        {sidebar ? (
          <aside className="hidden shrink-0 md:block">{sidebar}</aside>
        ) : null}
        {/* `tabIndex` is load-bearing, not decoration. Once the document stops
            scrolling, a keyboard user with focus on <body> has nothing to
            scroll — PageDown and the arrow keys do nothing. Making the pane
            focusable restores that, and the region role plus label keep it a
            sensible stop for screen readers rather than an unnamed one. */}
        <div
          {...{ [SCROLL_PANE_ATTR]: "" }}
          tabIndex={0}
          role="region"
          aria-label="Content"
          className="flex min-w-0 flex-1 flex-col focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:overflow-y-auto"
        >
          {children}
          <Footer />
        </div>
      </div>
    </div>
  );
}
