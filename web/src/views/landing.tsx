"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef } from "react";

import { Article, StatisticGrid } from "@/blocks";
import { HeroGlobe } from "@/components/hero-globe";
import { SearchBar, type SearchBarHandle } from "@/components/search";
import type { CorpusStats } from "@/domains/companies/dataset";
import { formatCountShort } from "@/lib/format-count";
import { SEARCH_FOCUS_PARAM, SEARCH_FOCUS_VALUE } from "@/lib/search-focus";
import { cn } from "@/lib/utils";
import { StandardPageLayout } from "@/layouts";

type LandingProps = {
  /** Corpus-wide counts from the build's dataset index; `null` when none. */
  stats: CorpusStats | null;
};

/**
 * A statistic tile's value and hover text. The tile shows the compact reading
 * (`1.7M`) and carries the exact count in its title, so the hero stays legible
 * without the figure being lost; a missing dataset shows a dash rather than an
 * invented number.
 */
function countTile(value: number | undefined, description: string) {
  return value === undefined
    ? { value: "—", description }
    : {
      value: formatCountShort(value),
      title: `${value.toLocaleString("en-US")} ${description}`,
      description,
    };
}

/**
 * Focuses the search bar when the URL asks for it (the navbar's search link
 * sends `/?focus=search`), then drops the parameter so a reload or a Back
 * press does not refocus. Reacts to the parameter rather than to mount, so the
 * link still works when it is followed from the landing page itself.
 *
 * Its own component so the `useSearchParams` read sits inside a Suspense
 * boundary and the rest of the statically rendered landing stays static.
 */
function FocusSearchOnRequest({ onRequest }: { onRequest: () => void }) {
  const router = useRouter();
  const requested =
    useSearchParams().get(SEARCH_FOCUS_PARAM) === SEARCH_FOCUS_VALUE;
  useEffect(() => {
    if (!requested) return;
    onRequest();
    router.replace("/", { scroll: false });
  }, [requested, onRequest, router]);
  return null;
}

function Header({ stats }: LandingProps) {
  const searchBar = useRef<SearchBarHandle>(null);
  const focusSearch = useCallback(() => searchBar.current?.focus(), []);
  const tiles = [
    countTile(stats?.companies, "companies tracked"),
    countTile(stats?.subsidiaries, "ownership links"),
    countTile(stats?.shareholdings, "investments tracked"),
    countTile(stats?.debtInstruments, "debt instruments tracked"),
  ];
  return (
    // The grid centers this column against the globe; `md:pb-25.5` (102px)
    // lifts the text 51px -- half the padding -- above that center, so the
    // block sits slightly high beside the globe rather than dead level with it.
    // The lift is a fixed offset, not a measurement of anything else in the
    // column: a taller or shorter header or stat grid stays centered, just as
    // high. Where the text outgrows the globe (narrow two-column widths), the
    // padding instead adds height below it, which keeps the text's top where it
    // is and moves the globe down to match.
    <Article
      id="landing"
      className={cn("md:max-w-xl md:justify-self-start md:pb-25.5")}
    >
      <Article.Header className="flex flex-col gap-4">
        <Article.Header.Eyebrow>
          Follow the Money to Justice
        </Article.Header.Eyebrow>
        <Article.Header.Title>
          Investigate corporate power through public records.
        </Article.Header.Title>
        <Article.Header.Lead>
          FTM2J is an open research database that traces the shareholdings,
          commercial debts, and corporate structures of the world’s largest
          extractive and agribusiness companies — empowering journalists,
          community advocates, and public citizens to identify powerful actors
          associated with harmful development projects.
        </Article.Header.Lead>
        <div className="flex justify-end text-white hover:text-primary hover:cursor-pointer">
          <Link
            className="inline-flex items-center gap-1 text-value"
            href="/about"
          >
            Learn More <ChevronRightIcon className="size-2" />
          </Link>
        </div>
      </Article.Header>
      <Suspense fallback={null}>
        <FocusSearchOnRequest onRequest={focusSearch} />
      </Suspense>
      <SearchBar
        ref={searchBar}
        placeholder={{
          // The magnifying-glass icon carries "search", so the short variant
          // spends its width on the fields instead: "Search by name,
          // subsidiary, or ticker" measures 245px against 237px of usable input
          // at 375px and clips, while this keeps PermID and fits at 233px.
          short: "Name, subsidiary, PermID, or ticker",
          long: "Search for a company by name, subsidiary, PermID, or ticker",
        }}
      />
      <StatisticGrid stats={tiles} />
    </Article>
  );
}

export function Landing({ stats }: LandingProps) {
  return (
    <StandardPageLayout>
      <div className="grid w-full grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12 [&>*]:min-w-0">
        <Header stats={stats} />
        <div
          className="relative w-full [contain:layout_size]"
          style={{ paddingBottom: "100%" }}
        >
          <div className="absolute inset-0">
            <HeroGlobe />
          </div>
        </div>
      </div>
    </StandardPageLayout>
  );
}
