"use client";

import { SectionCard } from "@/blocks/section-card";
import { SourceCitation } from "@/blocks/source-citation";
import { scrollToSection } from "@/lib/scroll-to-section";
import { cn } from "@/lib/utils";
import type { Company, CurrentCorporateRelationship, Source } from "@/types/domain";

type CompanyOverviewSectionProps = {
  company: Company;
};

/**
 * One headline stat, linking to the section that carries the detail. `value` is
 * null when the fact has no processor yet — those render an explicit unavailable
 * state rather than a fabricated figure.
 */
type Gateway = {
  /** Target section id, without the `#`. */
  section: string;
  kicker: string;
  value: string | null;
  unit: string;
  meta: string;
  link: string;
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * How many distinct jurisdictions a company's subsidiaries are incorporated in.
 *
 * Case-folded, because the source is inconsistent about it — "Delaware" and
 * "DELAWARE" are one jurisdiction, not two. Blanks are excluded rather than
 * counted as an unknown jurisdiction. This is still an overcount: "DE" and
 * "Delaware" remain separate values, and merging those needs a state
 * abbreviation crosswalk that does not exist here. Hence "jurisdictions" rather
 * than "countries" — the looser word is the true one, and `location` genuinely
 * mixes states with countries.
 */
function countJurisdictions(
  relationships: CurrentCorporateRelationship[],
): number {
  const seen = new Set<string>();
  for (const relationship of relationships) {
    const jurisdiction = relationship.childJurisdiction?.trim();
    if (jurisdiction) seen.add(jurisdiction.toLowerCase());
  }
  return seen.size;
}

/**
 * The Corporate Tree stat. This is the only gateway with real data behind it.
 *
 * The count is subsidiaries, excluding the registrant — deliberately one less
 * than the Corporate Tree section's own "N entities" subtitle, which includes
 * it. The two numbers sit a few inches apart on the page and look like they
 * should match; they should not.
 */
function treeGateway(company: Company): Gateway {
  const relationships = company.currentCorporateRelationships;
  const base = {
    section: "tree",
    kicker: "Corporate Tree",
    unit: "Subsidiaries traced",
    link: "View corporate tree",
  };

  if (relationships.length === 0) {
    return {
      ...base,
      value: "0",
      meta: "No Exhibit 21 or Exhibit 8 subsidiary list in scope",
    };
  }

  // A multi-registrant company unions each registrant's most recent filing, so
  // the list can span several filing dates and documents. This caption is a
  // one-line summary, not the tree subtitle's full range, so it reports the
  // most recent filing — its date and its citation together — rather than
  // whichever subsidiary happens to sort first alphabetically. ISO-8601 dates
  // compare lexicographically, which is why `asOf` can be `max`'d as a string.
  const latest = relationships.reduce((a, b) => (b.asOf > a.asOf ? b : a));
  const jurisdictions = countJurisdictions(relationships);
  const citation = latest.sources[0]?.name ?? "SEC filing";
  return {
    ...base,
    value: String(relationships.length),
    meta: `${plural(jurisdictions, "jurisdiction")} · ${citation} · filed on ${latest.asOf}`,
  };
}

/**
 * The Commercial Debt stat.
 *
 * The count is instruments, not money. This slot was labelled "Outstanding debt"
 * while the section was mocked, and it cannot be: no CDT output supplies an FX
 * rate, in-scope instruments span five currencies, and 385 of 1,132 report no
 * amount at all, so any total would both mix currencies and understate by a
 * third. A count is a number the data actually supports.
 */
function debtGateway(company: Company): Gateway {
  const debt = company.currentCommercialDebt;
  const base = {
    section: "debt",
    kicker: "Commercial Debt",
    unit:
      debt.length === 1 ? "Instrument disclosed" : "Instruments disclosed",
    link: "View commercial debt",
  };

  if (debt.length === 0) {
    return {
      ...base,
      value: "0",
      meta: "No 8-K debt disclosure in scope for this company",
    };
  }

  const withLender = debt.filter((instrument) => instrument.lenders.length).length;
  // ISO-8601 dates compare lexicographically. A company's debt is assembled from
  // every 8-K that disclosed an instrument, so unlike the tree there is no single
  // filing date for the section — the most recent is what dates the card.
  const latest = debt.reduce(
    (newest, instrument) =>
      instrument.asOf > newest ? instrument.asOf : newest,
    "",
  );
  return {
    ...base,
    value: String(debt.length),
    meta: `${withLender} with a disclosed lender · SEC 8-K · latest filed on ${latest}`,
  };
}

/**
 * The Shareholders stat.
 *
 * The count is holdings, not money. A per-company total of institutional market
 * value is a real number — every value is USD and 99.8% are populated — but it
 * is a partial one, covering only holders whose issuer resolves, so presenting
 * it as "held by institutions" would overstate coverage. A count is honest about
 * what the section is: a floor on who holds the company.
 */
function shareholdersGateway(company: Company): Gateway {
  const holdings = company.currentShareholders;
  const base = {
    section: "holders",
    kicker: "Shareholders",
    // Holdings, not holders: share classes are not collapsed, so one investor
    // can be several rows. Counting them "holders" would overstate the roster.
    unit: holdings.length === 1 ? "Holding disclosed" : "Holdings disclosed",
    link: "View shareholders",
  };

  if (holdings.length === 0) {
    return {
      ...base,
      value: "0",
      meta: "No holdings resolved to this company",
    };
  }

  // ISO-8601 dates compare lexicographically. Holdings come from many filings,
  // so the most recent report date is what dates the card.
  const latest = holdings.reduce(
    (newest, holding) => (holding.asOf > newest ? holding.asOf : newest),
    "",
  );
  return {
    ...base,
    value: String(holdings.length),
    meta: `SEC 13-F & pension disclosures · reported ${latest}`,
  };
}

/**
 * The section's citation. Company-info reports no filing date, so the citation
 * is dated by when the record was last accessed.
 */
function OverviewSource({ sources }: { sources: Source[] }) {
  const [source] = sources;
  if (!source) return null;
  return (
    <SourceCitation
      source={source}
      detail={`last accessed ${source.lastAccessed}`}
    />
  );
}

function GatewayCard({ gateway }: { gateway: Gateway }) {
  const unavailable = gateway.value === null;
  return (
    <a
      href={`#${gateway.section}`}
      onClick={(event) => {
        // Match the tab bar: smooth-scroll rather than let the browser jump to
        // the fragment. The href stays so middle-click and open-in-new-tab work.
        event.preventDefault();
        scrollToSection(gateway.section);
      }}
      className="group flex flex-col gap-1 p-4 md:p-6 hover:bg-overlay/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {gateway.kicker}
      </span>
      <span
        className={cn(
          "font-inter-tight tracking-tight",
          unavailable
            ? "text-lg md:text-xl font-medium text-muted"
            : "text-3xl md:text-4xl font-semibold text-foreground",
        )}
      >
        {unavailable ? "Not available" : gateway.value}
      </span>
      <span className="text-sm text-foreground">{gateway.unit}</span>
      <span className="font-mono text-[10px] text-muted leading-relaxed">
        {gateway.meta}
      </span>
      <span className="mt-2 font-mono text-[10px] uppercase tracking-wider text-primary">
        {gateway.link} →
      </span>
    </a>
  );
}

function Gateways({ gateways }: { gateways: Gateway[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-muted/15 -m-4 md:-m-6">
      {gateways.map((gateway) => (
        <GatewayCard key={gateway.section} gateway={gateway} />
      ))}
    </div>
  );
}

/**
 * The "Overview" section of the company detail page — headline counts that
 * gateway into the sections below.
 *
 * All three stats — Corporate Tree, Shareholders, and Commercial Debt — now have
 * processors behind them and carry real counts.
 *
 * There is no section-level date: the three stats draw on datasets with
 * genuinely different vintages — corporate structure is 2016–2018, commercial
 * debt runs to the present, company info is current — so each card carries its
 * own instead of one date that would be wrong for at least one of them.
 */
export function CompanyOverviewSection({ company }: CompanyOverviewSectionProps) {
  const gateways = [
    treeGateway(company),
    shareholdersGateway(company),
    debtGateway(company),
  ];

  return (
    <SectionCard
      id="overview"
      title="Overview"
      subtitle="Headline counts"
      info="Headline counts for the sections below, each sourced from a processor. Commercial debt is counted in instruments rather than totalled in money — amounts are reported in several currencies with no conversion rate available, and a third of instruments report no amount at all. Shareholders are counted in holdings rather than totalled in value, since coverage is limited to holders whose issuer resolves and a total would overstate it."
      source={<OverviewSource sources={company.sources} />}
      expanded={
        <div className="max-w-3xl mx-auto">
          <Gateways gateways={gateways} />
        </div>
      }
    >
      <Gateways gateways={gateways} />
    </SectionCard>
  );
}
