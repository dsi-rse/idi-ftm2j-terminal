"use client";

import { useMemo } from "react";

import { filterStoredCompanies } from "@/domains/companies/filter-stored-companies";
import { useCompaniesStore } from "@/domains/companies/stores/companies";

import type { CompanySearchHookReturn } from "./use-all-companies-search";

const PAGE_SIZE = 10;

export function useSavedCompaniesSearch(): CompanySearchHookReturn {
  const savedPage = useCompaniesStore((s) => s.savedPage);
  const bookmarked = useCompaniesStore((s) => s.bookmarked);
  const searchQuery = useCompaniesStore((s) => s.searchQuery);
  const setPage = useCompaniesStore((s) => s.setPage);

  // The rail's one query filters this tab too, on the fields a stored entry
  // keeps. Short, local lists, so it runs on every keystroke, undebounced.
  const matched = useMemo(
    () => filterStoredCompanies(bookmarked, searchQuery),
    [bookmarked, searchQuery],
  );
  const totalCount = matched.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (savedPage - 1) * PAGE_SIZE;
  const results = useMemo(
    () => matched.slice(offset, offset + PAGE_SIZE),
    [matched, offset],
  );

  return {
    results,
    totalCount,
    totalPages,
    currentPage: savedPage,
    // Sliced synchronously, so the rows and their offset always agree.
    resultsOffset: offset,
    pageSize: PAGE_SIZE,
    isLoading: false,
    onNextPage: () => setPage("saved", Math.min(savedPage + 1, totalPages)),
    onPreviousPage: () => setPage("saved", Math.max(savedPage - 1, 1)),
    onPageChange: (page) =>
      setPage("saved", Math.min(Math.max(page, 1), totalPages)),
  };
}
