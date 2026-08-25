"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { ArrowRightIcon, Dot, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { type SiteSearchResult, useSiteSearch } from "@/hooks/use-site-search";
import { matchFields } from "@/lib/match-fields";
import { type MatchSegment, windowToMatch } from "@/lib/match-subsidiaries";
import { parseJsonList } from "@/lib/parse-json-list";
import { cn } from "@/lib/utils";
import type { PagefindCompanyMeta } from "@/types/company-search";

type CompanyHit = SiteSearchResult<PagefindCompanyMeta>;

/**
 * Renders segmented text with the query's hits marked. A local copy rather than
 * a shared component on purpose: `match-fields` returns data, not markup, so the
 * drawer and this popup each own their renderer and neither `components/` nor
 * `domains/` imports the other's (see the note in `search-result.tsx`).
 */
function Marked({ segments }: { segments: MatchSegment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.matched ? (
          <mark
            key={i}
            className={cn(
              "rounded-sm bg-primary/25 text-inherit underline decoration-2 underline-offset-2",
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

type ResponsivePlaceholder = string | { short: string; long: string };

/**
 * Row identity for deduping. Module-level so it stays referentially stable —
 * `useSiteSearch` holds it in an effect dependency array.
 */
const identifyCompany = (company: PagefindCompanyMeta) => company.permId;

type SearchBarProps = {
  placeholder: ResponsivePlaceholder;
};

export function SearchBar({ placeholder }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, totalCount, handleSearch } =
    useSiteSearch<PagefindCompanyMeta>({
      limit: 3,
      identify: identifyCompany,
    });
  const isDesktop = useMediaQuery("(min-width: 640px)", {
    defaultMatches: true,
  });

  useEffect(() => {
    const t = setTimeout(() => handleSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, handleSearch]);

  const trimmed = query.trim();

  // Derive each row's highlighting once per settled result set, keyed by permId.
  // `matchFields` reconstructs word offsets and, for a large tree, counts words
  // across every subsidiary — far too much to redo inline in the render prop,
  // which reruns on every hover and keyboard move. The drawer memoizes the same
  // way (see `use-all-companies-search`).
  const derivedByPermId = useMemo(() => {
    return new Map(
      results.map((hit) => {
        const company = hit.meta;
        const sectors = parseJsonList(company.sectors);
        const tickers = parseJsonList(company.tickers);
        const subsidiaries = parseJsonList(company.subsidiaries);
        const field = matchFields(trimmed, hit.content, hit.weightedLocations, {
          permId: company.permId,
          name: company.companyName,
          country: company.countryName ?? "",
          tickers,
          sectors,
          subsidiaries,
        });
        const [match] = field.subsidiaries;
        return [
          company.permId,
          {
            sector: sectors[0],
            country: company.countryName,
            tickers,
            field,
            match,
            // Window the subsidiary line so a deep hit is not truncated off the
            // right edge; the full name still reaches assistive tech.
            windowedMatch: match ? windowToMatch(match.segments) : null,
          },
        ] as const;
      }),
    );
  }, [results, trimmed]);

  const resolvedPlaceholder =
    typeof placeholder === "string"
      ? placeholder
      : isDesktop
        ? placeholder.long
        : placeholder.short;

  return (
    <Autocomplete.Root
      items={results}
      mode="none"
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(hit: CompanyHit) => hit.meta.companyName}
    >
      <div className="relative w-full">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted"
        />
        <Autocomplete.Input
          placeholder={resolvedPlaceholder}
          className="bg-muted-foreground text-sm w-full pl-8 pr-2 py-3 border border-muted/25 rounded-sm outline-none focus:ring-0.5 focus:ring-primary focus:border-primary"
        />
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner
          sideOffset={4}
          className="w-[var(--anchor-width)] z-50"
        >
          <Autocomplete.Popup className="bg-background border border-muted/25 rounded-sm shadow-md overflow-hidden">
            <Autocomplete.List className="max-h-64 overflow-y-auto">
              {(hit: CompanyHit) => {
                const company = hit.meta;
                // Precomputed once per result set in `derivedByPermId`. A company
                // can land in this popup on a subsidiary name that is nowhere on
                // the row (subsidiaries share this index), so `field` carries the
                // per-field highlighting and an honest cue when nothing visible
                // explains the hit. One line is deliberate: the popup shows three
                // results in a fixed-height scroller, and the drawer's
                // two-plus-overflow treatment would make it much taller.
                const derived = derivedByPermId.get(company.permId);
                if (!derived) return null;
                const { sector, country, tickers, field, match, windowedMatch } =
                  derived;
                return (
                  <Autocomplete.Item
                    key={company.permId}
                    value={hit}
                    onClick={() => router.push(`/companies/${company.permId}`)}
                    className="px-3 py-2 flex items-start justify-between gap-3 text-sm cursor-pointer data-[highlighted]:bg-overlay"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate">
                        <Marked segments={field.name} />
                      </span>
                      {match ? (
                        <span
                          className={cn(
                            "text-xs flex items-baseline gap-1 mt-0.5 min-w-0 text-foreground",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn("shrink-0 font-mono text-primary")}
                          >
                            ↳
                          </span>
                          <span className={cn("sr-only")}>
                            Matched subsidiary: {match.name}
                          </span>
                          <span aria-hidden className={cn("truncate pb-0.5")}>
                            {windowedMatch?.leadingEllipsis && "…"}
                            {windowedMatch && (
                              <Marked segments={windowedMatch.segments} />
                            )}
                          </span>
                        </span>
                      ) : field.permId.some((s) => s.matched) ? (
                        <span className="opacity-60 text-xs mt-0.5">
                          PermID: <Marked segments={field.permId} />
                        </span>
                      ) : (
                        <>
                          {(sector || country) && (
                            <span className="opacity-60 text-xs flex items-center mt-0.5">
                              {sector && (
                                <span className="truncate">
                                  <Marked segments={field.sector} />
                                </span>
                              )}
                              {sector && country && (
                                <Dot aria-hidden className="size-3 shrink-0" />
                              )}
                              {country && (
                                <span className="truncate">
                                  <Marked segments={field.country} />
                                </span>
                              )}
                            </span>
                          )}
                          {field.hint && (
                            <span className="opacity-60 text-xs italic mt-0.5">
                              {field.hint}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {tickers.length > 0 && (
                      <span className="opacity-60 text-xs whitespace-nowrap shrink-0">
                        {tickers.map((ticker, i) => (
                          <span key={ticker}>
                            {i > 0 && ", "}
                            <Marked
                              segments={
                                field.tickers[i] ?? [
                                  { text: ticker, matched: false },
                                ]
                              }
                            />
                          </span>
                        ))}
                      </span>
                    )}
                  </Autocomplete.Item>
                );
              }}
            </Autocomplete.List>

            <Autocomplete.Empty>
              {trimmed.length > 0 && (
                <div className="px-3 py-2 text-sm">
                  No matches.{" "}
                  <Link href="/companies" className="text-primary hover:underline">
                    Browse the full dataset
                  </Link>
                </div>
              )}
            </Autocomplete.Empty>

            {totalCount > 3 && (
              <Link
                href={`/companies?q=${encodeURIComponent(trimmed)}`}
                className="block px-3 py-2 text-sm border-t border-muted/25 text-primary hover:underline"
              >
                <span className="inline-flex items-center gap-1 font-bold dark:font-normal">
                  <span>View all {totalCount} results</span>
                  <ArrowRightIcon className="size-3" />
                </span>
              </Link>
            )}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
