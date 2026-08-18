"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type CompanySearchMeta,
  useCompaniesStore,
} from "@/domains/companies/stores/companies";
import { useSiteSearch } from "@/hooks/use-site-search";
import { matchFields } from "@/lib/match-fields";
import type { MatchSegment, SubsidiaryMatch } from "@/lib/match-subsidiaries";
import { parseJsonList } from "@/lib/parse-json-list";
import type { PagefindCompanyMeta } from "@/types/company-search";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 200;
/**
 * Alphabetical order, applied only to the empty query.
 *
 * Pagefind's `sort` overrides relevance ranking rather than breaking ties within
 * it, so passing this on every search — which is what used to happen — made the
 * `data-pagefind-weight` values on the indexed page inert and interleaved
 * subsidiary-only matches alphabetically among direct name matches. A search for
 * `waste` would rank a company that merely owns something named "Waste" beside
 * the company actually called Waste Connections.
 *
 * With no query there is no relevance to preserve — the tab is browsing all
 * 2,000 companies — and alphabetical is the only order that makes sense.
 *
 * A general ordering scheme for the corpus is issue #39; this is scoped to the
 * query-present case.
 */
const SORT = { companyName: "asc" } as const;

/**
 * Row identity for deduping. Module-level so it stays referentially stable —
 * `useSiteSearch` holds it in an effect dependency array.
 */
const identifyCompany = (company: PagefindCompanyMeta) => company.permId;

function normalize(raw: PagefindCompanyMeta): CompanySearchResultItem {
  const sectors = parseJsonList(raw.sectors);
  const tickers = parseJsonList(raw.tickers);
  return {
    permId: raw.permId,
    companyName: raw.companyName,
    sector: sectors[0],
    country: raw.countryName,
    tickers,
    subsidiaries: parseJsonList(raw.subsidiaries),
  };
}

export type CompanySearchResultItem = CompanySearchMeta & {
  viewedAt?: number;
  /**
   * Every subsidiary the company disclosed — what a row matches the query
   * against to explain itself.
   *
   * It lives here rather than on `CompanySearchMeta` on purpose. That type is
   * the *persisted* shape: bookmarking a company writes one to IndexedDB, and a
   * company with 1,284 subsidiaries would write 46 KB of names nobody reads
   * back, since the Recent and Saved tabs never consult the query. Keeping the
   * field on the search-result type means the persisted record cannot grow one
   * by accident — and `toSearchMeta` in the store enforces the same boundary at
   * runtime.
   */
  subsidiaries?: string[];
  /**
   * The subset of `subsidiaries` that explains this result, pre-segmented for
   * highlighting. Derived here rather than in the row because the debounced
   * query lives here — a row would otherwise have to reach into the store for
   * it, and would recompute on every keystroke instead of every settled search.
   */
  matches?: SubsidiaryMatch[];
  /**
   * The company's own name, segmented against the query so the row can mark the
   * hit in the title the same way it marks a subsidiary. Derived alongside
   * `matches` for the same reason. A name the query does not touch comes back as
   * one unmatched segment, which the row renders as plain text.
   */
  nameSegments?: MatchSegment[];
  /**
   * The country, displayed sector, and each ticker, segmented for the same
   * in-place highlight the name gets. Derived here alongside `matches` so the
   * row stays a pure renderer and nothing recomputes per keystroke.
   */
  countrySegments?: MatchSegment[];
  sectorSegments?: MatchSegment[];
  tickerSegments?: MatchSegment[][];
  /**
   * The PermID, segmented. The row shows it on its own labeled line only when it
   * is what matched — the PermID is otherwise off the card.
   */
  permIdSegments?: MatchSegment[];
  /**
   * An honest one-line cue for a row Pagefind returned that neither a highlight
   * nor a subsidiary line explains — e.g. a match on the (invisible) PermID, or
   * a stemmed subsidiary hit too short to name (`ande` crediting the connector
   * `and`). Absent when the row explains itself. Never asserts a field the
   * attribution cannot back up.
   */
  matchHint?: string;
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
  // `SORT` is a module constant rather than an inline object so this stays
  // referentially stable across renders — `useSiteSearch` has `sort` in an
  // effect dependency array, and a fresh object each render would re-run the
  // search forever.
  const sort = debouncedQuery.trim() === "" ? SORT : undefined;
  const { handleSearch, results, totalCount, isLoading } =
    useSiteSearch<PagefindCompanyMeta>({
      limit: PAGE_SIZE,
      offset,
      sort,
      emptyQueryBehavior: "all",
      identify: identifyCompany,
    });

  useEffect(() => {
    handleSearch(debouncedQuery);
  }, [debouncedQuery, handleSearch]);

  const normalized = useMemo(
    () =>
      results.map((raw) => {
        const company = normalize(raw.meta);
        const field = matchFields(debouncedQuery, raw.content, raw.weightedLocations, {
          permId: company.permId,
          name: company.companyName,
          country: company.country ?? "",
          tickers: company.tickers ?? [],
          sectors: parseJsonList(raw.meta.sectors),
          subsidiaries: company.subsidiaries ?? [],
        });
        return {
          ...company,
          matches: field.subsidiaries,
          nameSegments: field.name,
          countrySegments: field.country,
          sectorSegments: field.sector,
          tickerSegments: field.tickers,
          permIdSegments: field.permId,
          matchHint: field.hint,
        };
      }),
    [results, debouncedQuery],
  );
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
