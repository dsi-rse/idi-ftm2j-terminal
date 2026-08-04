"use client";

import { useParams } from "next/navigation";

import { Drawer } from "@/components/drawer";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { Tabs } from "@/components/tabs";
import { Tooltip } from "@/components/tooltip";

import type { CompanySearchHookReturn } from "../hooks/use-all-companies-search";
import { useAllCompaniesSearch } from "../hooks/use-all-companies-search";
import { useRecentCompaniesSearch } from "../hooks/use-recent-companies-search";
import { useSavedCompaniesSearch } from "../hooks/use-saved-companies-search";
import { useCompaniesStore } from "../stores/companies";
import { SearchResult } from "./search-result";
import { CircleX, ClockIcon, ListIcon, Search, StarIcon } from "lucide-react";

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
      <p className="px-4 py-3 text-xs text-muted">
        {loadingMessage ?? "Loading…"}
      </p>
    );
  }

  if (results.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted">{emptyMessage}</p>;
  }

  const startIndex = (currentPage - 1) * pageSize;
  const start = startIndex + 1;
  const end = startIndex + results.length;
  const rangeText = start === end ? `${start}` : `${start}-${end}`;
  const noun = data.totalCount === 1 ? "result" : "results";

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 text-xs text-muted border-b border-muted/25">
        Viewing {rangeText} of {data.totalCount} {noun}
      </div>
      {results.map((company, i) => (
        <SearchResult
          key={company.permId}
          index={startIndex + i + 1}
          company={company}
          viewedAt={company.viewedAt}
          active={company.permId === activeCompanyId}
        />
      ))}
      {totalPages > 1 && (
        <div className="p-3">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}

export function CompanySearchDrawer() {
  const searchQuery = useCompaniesStore((s) => s.searchQuery);
  const setSearchQuery = useCompaniesStore((s) => s.setSearchQuery);
  const activeTab = useCompaniesStore((s) => s.activeTab);
  const setActiveTab = useCompaniesStore((s) => s.setActiveTab);
  const isInspectorOpen = useCompaniesStore((s) => s.isInspectorOpen);
  const setInspectorOpen = useCompaniesStore((s) => s.setInspectorOpen);

  const params = useParams<{ id?: string }>();
  const activeCompanyId = params?.id;

  const allData = useAllCompaniesSearch();
  const recentData = useRecentCompaniesSearch();
  const savedData = useSavedCompaniesSearch();

  return (
    <Drawer
      open={isInspectorOpen}
      onOpenChange={setInspectorOpen}
      className="md:sticky md:top-0 md:self-start md:h-dvh"
    >
      <Drawer.Header>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-1.5 font-mono font-semibold text-foreground text-xs uppercase tracking-wider">
              <Search className="size-3.5" /> Inspector
            </h2>
            <button
              type="button"
              aria-label="Collapse Inspector panel"
              onClick={() => setInspectorOpen(false)}
              className="text-muted hover:text-foreground cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <CircleX className="size-4" />
            </button>
          </div>
          <Tooltip>
            <Tooltip.Trigger
              render={
                <button
                  type="button"
                  className="self-start text-muted hover:text-foreground text-[11px] text-xs cursor-help focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  How do I use this tool?
                </button>
              }
            />
            <Tooltip.Content title="Tabs">
              <dl className="grid grid-cols-2 grid-rows-3 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted tracking-wider">All</dt>
                <dd>Every indexed company.</dd>
                <dt className="text-muted tracking-wider text-xs">Recent</dt>
                <dd>Recently visited.</dd>
                <dt className="text-muted tracking-wider">Saved</dt>
                <dd>Your bookmarks.</dd>
              </dl>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </Drawer.Header>
      <Drawer.Body>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "all" | "recent" | "saved")}
        >
          <Tabs.Header className="-mx-4">
            <Tabs.Trigger value="all">
              <div className="inline-flex items-center gap-1">
                <ListIcon className="h-3 w-3" /> All ({allData.totalCount})
              </div>
            </Tabs.Trigger>
            <Tabs.Trigger value="recent">
              <div className="inline-flex items-center gap-1">
                <ClockIcon className="h-3 w-3" /> Recent (
                {recentData.totalCount})
              </div>
            </Tabs.Trigger>
            <Tabs.Trigger value="saved">
              <div className="inline-flex items-center gap-1">
                <StarIcon className="h-3 w-3" /> Saved ({savedData.totalCount})
              </div>
            </Tabs.Trigger>
          </Tabs.Header>
          <Tabs.Body className="-mx-4 py-0">
            <Tabs.Panel value="all">
              <div className="p-3 border-b border-muted/25">
                <SearchInput
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Search by name, PermID, or ticker…"
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
    <button
      type="button"
      aria-label="Open Inspector panel"
      onClick={() => setInspectorOpen(true)}
      className="fixed left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-20 rounded-r-md bg-primary text-black shadow-md hover:brightness-110 hover:shadow-lg transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground cursor-pointer"
    >
      <Search className="size-4" />
    </button>
  );
}
