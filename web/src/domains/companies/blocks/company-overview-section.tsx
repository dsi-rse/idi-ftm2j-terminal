"use client";

import { SectionCard } from "@/blocks/section-card";
import { scrollToSection } from "@/lib/scroll-to-section";
import { cn } from "@/lib/utils";
import type { Company } from "@/types/domain";

import { CompanyFacts } from "./company-facts";

type CompanyOverviewSectionProps = {
  company: Company;
};

/**
 * One headline stat, linking to the section that carries the detail. `value` is
 * null when the fact has no processor yet — those render an explicit unavailable
 * state rather than a fabricated figure.
 *
 * A count, its unit, and a "View all" link, and nothing else. Each box used to carry a
 * detail line too (jurisdictions, citation, latest filing date), which is
 * exactly what the section it links to opens with; the box is the way in, not
 * a second copy of the section's header.
 */
type Gateway = {
  /** Target section id, without the `#`. */
  section: string;
  kicker: string;
  value: string | null;
  unit: string;
};

/**
 * The Corporate Tree stat: subsidiaries, excluding the registrant, the same
 * count the Corporate Tree section's subtitle gives.
 */
function treeGateway(company: Company): Gateway {
  const relationships = company.currentCorporateRelationships;
  return {
    section: "tree",
    kicker: "Corporate Tree",
    unit: "Subsidiaries traced",
    value: relationships.length.toLocaleString("en-US"),
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
  return {
    section: "debt",
    kicker: "Commercial Debt",
    unit: debt.length === 1 ? "Instrument disclosed" : "Instruments disclosed",
    value: debt.length.toLocaleString("en-US"),
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
  return {
    section: "holders",
    kicker: "Shareholders",
    // Holdings, not holders: share classes are not collapsed, so one investor
    // can be several rows. Counting them "holders" would overstate the roster.
    unit: holdings.length === 1 ? "Holding disclosed" : "Holdings disclosed",
    value: holdings.length.toLocaleString("en-US"),
  };
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
      // The tiles run to the card's bottom edge, so the ones in its corners
      // take the card radius there; otherwise the hover fill pokes square
      // corners past the card's curved ones. Stacked on a phone, the last
      // tile holds both corners; in the three-column row, the outer two do.
      className={cn(
        "group flex flex-col gap-1 p-4 hover:bg-overlay/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "last:rounded-b-card md:last:rounded-bl-none md:first:rounded-bl-card",
      )}
    >
      <span className="type-label">
        {gateway.kicker}
      </span>
      <span
        className={cn(
          unavailable
            ? "type-display tracking-tight text-lg md:text-xl font-normal text-muted"
            : "type-stat text-3xl md:text-4xl",
        )}
      >
        {unavailable ? "Not available" : gateway.value}
      </span>
      <span className="type-value">{gateway.unit}</span>
      {/* "View all", not "View corporate tree": the kicker above already
          names the section, and repeating it made the gold link the loudest
          text on the card. The whole tile is the link, so this is the cue. */}
      <span className="mt-2 type-caption text-primary">View all →</span>
    </a>
  );
}

function Gateways({ gateways }: { gateways: Gateway[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-muted/15 border-t border-muted/15 -mx-4 -mb-4">
      {gateways.map((gateway) => (
        <GatewayCard key={gateway.section} gateway={gateway} />
      ))}
    </div>
  );
}

/**
 * The "Overview" section of the company detail page: the company's headline
 * facts, then the counts that gateway into the sections below.
 *
 * The facts (industry, HQ country, listing, ticker, public float, revenue) were
 * bordered cells in the page header until #67; here they are a plain list, so
 * the card holds one level of boxes, the gateway tiles. The identifiers that
 * used to open this card moved to their own section at the end of the page.
 *
 * There is no section-level date or source: the facts and the three counts draw
 * on datasets with genuinely different vintages and sources (the LSEG record,
 * 10-K/20-F figures, Exhibit 21, 13-F, and 8-K data). The LSEG citation sits
 * under the facts it covers, each figure cites its own filing, and each count
 * is dated and cited in the section it links to.
 */
export function CompanyOverviewSection({
  company,
}: CompanyOverviewSectionProps) {
  const gateways = [
    treeGateway(company),
    shareholdersGateway(company),
    debtGateway(company),
  ];

  return (
    <SectionCard
      id="overview"
      title="Overview"
      // The facts and three counts fit inline in full; a modal would show the
      // same thing larger.
      expandable={false}
    >
      {/* pb-4 is the gap above the gateway tiles' rule, as the card's padding
          is below it. */}
      <div className={cn("pb-4")}>
        <CompanyFacts company={company} />
      </div>
      <Gateways gateways={gateways} />
    </SectionCard>
  );
}
