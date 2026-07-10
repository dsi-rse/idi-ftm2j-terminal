"use client";

import { Button } from "@base-ui/react/button";
import { ChevronRightIcon } from "lucide-react";

import { Article, StatisticGrid } from "@/blocks";
import { HeroGlobe } from "@/components/hero-globe";
import { SearchBar } from "@/components/search";
import { StandardPageLayout } from "@/layouts";

function Header() {
  const stats = [
    { value: "5,000+", description: "publicly-traded corporations" },
    { value: "26,000+", description: "subsidiaries" },
    { value: "$1.5B", description: "In shareholdings" },
    {
      value: "Daily data",
      description: "refreshes from the U.S. Securities and Exchange Commission",
    },
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
          <a className="inline-flex items-center gap-1 text-xs" href="/about">
            Learn More <ChevronRightIcon className="size-2" />
          </a>
        </div>
      </Article.Header>
      <SearchBar
        placeholder={{
          short: "Search by name, PermID, or ticker",
          long: "Search for a company by name, PermID, or ticker",
        }}
      />
      <StatisticGrid stats={stats} />
      <div className="flex gap-4 justify-end font-inter-tight font-semibold mt-8">
        <a
          className="inline-flex items-center gap-1 bg-primary text-white dark:text-black border border-muted/25 hover:bg-primary-hover hover:cursor-pointer text-sm rounded-sm p-2"
          href="/#"
        >
          Browse companies{" "}
          <ChevronRightIcon className="size-4 text-white dark:text-black" />
        </a>
        <a
          className="inline-flex items-center gap-1 hover:bg-overlay border border-muted/25 rounded-sm text-sm p-2 hover:cursor-pointer"
          href="/methodology"
        >
          Read the methodology{" "}
          <ChevronRightIcon className="size-4 text-black dark:text-white" />
        </a>
      </div>
    </Article>
  );
}

export function Landing() {
  return (
    <StandardPageLayout>
      <div className="grid w-full grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12 [&>*]:min-w-0">
        <Header />
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
