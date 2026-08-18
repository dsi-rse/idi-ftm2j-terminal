import { useCallback, useEffect, useRef, useState } from "react";

import { foldDiacritics } from "@/lib/fold-diacritics";
import type {
  PagefindModule,
  PagefindSearchResult,
  PagefindWordLocation,
} from "@/types/pagefind";

type UseSiteSearchOptions<T> = {
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
  /**
   * Identity of a result, used to drop repeats before they reach the caller.
   *
   * A duplicated index is a build fault, not a normal state, but the failure it
   * produced was far worse than a repeated row: callers key their list items on
   * the same identity, and two React children with one key leaves the list
   * "duplicated and/or omitted" in React's own words — stale rows from the
   * previous render stranded in the DOM, ranks skipping every other number. A
   * wrong index should cost one redundant row, not a scrambled list.
   *
   * Pass a module-level function, not an inline closure: this sits in an effect
   * dependency array.
   *
   * Note this cannot fix `totalCount`, which is `stubs.length` and is known
   * before any fragment is loaded — a duplicated index still over-reports it.
   * Removing the duplicates at the source is the real fix.
   */
  identify?: (result: T) => string;
};

/**
 * One loaded result: the page's meta plus the two fragment fields a caller
 * needs to explain *which* indexed field the query hit.
 *
 * `weightedLocations` is only populated for a query search — an empty
 * (`"all"`) browse returns every page with nothing matched, so it comes back
 * empty. A location indexes into `content.split(/\s+/)`; see `lib/match-fields`.
 */
export type SiteSearchResult<T> = {
  meta: T;
  content: string;
  weightedLocations: PagefindWordLocation[];
};

/** First occurrence wins, so the surviving row keeps its rank. */
function dedupe<T>(
  items: SiteSearchResult<T>[],
  identify: (item: T) => string,
): SiteSearchResult<T>[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = identify(item.meta);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

type UseSiteSearchReturn<T> = {
  handleSearch: (query: string) => Promise<void>;
  results: SiteSearchResult<T>[];
  totalCount: number;
  isLoading: boolean;
};

export const useSiteSearch = <T>(
  options?: UseSiteSearchOptions<T>,
): UseSiteSearchReturn<T> => {
  const {
    limit = 3,
    offset = 0,
    sort,
    emptyQueryBehavior = "empty",
    identify,
  } = options ?? {};
  const [pagefind, setPagefind] = useState<PagefindModule | null>(null);
  const stubCacheRef = useRef<Map<string, PagefindSearchResult[]>>(new Map());
  const [currentQuery, setCurrentQuery] = useState("");
  const [results, setResults] = useState<SiteSearchResult<T>[]>([]);
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
      // The index is diacritic-folded at build time, so the query has to be
      // folded to meet it — Pagefind folds neither. Caching on the folded form
      // means "Panama" and "Panamá" share one entry rather than issuing two
      // searches for the same result set.
      //
      // The sort is part of the key: it changes the order Pagefind returns, so
      // the same query asked for two different orders must not share one entry.
      // (Today sort only varies with the empty query, but keying on it keeps a
      // future sorted non-empty query from being served a stale ordering.)
      const folded = foldDiacritics(currentQuery);
      const cacheKey = `${folded} ${sort ? JSON.stringify(sort) : ""}`;
      let stubs = stubCacheRef.current.get(cacheKey);
      if (!stubs) {
        const search = await pagefind.search(
          showAll ? null : folded,
          sort ? { sort } : undefined,
        );
        if (cancelled) return;
        stubs = search.results;
        stubCacheRef.current.set(cacheKey, stubs);
      }
      setTotalCount(stubs.length);

      const slice = stubs.slice(offset, offset + limit);
      const loaded = await Promise.all(slice.map((r) => r.data()));
      if (cancelled) return;
      const hits: SiteSearchResult<T>[] = loaded.map((r) => ({
        meta: r.meta as T,
        content: r.content,
        weightedLocations: r.weighted_locations,
      }));
      setResults(identify ? dedupe(hits, identify) : hits);
      setIsLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    currentQuery,
    limit,
    offset,
    pagefind,
    sort,
    emptyQueryBehavior,
    identify,
  ]);

  const handleSearch = useCallback(async (query: string) => {
    setCurrentQuery(query);
  }, []);

  return { handleSearch, results, totalCount, isLoading };
};
