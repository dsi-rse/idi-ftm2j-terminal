import { SectionCard } from "@/blocks/section-card";
import { SourceCitation } from "@/blocks/source-citation";
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
  href: string;
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
    href: "#tree",
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

  const [first] = relationships;
  const jurisdictions = countJurisdictions(relationships);
  const citation = first.sources[0]?.name ?? "SEC filing";
  return {
    ...base,
    value: String(relationships.length),
    meta: `${plural(jurisdictions, "jurisdiction")} · ${citation} · filed ${first.asOf}`,
  };
}

/**
 * The two stats whose processors do not exist yet. They render unavailable
 * rather than showing the sample figures the sections below still display — a
 * fabricated number in a headline stat is worse than an absent one.
 */
const PENDING_GATEWAYS: Gateway[] = [
  {
    href: "#holders",
    kicker: "Shareholders",
    value: null,
    unit: "Shareholders disclosed",
    meta: "Awaiting the shareholder-tracker processor · sample data shown below",
    link: "View shareholders",
  },
  {
    href: "#debt",
    kicker: "Commercial Debt",
    value: null,
    unit: "Outstanding debt",
    meta: "Awaiting the CDT processor · sample data shown below",
    link: "View commercial debt",
  },
];

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
      href={gateway.href}
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
        <GatewayCard key={gateway.href} gateway={gateway} />
      ))}
    </div>
  );
}

/**
 * The "Overview" section of the company detail page — headline counts that
 * gateway into the sections below.
 *
 * Only the Corporate Tree stat has a processor behind it. The other two say so
 * rather than repeating the sample figures their sections display.
 *
 * There is no section-level date: the three stats draw on datasets with
 * genuinely different vintages — corporate structure is 2016–2018, company info
 * is current — so each card carries its own instead of one date that would be
 * wrong for at least one of them.
 */
export function CompanyOverviewSection({ company }: CompanyOverviewSectionProps) {
  const gateways = [treeGateway(company), ...PENDING_GATEWAYS];

  return (
    <SectionCard
      id="overview"
      title="Overview"
      subtitle="Headline counts"
      info="Headline counts for the sections below. Only the corporate tree is sourced from a processor today; shareholder and commercial-debt figures require the shareholder-tracker and CDT processors and are shown as unavailable rather than estimated."
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
