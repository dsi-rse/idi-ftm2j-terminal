"use client";

import { useMemo } from "react";

import { useCompaniesStore } from "@/domains/companies/stores/companies";

import type { CompanySearchHookReturn } from "./use-all-companies-search";

const PAGE_SIZE = 10;

export function useRecentCompaniesSearch(): CompanySearchHookReturn {
  const recentPage = useCompaniesStore((s) => s.recentPage);
  const recentlyViewed = useCompaniesStore((s) => s.recentlyViewed);
  const setPage = useCompaniesStore((s) => s.setPage);

  const totalCount = recentlyViewed.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const offset = (recentPage - 1) * PAGE_SIZE;
  const results = useMemo(
    () => recentlyViewed.slice(offset, offset + PAGE_SIZE),
    [recentlyViewed, offset],
  );

  return {
    results,
    totalCount,
    totalPages,
    currentPage: recentPage,
    pageSize: PAGE_SIZE,
    isLoading: false,
    onNextPage: () => setPage("recent", Math.min(recentPage + 1, totalPages)),
    onPreviousPage: () => setPage("recent", Math.max(recentPage - 1, 1)),
    onPageChange: (page) =>
      setPage("recent", Math.min(Math.max(page, 1), totalPages)),
  };
}
