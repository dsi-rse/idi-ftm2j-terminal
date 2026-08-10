"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import { ArrowRightIcon, Dot, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSiteSearch } from "@/hooks/use-site-search";
import { parseJsonList } from "@/lib/parse-json-list";
import type { PagefindCompanyMeta } from "@/types/company-search";

type ResponsivePlaceholder = string | { short: string; long: string };

type SearchBarProps = {
  placeholder: ResponsivePlaceholder;
};

export function SearchBar({ placeholder }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, totalCount, handleSearch } =
    useSiteSearch<PagefindCompanyMeta>({
      limit: 3,
    });
  const isDesktop = useMediaQuery("(min-width: 640px)", {
    defaultMatches: true,
  });

  useEffect(() => {
    const t = setTimeout(() => handleSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, handleSearch]);

  const trimmed = query.trim();
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
      itemToStringValue={(company: PagefindCompanyMeta) => company.companyName}
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
              {(company: PagefindCompanyMeta) => {
                const sector = parseJsonList(company.sectors)[0];
                const country = company.countryName;
                const tickers = parseJsonList(company.tickers);
                return (
                  <Autocomplete.Item
                    key={company.permId}
                    value={company}
                    onClick={() => router.push(`/companies/${company.permId}`)}
                    className="px-3 py-2 flex items-start justify-between gap-3 text-sm cursor-pointer data-[highlighted]:bg-overlay"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate">
                        {company.companyName}
                      </span>
                      {(sector || country) && (
                        <span className="opacity-60 text-xs flex items-center mt-0.5">
                          {sector && <span className="truncate">{sector}</span>}
                          {sector && country && (
                            <Dot aria-hidden className="size-3 shrink-0" />
                          )}
                          {country && (
                            <span className="truncate">{country}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {tickers.length > 0 && (
                      <span className="opacity-60 text-xs whitespace-nowrap shrink-0">
                        {tickers.join(", ")}
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
