"use client";

import { useEffect, useRef, useState } from "react";

import {
  CalendarClock,
  LayoutGrid,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";

import { SCROLL_PANE_ATTR } from "@/layouts";
import { cn } from "@/lib/utils";

type SectionTab = {
  id: string;
  label: string;
  Icon: LucideIcon;
};

const TABS: SectionTab[] = [
  { id: "overview", label: "Overview", Icon: LayoutGrid },
  { id: "tree", label: "Tree", Icon: Network },
  { id: "holders", label: "Holders", Icon: Users },
  { id: "debt", label: "Debt", Icon: CalendarClock },
];

/**
 * The company detail page's section-nav strip. Each tab is an in-page
 * anchor link that smooth-scrolls to its matching section id (`#overview`,
 * `#tree`, `#holders`, `#debt`).
 *
 * The active tab is the last section whose top has scrolled past the pinned
 * bar. Right-side "Export CSV" and "Cite" buttons are stubs for now.
 */
type CompanyTabsProps = {
  /** Shown alongside the tabs once the bar sticks and the page header is gone. */
  companyName: string;
};

export function CompanyTabs({ companyName }: CompanyTabsProps) {
  const [active, setActive] = useState<string>(TABS[0].id);
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    /**
     * The sections scroll inside TerminalShell's pane on desktop and inside the
     * document below `md`. An observer rooted at the viewport never fires
     * correctly in the first case, so resolve the root from what is actually
     * scrolling — checked via computed `overflow-y`, because the breakpoint is
     * expressed in CSS and this must not duplicate it in JS.
     */
    const resolveRoot = (): Element | null => {
      const pane = document.querySelector(`[${SCROLL_PANE_ATTR}]`);
      if (!pane) return null;
      const overflowY = getComputedStyle(pane).overflowY;
      return overflowY === "auto" || overflowY === "scroll" ? pane : null;
    };

    /**
     * Height of the pinned tab bar, which overlaps content. The threshold for
     * "this section is current" sits just below it, matching `scroll-mt-16` on
     * the section cards and where tab clicks actually land a section.
     */
    const STICKY_OFFSET = 72;

    /**
     * The active section is the last one whose top has passed the threshold —
     * the same rule the design uses. Deliberately not an IntersectionObserver
     * ratio contest: a narrow observation band lets a lower section win while
     * the visually current one still fills the top of the screen, and leaves
     * the highlight stale whenever nothing intersects the band at all.
     */
    const computeActive = () => {
      const root = resolveRoot();
      const referenceTop = root
        ? root.getBoundingClientRect().top
        : 0;
      const threshold = referenceTop + STICKY_OFFSET;

      let current = TABS[0].id;
      for (const tab of TABS) {
        const el = document.getElementById(tab.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= threshold) current = tab.id;
      }
      setActive(current);
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        computeActive();
      });
    };

    let scroller: Element | Window = window;
    const connect = () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller = resolveRoot() ?? window;
      scroller.addEventListener("scroll", onScroll, { passive: true });
      computeActive();
    };

    // A zero-height sentinel sits in normal flow directly above the sticky bar.
    // Once it scrolls out of view the bar is pinned, which is when the company
    // name should appear beside the tabs. Deriving it this way keeps the tab bar
    // independent of the page header's markup.
    let stuckObserver: IntersectionObserver | undefined;
    const watchSentinel = () => {
      stuckObserver?.disconnect();
      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      stuckObserver = new IntersectionObserver(
        ([entry]) => setIsStuck(!entry.isIntersecting),
        { root: resolveRoot(), threshold: 0 },
      );
      stuckObserver.observe(sentinel);
    };

    const connectAll = () => {
      connect();
      watchSentinel();
    };

    connectAll();

    // Crossing the breakpoint changes which element scrolls, so the scroll
    // listener and the sentinel observer both have to be rebound to the new one.
    const query = window.matchMedia("(min-width: 768px)");
    query.addEventListener("change", connectAll);
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      query.removeEventListener("change", connectAll);
      window.removeEventListener("resize", onScroll);
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      stuckObserver?.disconnect();
    };
  }, []);

  const handleClick = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <nav
        aria-label="Company sections"
        className="sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-muted/25 bg-background/95 backdrop-blur"
      >
        <div className="flex min-w-0 items-end gap-4">
          {/* Only while pinned — unpinned, the page header already shows it. */}
          <span
            aria-hidden={!isStuck}
            className={cn(
              "font-inter-tight truncate pb-1.5 text-base font-semibold text-foreground transition-opacity",
              isStuck ? "opacity-100" : "sr-only opacity-0",
            )}
          >
            {companyName}
          </span>
          <ul className="flex gap-1 list-none m-0 p-0">
            {TABS.map((tab) => {
              const isActive = active === tab.id;
              return (
                <li key={tab.id}>
                  <a
                    href={`#${tab.id}`}
                    onClick={handleClick(tab.id)}
                    className={cn(
                      "inline-flex items-center px-3 py-2 text-xs cursor-pointer",
                      "border-b-2 -mb-px transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      isActive
                        ? "text-primary border-primary"
                        : "text-muted border-transparent hover:text-foreground",
                    )}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <tab.Icon aria-hidden className="mr-1.5 size-3.5" />
                    {tab.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="hidden md:flex items-center gap-2 pb-1">
          {/* Presentation only — these remain unwired on purpose. `disabled`
              rather than styled-to-look-active, so they do not promise a
              behaviour that does not exist yet. */}
          {["Export CSV", "Cite"].map((action) => (
            <button
              key={action}
              type="button"
              disabled
              title="Not available yet"
              className="rounded-sm border border-muted/40 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted disabled:cursor-not-allowed"
            >
              {action}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
