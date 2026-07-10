"use client";

import { useMemo } from "react";

import { useCompaniesStore } from "@/domains/companies/stores/companies";

import type { CompanySearchHookReturn } from "./use-all-companies-search";

const PAGE_SIZE = 10;

export function useSavedCompaniesSearch(): CompanySearchHookReturn {
  const savedPage = useCompaniesStore((s) => s.savedPage);
  const bookmarked = useCompaniesStore((s) => s.bookmarked);
  const setPage = useCompaniesStore((s) => s.setPage);

  const totalCount = bookmarked.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (savedPage - 1) * PAGE_SIZE;
  const results = useMemo(
    () => bookmarked.slice(offset, offset + PAGE_SIZE),
    [bookmarked, offset],
  );

  return {
    results,
    totalCount,
    totalPages,
    currentPage: savedPage,
    pageSize: PAGE_SIZE,
    isLoading: false,
    onNextPage: () => setPage("saved", Math.min(savedPage + 1, totalPages)),
    onPreviousPage: () => setPage("saved", Math.max(savedPage - 1, 1)),
    onPageChange: (page) =>
      setPage("saved", Math.min(Math.max(page, 1), totalPages)),
  };
}
