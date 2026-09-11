"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Article, StatisticGrid } from "@/blocks";
import { HeroGlobe } from "@/components/hero-globe";
import { SearchBar } from "@/components/search";
import type { CorpusStats } from "@/domains/companies/dataset";
import { formatCountShort } from "@/lib/format-count";
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

function Header({ stats }: LandingProps) {
  const tiles = [
    countTile(stats?.companies, "companies tracked"),
    countTile(stats?.subsidiaries, "ownership links"),
    countTile(stats?.shareholdings, "shareholdings tracked"),
    countTile(stats?.debtInstruments, "debt instruments tracked"),
  ];
  return (
    <Article id="landing" className="md:max-w-xl md:justify-self-start">
      <Article.Header className="flex flex-col gap-4">
        <Article.Header.Eyebrow>
          Follow the Money to Justice
        </Article.Header.Eyebrow>
        <Article.Header.Title>
          Supercharge your investigative reporting.
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
            className="inline-flex items-center gap-1 text-xs"
            href="/about"
          >
            Learn More <ChevronRightIcon className="size-2" />
          </Link>
        </div>
      </Article.Header>
      <SearchBar
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
      <div className="flex gap-4 justify-end type-display mt-8">
        <Link
          className="inline-flex items-center gap-1 hover:bg-overlay border border-muted/25 rounded-sm text-sm p-2 hover:cursor-pointer"
          href="/methodology"
        >
          Read the methodology{" "}
          <ChevronRightIcon className="size-4 text-black dark:text-white" />
        </Link>
      </div>
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
