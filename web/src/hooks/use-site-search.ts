import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PagefindModule,
  PagefindSearchResult,
} from "@/types/pagefind";

type UseSiteSearchOptions = {
  limit?: number;
  offset?: number;
  /**
   * Passed through to `pagefind.search(query, { sort })`. Pagefind must have
   * been built with matching `data-pagefind-sort` attributes on the indexed
   * pages, otherwise the option is silently ignored.
   */
  sort?: Record<string, "asc" | "desc">;
  /**
   * `"empty"` (default): empty query resolves to zero results — the shape a
   * plain autocomplete wants.
   * `"all"`: empty query calls `pagefind.search(null, { sort })`, returning
   * every indexed page (pre-sorted if `sort` is set) so the caller can
   * browse the full corpus.
   */
  emptyQueryBehavior?: "empty" | "all";
};

type UseSiteSearchReturn<T> = {
  handleSearch: (query: string) => Promise<void>;
  results: T[];
  totalCount: number;
  isLoading: boolean;
};

export const useSiteSearch = <T>(
  options?: UseSiteSearchOptions,
): UseSiteSearchReturn<T> => {
  const {
    limit = 3,
    offset = 0,
    sort,
    emptyQueryBehavior = "empty",
  } = options ?? {};
  const [pagefind, setPagefind] = useState<PagefindModule | null>(null);
  const stubCacheRef = useRef<Map<string, PagefindSearchResult[]>>(new Map());
  const [currentQuery, setCurrentQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const path = window.location.origin + "/pagefind/pagefind.js";
      const lib = await import(/* webpackIgnore: true */ path);
      await lib.init();
      setPagefind(lib);
    }
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const showAll = currentQuery === "" && emptyQueryBehavior === "all";
      if (currentQuery === "" && !showAll) {
        setResults([]);
        setTotalCount(0);
        setIsLoading(false);
        return;
      }
      if (!pagefind) return;

      setIsLoading(true);
      let stubs = stubCacheRef.current.get(currentQuery);
      if (!stubs) {
        const search = await pagefind.search(
          showAll ? null : currentQuery,
          sort ? { sort } : undefined,
        );
        if (cancelled) return;
        stubs = search.results;
        stubCacheRef.current.set(currentQuery, stubs);
      }
      setTotalCount(stubs.length);

      const slice = stubs.slice(offset, offset + limit);
      const loaded = await Promise.all(slice.map((r) => r.data()));
      if (cancelled) return;
      setResults(loaded.map((r) => r.meta as T));
      setIsLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [currentQuery, limit, offset, pagefind, sort, emptyQueryBehavior]);

  const handleSearch = useCallback(async (query: string) => {
    setCurrentQuery(query);
  }, []);

  return { handleSearch, results, totalCount, isLoading };
};
