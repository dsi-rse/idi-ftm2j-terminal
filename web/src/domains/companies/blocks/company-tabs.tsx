"use client";

import { useEffect, useState } from "react";

import { SCROLL_PANE_ATTR } from "@/layouts";
import { cn } from "@/lib/utils";

type SectionTab = {
  id: string;
  label: string;
};

const TABS: SectionTab[] = [
  { id: "overview", label: "Overview" },
  { id: "tree", label: "Tree" },
  { id: "holders", label: "Holders" },
  { id: "debt", label: "Debt" },
];

/**
 * The company detail page's section-nav strip. Each tab is an in-page
 * anchor link that smooth-scrolls to its matching section id (`#overview`,
 * `#tree`, `#holders`, `#debt`).
 *
 * The active tab is highlighted based on which section is currently
 * intersecting the viewport (top-third heuristic). Right-side "Export CSV"
 * and "Cite" buttons are stubs for now.
 */
export function CompanyTabs() {
  const [active, setActive] = useState<string>(TABS[0].id);

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

    let observer: IntersectionObserver | undefined;

    const connect = () => {
      observer?.disconnect();
      const sections = TABS.map((tab) => document.getElementById(tab.id)).filter(
        (el): el is HTMLElement => Boolean(el),
      );
      if (sections.length === 0) return;
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible[0]) setActive(visible[0].target.id);
        },
        {
          root: resolveRoot(),
          rootMargin: "-25% 0px -60% 0px",
          threshold: [0, 0.25, 0.5, 1],
        },
      );
      sections.forEach((section) => observer?.observe(section));
    };

    connect();

    // Crossing the breakpoint changes which element scrolls, so the observer
    // has to be rebuilt with the new root.
    const query = window.matchMedia("(min-width: 768px)");
    query.addEventListener("change", connect);
    return () => {
      query.removeEventListener("change", connect);
      observer?.disconnect();
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
    <nav
      aria-label="Company sections"
      className="sticky top-0 z-10 flex items-end justify-between gap-4 border-b border-muted/25 bg-background/95 backdrop-blur"
    >
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
                {tab.label}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="hidden md:flex items-center gap-2 pb-1">
        {/* TODO: wire export / cite actions */}
        <button
          type="button"
          className="font-mono text-[11px] uppercase tracking-wider text-muted hover:text-foreground px-2 py-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Export CSV
        </button>
        <button
          type="button"
          className="font-mono text-[11px] uppercase tracking-wider text-muted hover:text-foreground px-2 py-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Cite
        </button>
      </div>
    </nav>
  );
}
