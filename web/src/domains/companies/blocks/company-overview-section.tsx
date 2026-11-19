"use client";

import { SectionCard } from "@/blocks/section-card";
import { scrollToSection } from "@/lib/scroll-to-section";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

import type { Company } from "@/types/domain";

type CompanyOverviewSectionProps = {
  company: Company;
};

/**
 * One headline stat, linking to the section that carries the detail. `value` is
 * null when the fact has no processor yet — those render an explicit unavailable
 * state rather than a fabricated figure.
 *
 * A count, its unit, and the link, and nothing else. Each box used to carry a
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
  link: string;
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
    link: "View corporate tree",
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
    link: "View commercial debt",
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
    link: "View shareholders",
    value: holdings.length.toLocaleString("en-US"),
  };
}

const NOT_REPORTED = "Not reported";

const identifierLinkClassName =
  "type-figure underline decoration-dotted underline-offset-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** One labelled identifier: a micro-label over one or more values. */
function Identifier({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1 min-w-0")}>
      <dt className={cn("type-label whitespace-nowrap")}>{label}</dt>
      <dd className={cn("m-0 flex flex-wrap gap-x-3 gap-y-1 type-value")}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The company's stable identifiers. A reader following the money needs the
 * keys other registries use: the PermID this record is built on, every SEC
 * registrant CIK (linked to its EDGAR filing index), and the CUSIPs its
 * securities trade under. CIK absence is a data gap and is said so; CUSIP
 * absence is the norm (most issuers' securities are unresolved) and the pair
 * is simply omitted.
 */
function IdentifiersRow({ company }: { company: Company }) {
  const permIdUrl =
    company.sources[0]?.url ?? `https://permid.org/1-${company.permId}`;
  const several = company.registrants.length > 1;
  return (
    // A description list, so a screen reader announces each label with its
    // value and the group's name. An aria-label on a plain div is inert.
    <dl
      className={cn("m-0 flex flex-wrap gap-x-8 gap-y-3 pb-4")}
      aria-label="Identifiers"
    >
      <Identifier label="PermID">
        <a
          href={permIdUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(identifierLinkClassName)}
        >
          {company.permId}
        </a>
      </Identifier>
      <Identifier label={several ? "CIKs" : "CIK"}>
        {company.registrants.length === 0 ? (
          <span className={cn("text-muted")}>{NOT_REPORTED}</span>
        ) : (
          company.registrants.map((registrant) => (
            <span key={registrant.cik} className={cn("whitespace-nowrap")}>
              <a
                href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${registrant.cik}`}
                target="_blank"
                rel="noreferrer"
                className={cn(identifierLinkClassName)}
              >
                {registrant.cik}
              </a>
              {several && registrant.registrantName ? (
                <span className={cn("text-muted")}>
                  {" "}
                  {registrant.registrantName}
                </span>
              ) : null}
            </span>
          ))
        )}
      </Identifier>
      {company.cusips.length > 0 ? (
        <Identifier label={company.cusips.length > 1 ? "CUSIPs" : "CUSIP"}>
          {company.cusips.map((cusip) => (
            <span key={cusip} className={cn("type-figure")}>
              {cusip}
            </span>
          ))}
        </Identifier>
      ) : null}
    </dl>
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
      <span className="mt-2 type-caption text-primary">
        {gateway.link} →
      </span>
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
 * The "Overview" section of the company detail page — headline counts that
 * gateway into the sections below.
 *
 * All three stats — Corporate Tree, Shareholders, and Commercial Debt — now have
 * processors behind them and carry real counts.
 *
 * There is no section-level date or source: the three stats draw on datasets
 * with genuinely different vintages and sources (Exhibit 21, 13-F, and 8-K
 * data, none of it the LSEG record), so each is dated and cited in the section
 * it links to, and the LSEG citation sits under the header with the fields it
 * actually covers.
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
      // Three counts and an identifier row fit inline in full; a modal would
      // show the same thing larger.
      expandable={false}
    >
      <IdentifiersRow company={company} />
      <Gateways gateways={gateways} />
    </SectionCard>
  );
}
