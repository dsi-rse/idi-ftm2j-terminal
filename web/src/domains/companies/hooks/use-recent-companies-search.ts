"use client";

import { useMemo } from "react";

import { filterStoredCompanies } from "@/domains/companies/filter-stored-companies";
import { useCompaniesStore } from "@/domains/companies/stores/companies";

import type { CompanySearchHookReturn } from "./use-all-companies-search";

const PAGE_SIZE = 10;

export function useRecentCompaniesSearch(): CompanySearchHookReturn {
  const recentPage = useCompaniesStore((s) => s.recentPage);
  const recentlyViewed = useCompaniesStore((s) => s.recentlyViewed);
  const searchQuery = useCompaniesStore((s) => s.searchQuery);
  const setPage = useCompaniesStore((s) => s.setPage);

  // The rail's one query filters this tab too, on the fields a stored entry
  // keeps. Short, local lists, so it runs on every keystroke, undebounced.
  const matched = useMemo(
    () => filterStoredCompanies(recentlyViewed, searchQuery),
    [recentlyViewed, searchQuery],
  );
  const totalCount = matched.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (recentPage - 1) * PAGE_SIZE;
  const results = useMemo(
    () => matched.slice(offset, offset + PAGE_SIZE),
    [matched, offset],
  );

  return {
    results,
    totalCount,
    totalPages,
    currentPage: recentPage,
    // Sliced synchronously, so the rows and their offset always agree.
    resultsOffset: offset,
    pageSize: PAGE_SIZE,
    isLoading: false,
    onNextPage: () => setPage("recent", Math.min(recentPage + 1, totalPages)),
    onPreviousPage: () => setPage("recent", Math.max(recentPage - 1, 1)),
    onPageChange: (page) =>
      setPage("recent", Math.min(Math.max(page, 1), totalPages)),
  };
}
