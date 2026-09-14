"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Drawer } from "@/components/drawer";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { Tabs } from "@/components/tabs";
import { Popover } from "@/components/popover";

import type { CompanySearchHookReturn } from "../hooks/use-all-companies-search";
import {
  PAGE_SIZE,
  useAllCompaniesSearch,
} from "../hooks/use-all-companies-search";
import { useRecentCompaniesSearch } from "../hooks/use-recent-companies-search";
import { useSavedCompaniesSearch } from "../hooks/use-saved-companies-search";
import {
  clampInspectorWidth,
  INSPECTOR_WIDTH_DEFAULT,
  INSPECTOR_WIDTH_MAX,
  INSPECTOR_WIDTH_MIN,
  useCompaniesStore,
} from "../stores/companies";
import { SearchResult } from "./search-result";
import { CircleQuestionMark, Search } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type InspectorHandleProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & { "aria-label": string };

/**
 * The tab that opens and closes the company search rail. One component for
 * both states so the two are visually identical apart from where they sit:
 * a gold tab carrying the search glyph, which reads as "company search" in
 * either direction rather than as an arrow that points the wrong way once the
 * rail has moved. Desktop-only: below `md` the rail is a full-screen sheet.
 *
 * Callers position it via `className` (`absolute` on the rail's edge while
 * open, `fixed` to the viewport edge while closed).
 */
function InspectorHandle({ className, ...props }: InspectorHandleProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "hidden md:flex items-center justify-center w-6 h-20 rounded-r-md",
        "bg-primary text-primary-foreground shadow-md cursor-pointer",
        "hover:brightness-110 hover:shadow-lg transition-all duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
        className,
      )}
    >
      <Search className={cn("size-4")} />
    </button>
  );
}

type PanelBodyProps = {
  emptyMessage: string;
  loadingMessage?: string;
  data: CompanySearchHookReturn;
  activeCompanyId?: string;
};

function PanelBody({
  emptyMessage,
  loadingMessage,
  data,
  activeCompanyId,
}: PanelBodyProps) {
  const {
    results,
    totalPages,
    currentPage,
    pageSize,
    isLoading,
    onPageChange,
  } = data;

  if (isLoading && results.length === 0) {
    return (
      <p className="px-4 py-3 type-caption">
        {loadingMessage ?? "Loading…"}
      </p>
    );
  }

  if (results.length === 0) {
    return <p className="px-4 py-3 type-caption">{emptyMessage}</p>;
  }

  const startIndex = (currentPage - 1) * pageSize;
  const start = startIndex + 1;
  const end = startIndex + results.length;
  const rangeText = start === end ? `${start}` : `${start}-${end}`;
  const noun = data.totalCount === 1 ? "result" : "results";

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-3 py-2 border-b border-muted/25">
        <span className="type-label tracking-label-wide text-foreground">
          Results
        </span>
        <span
          className="type-caption"
          title={`Viewing ${rangeText} of ${data.totalCount} ${noun}`}
        >
          {data.totalCount}
        </span>
      </div>
      {results.map((company, i) => (
        <SearchResult
          key={company.permId}
          index={startIndex + i + 1}
          rankWidth={end.toString().length}
          company={company}
          viewedAt={company.viewedAt}
          matches={company.matches}
          nameSegments={company.nameSegments}
          countrySegments={company.countrySegments}
          sectorSegments={company.sectorSegments}
          tickerSegments={company.tickerSegments}
          permIdSegments={company.permIdSegments}
          matchHint={company.matchHint}
          active={company.permId === activeCompanyId}
        />
      ))}
      {totalPages > 1 && (
        <div className="p-3">
          <Pagination
            compact
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}

const RESIZE_KEY_STEP = 16;

/**
 * Whether the persisted store has been read back from IndexedDB. The storage
 * is asynchronous, so the first paint uses the default width; until the real
 * one arrives the width transition is held off so the rail snaps to the
 * persisted width once rather than animating there on every load.
 */
function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(() =>
    useCompaniesStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (useCompaniesStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useCompaniesStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
  }, []);
  return hydrated;
}

type ResizeHandleProps = {
  width: number;
  onResize: (width: number) => void;
  onResizeStart: () => void;
  /** Called with the final width, so the caller commits what was last
   *  applied rather than whatever its state held at the previous render. */
  onResizeEnd: (width: number) => void;
};

/**
 * The strip on the rail's right edge that drags its width. Base UI has no
 * splitter primitive, so the pointer handling is written out: capture the
 * pointer on press, apply the delta to the width the drag started from, and
 * release on lift or cancel. Exposed as a vertical separator whose value is
 * the width, with arrow keys for keyboard users. Desktop-only, like the rail
 * width itself.
 */
function ResizeHandle({
  width,
  onResize,
  onResizeStart,
  onResizeEnd,
}: ResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // The last width handed to onResize. A move and the release that follows
  // it can land in one tick, before React has re-rendered with the new
  // width, so the release reads it from here rather than from props.
  const last = useRef(width);
  const apply = (next: number) => {
    last.current = next;
    onResize(next);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize company search"
      aria-valuenow={width}
      aria-valuemin={INSPECTOR_WIDTH_MIN}
      aria-valuemax={INSPECTOR_WIDTH_MAX}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width };
        last.current = width;
        onResizeStart();
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        apply(
          clampInspectorWidth(
            drag.current.startWidth + event.clientX - drag.current.startX,
          ),
        );
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onResizeEnd(last.current);
      }}
      onPointerCancel={() => {
        if (!drag.current) return;
        drag.current = null;
        onResizeEnd(last.current);
      }}
      onKeyDown={(event) => {
        const delta =
          event.key === "ArrowRight"
            ? RESIZE_KEY_STEP
            : event.key === "ArrowLeft"
              ? -RESIZE_KEY_STEP
              : event.key === "Home"
                ? INSPECTOR_WIDTH_MIN - width
                : event.key === "End"
                  ? INSPECTOR_WIDTH_MAX - width
                  : 0;
        if (delta === 0) return;
        event.preventDefault();
        onResizeEnd(clampInspectorWidth(width + delta));
      }}
      className={cn(
        "absolute inset-y-0 right-0 z-10 hidden w-1.5 -mr-0.5 cursor-col-resize md:block",
        "hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none transition-colors",
      )}
    />
  );
}

