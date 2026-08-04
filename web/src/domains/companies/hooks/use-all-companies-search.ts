"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type CompanySearchMeta,
  useCompaniesStore,
} from "@/domains/companies/stores/companies";
import { useSiteSearch } from "@/hooks/use-site-search";
import type { PagefindCompanyMeta } from "@/types/company-search";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 200;
const SORT = { companyName: "asc" } as const;

function parseJsonList(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalize(raw: PagefindCompanyMeta): CompanySearchMeta {
  const sectors = parseJsonList(raw.sectors);
  const tickers = parseJsonList(raw.tickers);
  return {
    permId: raw.permId,
    companyName: raw.companyName,
    sector: sectors[0],
    country: raw.countryName,
    tickers,
  };
}

export type CompanySearchResultItem = CompanySearchMeta & {
  viewedAt?: number;
};

export type CompanySearchHookReturn = {
  results: CompanySearchResultItem[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  isLoading: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onPageChange: (page: number) => void;
};

export function useAllCompaniesSearch(): CompanySearchHookReturn {
  const searchQuery = useCompaniesStore((s) => s.searchQuery);
  const allPage = useCompaniesStore((s) => s.allPage);
  const setPage = useCompaniesStore((s) => s.setPage);

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const offset = (allPage - 1) * PAGE_SIZE;
  const { handleSearch, results, totalCount, isLoading } =
    useSiteSearch<PagefindCompanyMeta>({
      limit: PAGE_SIZE,
      offset,
      sort: SORT,
      emptyQueryBehavior: "all",
    });

  useEffect(() => {
    handleSearch(debouncedQuery);
  }, [debouncedQuery, handleSearch]);

  const normalized = useMemo(() => results.map(normalize), [results]);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return {
    results: normalized,
    totalCount,
    totalPages,
    currentPage: allPage,
    pageSize: PAGE_SIZE,
    isLoading,
    onNextPage: () => setPage("all", Math.min(allPage + 1, totalPages)),
    onPreviousPage: () => setPage("all", Math.max(allPage - 1, 1)),
    onPageChange: (page) =>
      setPage("all", Math.min(Math.max(page, 1), totalPages)),
  };
}