type CompanySearchDrawerProps = {
  /**
   * The current company's position in the ALL tab's browse order (see
   * `browseRank`), so the rail opens on the page that holds it and the row is
   * highlighted rather than the list sitting on page 1 regardless.
   */
  activeRank?: number | null;
};

export function CompanySearchDrawer({ activeRank }: CompanySearchDrawerProps) {
  const searchQuery = useCompaniesStore((s) => s.searchQuery);
  const setPage = useCompaniesStore((s) => s.setPage);
  const setSearchQuery = useCompaniesStore((s) => s.setSearchQuery);
  const activeTab = useCompaniesStore((s) => s.activeTab);
  const setActiveTab = useCompaniesStore((s) => s.setActiveTab);
  const isInspectorOpen = useCompaniesStore((s) => s.isInspectorOpen);
  const setInspectorOpen = useCompaniesStore((s) => s.setInspectorOpen);
  const storedWidth = useCompaniesStore((s) => s.inspectorWidth);
  const setInspectorWidth = useCompaniesStore((s) => s.setInspectorWidth);
  const hydrated = useStoreHydrated();

  // The width follows the pointer locally during a drag and is written to the
  // store -- and through it to IndexedDB -- once on release, not per move.
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const width = draftWidth ?? storedWidth;
  const resizing = draftWidth !== null;

  const params = useParams<{ id?: string }>();
  const activeCompanyId = params?.id;

  // Follow the selected company: when the reader lands on a page with no
  // query typed, show the browse page that holds it. A typed query is the
  // reader's own view of the list and is left alone.
  useEffect(() => {
    if (activeRank == null || searchQuery.trim() !== "") return;
    setPage("all", Math.floor(activeRank / PAGE_SIZE) + 1);
    // Re-run only when the company changes, not when the query is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, activeRank, setPage]);

  const allData = useAllCompaniesSearch();
  const recentData = useRecentCompaniesSearch();
  const savedData = useSavedCompaniesSearch();

  return (
    <Drawer
      open={isInspectorOpen}
      onOpenChange={setInspectorOpen}
      openWidth={hydrated ? width : INSPECTOR_WIDTH_DEFAULT}
      resizing={resizing || !hydrated}
      // `md:` scoped deliberately: an unprefixed `relative` is merged over the
      // Drawer's own `fixed` positioning by tailwind-merge, which silently breaks
      // the mobile overlay. The chevron that needs this context is desktop-only.
      className="md:relative md:h-full"
    >
      {isInspectorOpen ? (
        <>
          <ResizeHandle
            width={width}
            onResizeStart={() => setDraftWidth(storedWidth)}
            onResize={setDraftWidth}
            onResizeEnd={(finalWidth) => {
              setInspectorWidth(finalWidth);
              setDraftWidth(null);
            }}
          />
          <InspectorHandle
            aria-label="Collapse company search"
            onClick={() => setInspectorOpen(false)}
            className={cn("absolute -right-6 top-1/2 z-10 -translate-y-1/2")}
          />
        </>
      ) : null}
      <Drawer.Header>
        <div className="flex items-center gap-2">
          <h2 className="inline-flex items-center gap-1.5 type-label-sm tracking-label-wide text-foreground">
            <Search className="size-3.5" /> Company Search
          </h2>
          {/* A question-mark glyph beside the title, as the design has it. A
              Popover, not a Tooltip: the tooltip opens on hover only, after a
              delay, and closes on click -- so clicking it did nothing. */}
          <Popover>
            <Popover.Trigger
              render={
                <button
                  type="button"
                  aria-label="How do I use this tool?"
                  title="How do I use this tool?"
                  className={cn(
                    "inline-flex text-muted hover:text-foreground cursor-pointer",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  )}
                >
                  <CircleQuestionMark className="size-3.5" aria-hidden />
                </button>
              }
            />
            <Popover.Content title="Using company search">
              <div className={cn("flex flex-col gap-2 text-xs")}>
                <p>
                  Search by company name, subsidiary name, PermID, or ticker.
                  Select a result to open its profile.
                </p>
                <Link
                  href="/help"
                  className={cn("text-primary hover:underline self-start")}
                >
                  Read the help page →
                </Link>
              </div>
            </Popover.Content>
          </Popover>
        </div>
      </Drawer.Header>
      <Drawer.Body>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "all" | "recent" | "saved")}
        >
          <Tabs.Header className="-mx-4">
            {/* Bare labels, as the design has them: the RESULTS count below
                already says how many, and icons only crowd a 312px rail. */}
            <Tabs.Trigger value="all">All</Tabs.Trigger>
            <Tabs.Trigger value="recent">Recent</Tabs.Trigger>
            <Tabs.Trigger value="saved">Saved</Tabs.Trigger>
          </Tabs.Header>
          <Tabs.Body className="-mx-4 py-0">
            <Tabs.Panel value="all">
              <div className="p-3 border-b border-muted/25">
                <SearchInput
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Search by name, subsidiary, PermID, or ticker…"
                />
              </div>
              <PanelBody
                data={allData}
                activeCompanyId={activeCompanyId}
                emptyMessage={
                  searchQuery ? "No matches." : "No companies indexed."
                }
                loadingMessage="Searching…"
              />
            </Tabs.Panel>
            <Tabs.Panel value="recent">
              <PanelBody
                data={recentData}
                activeCompanyId={activeCompanyId}
                emptyMessage="Nothing recent yet — visit a company to see it here."
              />
            </Tabs.Panel>
            <Tabs.Panel value="saved">
              <PanelBody
                data={savedData}
                activeCompanyId={activeCompanyId}
                emptyMessage="No saved companies. Tap the star to bookmark one."
              />
            </Tabs.Panel>
          </Tabs.Body>
        </Tabs>
      </Drawer.Body>
    </Drawer>
  );
}

export function CompanyInspectorOpener() {
  const isInspectorOpen = useCompaniesStore((s) => s.isInspectorOpen);
  const setInspectorOpen = useCompaniesStore((s) => s.setInspectorOpen);
  if (isInspectorOpen) return null;
  return (
    <InspectorHandle
      aria-label="Open company search"
      onClick={() => setInspectorOpen(true)}
      className={cn("fixed left-0 top-1/2 z-20 -translate-y-1/2")}
    />
  );
}
