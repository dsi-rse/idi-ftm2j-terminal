"use client";

import type { ReactNode } from "react";

import { InfoButton } from "@/blocks/info-button";
import { SourceCitation } from "@/blocks/source-citation";
import { Popover } from "@/components/popover";
import { formatAmountShort } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type {
  CitedFigure,
  Company,
  CurrentListing,
  RegistrantFacts,
  Source,
} from "@/types/domain";

/**
 * Shown wherever a fact has no value. "Not available" rather than "Not
 * reported": a gap is usually ours, not the company's. Apple reports revenue in
 * every 10-K, but the company-facts processor does not cover it yet, so "not
 * reported" would be false. Company info is sparse too (some companies have no
 * industry or ticker), so this is a normal state, not an error.
 */
const NOT_AVAILABLE = "Not available";

/**
 * Google Finance's exchange codes, keyed by ISO 10383 MIC. These are the codes
 * Google's GOOGLEFINANCE function takes ("NASDAQ:GOOG", "TSE:123") and its
 * quote pages carry (`OTCM:OTCMKTS`, `EQX:NYSEAMERICAN`), the best-documented
 * EXCHANGE:TICKER code set there is. Every Nasdaq tier is plain NASDAQ: neither
 * Google nor press releases print the tier.
 */
const GOOGLE_CODES_BY_MIC: Record<string, string> = {
  XNYS: "NYSE",
  XNGS: "NASDAQ",
  XNMS: "NASDAQ",
  XNCM: "NASDAQ",
  XASE: "NYSEAMERICAN",
  XTSE: "TSE", // Toronto. Google's code; some sites use TSE for Tokyo.
  XASX: "ASX",
  OTCM: "OTCMKTS",
};

/** The same codes keyed by the source's proprietary exchange code. */
const GOOGLE_CODES_BY_CODE: Record<string, string> = {
  NYS: "NYSE",
  NYQ: "NYSE",
  ASE: "NYSEAMERICAN",
  NSM: "NASDAQ",
  NMS: "NASDAQ",
  NAS: "NASDAQ",
  NAQ: "NASDAQ",
  NMQ: "NASDAQ",
  NSQ: "NASDAQ",
  PNK: "OTCMKTS",
  OTC: "OTCMKTS",
  TOR: "TSE",
  ASX: "ASX",
};

/**
 * A listing's exchange as a Google Finance code, or null when the listing names
 * none. Prefers the MIC, a standard identifier, over the source's proprietary
 * code, and falls back to the raw value in capitals for an exchange the tables
 * do not know, so a reader still gets something to look up.
 */
function googleExchangeCode(listing: CurrentListing | null): string | null {
  if (!listing) return null;
  const { exchangeMic, exchangeCode } = listing;
  if (exchangeMic) return GOOGLE_CODES_BY_MIC[exchangeMic] ?? exchangeMic;
  if (exchangeCode)
    return GOOGLE_CODES_BY_CODE[exchangeCode] ?? exchangeCode.toUpperCase();
  return null;
}

type FactProps = {
  label: string;
  value: ReactNode;
  /** Dims the value to mark it as absent rather than reported. */
  muted?: boolean;
  /** A number or a code, set in the figure font unless `muted`. */
  figure?: boolean;
  /** Popover body explaining the fact; adds a click-to-open info trigger by the label. */
  info?: ReactNode;
};

/**
 * One fact: a micro-label over its value, with an info popover where the fact
 * needs explaining. The value is set a size above the data size (`text-base`
 * over the 12px label) so the facts read as the card's summary rather than as
 * more labels; the count tiles below keep their own, larger headline numbers.
 * The label row has a minimum height so an info icon does not push a label
 * below its neighbours.
 */
function Fact({ label, value, muted, figure, info }: FactProps) {
  return (
    <div className={cn("flex flex-col gap-1 min-w-0")}>
      <dt className={cn("flex min-h-4 items-center gap-1")}>
        <span className={cn("type-label")}>{label}</span>
        {info ? (
          <Popover>
            <Popover.Trigger
              render={<InfoButton aria-label={`About ${label}`} />}
            />
            <Popover.Content title={label}>{info}</Popover.Content>
          </Popover>
        ) : null}
      </dt>
      <dd
        className={cn(
          "m-0 type-value text-base",
          figure && !muted && "type-figure",
          muted && "text-muted",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The public-float info body. Public float is not market capitalization, and
 * the label is careful to say so; this explains the distinction in place.
 *
 * It also carries the figure's date, which is no longer printed under the
 * value. The source line names the fiscal year, but public float is not
 * measured at fiscal year end: a 10-K cover page reports it as of the last
 * business day of the second fiscal quarter, so for a calendar-year filer it is
 * June 30, six months before the year in the citation.
 */
function publicFloatInfo(asOf: string | null): string {
  const base =
    "The market value of shares held by non-affiliates. It is similar to " +
    "market capitalization, but excludes insider and controlling holdings.";
  return asOf
    ? `${base} Measured as of ${asOf}: 10-K cover pages report it at the end ` +
        "of the second fiscal quarter, not at fiscal year end."
    : base;
}

/**
 * The revenue info body. Says which filing the figure comes from and that the
 * currency is the filing's own, since the page shows no exchange rate.
 */
const REVENUE_INFO =
  "Total revenue reported in the company's most recent 10-K or 20-F, for " +
  "the fiscal year named in the source line, in the filing's currency.";

/**
 * Formats a company-facts figure with its currency symbol and ISO code -- `$53.60B
 * USD` -- or "Not available" when no filing carried a value. The code rides
 * with the value so a non-USD figure is never mistaken for dollars at a glance.
 */
function formatStat(figure: CitedFigure | null): {
  value: string;
  muted: boolean;
} {
  if (figure === null) return { value: NOT_AVAILABLE, muted: true };
  const amount = formatAmountShort(figure.value, figure.currency);
  return {
    value: figure.currency ? `${amount} ${figure.currency}` : amount,
    muted: false,
  };
}

/** The company facts shown here come from the primary registrant. */
function primaryFacts(company: Company): RegistrantFacts | null {
  return company.registrants.find((r) => r.isPrimary)?.facts ?? null;
}

/**
 * The citations for the facts, as one source line: the LSEG PermID record for
 * industry, headquarters and listing, then the SEC filing for the figures.
 *
 * Each figure carries its own source, but they come from one filing in every
 * record today, so the filing is cited once, naming its fiscal year. A record
 * merged across an amendment can take public float from a 10-K/A and revenue
 * from the 10-K it amends (see {@link RegistrantFacts}); each filing is then
 * cited separately and says which figure it covers.
 */
function FactSources({
  company,
  facts,
}: {
  company: Company;
  facts: RegistrantFacts | null;
}) {
  const [companyInfoSource] = company.sources;
  const filings = new Map<string, { source: Source; names: string[] }>();
  for (const [name, figure] of [
    ["revenue", facts?.revenue],
    ["public float", facts?.publicFloat],
  ] as const) {
    const source = figure?.sources[0];
    if (!source) continue;
    const entry = filings.get(source.url) ?? { source, names: [] };
    entry.names.push(name);
    filings.set(source.url, entry);
  }
  if (!companyInfoSource && filings.size === 0) return null;
  const fiscalYear = facts?.reportDate
    ? `fiscal year ended ${facts.reportDate}`
    : null;

  return (
    <p className={cn("type-caption")}>
      <span className={cn("type-label mr-2")}>Source.</span>
      {companyInfoSource ? (
        <SourceCitation
          source={companyInfoSource}
          detail={`last accessed ${companyInfoSource.lastAccessed}`}
        />
      ) : null}
      {[...filings.values()].map(({ source, names }) => (
        <span key={source.url}>
          {" "}
          <SourceCitation
            source={source}
            detail={
              [filings.size > 1 ? names.join(" and ") : null, fiscalYear]
                .filter(Boolean)
                .join(", ") || undefined
            }
          />
        </span>
      ))}
    </p>
  );
}

/**
 * The company's headline facts, opening the Overview card: industry,
 * headquarters and listing, then revenue and public float, in one row on
 * desktop, with one source line under the lot. These were the bordered cells
 * of the page header until #67.
 *
 * Identity first (industry, headquarters, listing), then size (revenue, public
 * float), in one row of equal columns with no group labels. Citations are a
 * footnote, not a divider, so the order follows what a reader asks rather than
 * which dataset answered.
 *
 * The financials read from the primary registrant's company-facts. There is no
 * market-cap or employee-count field: the figure the cover page reports is
 * public float, and no headcount is extracted.
 */
export function CompanyFacts({ company }: { company: Company }) {
  const industry = company.currentIndustry?.name;
  const ticker = company.currentListing?.ticker;
  const exchange = googleExchangeCode(company.currentListing);
  const facts = primaryFacts(company);
  const revenue = formatStat(facts?.revenue ?? null);
  const publicFloat = formatStat(facts?.publicFloat ?? null);

  // Exchange and ticker as one symbol, "NYSE:LNG" -- the EXCHANGE:TICKER form
  // Google's GOOGLEFINANCE and TradingView use, with Google's exchange codes.
  // It reads as one code, so the whole value takes the figure font rather
  // than switching fonts at the colon.
  const listing =
    exchange && ticker
      ? `${exchange}:${ticker}`
      : (ticker ?? exchange ?? NOT_AVAILABLE);

  return (
    <div className={cn("flex flex-col gap-4")}>
      {/* One list of five equal columns from md, so every fact starts an equal
          step from the last, industry included; a long industry name wraps
          inside its column. On a phone, two columns, industry on a line of its
          own. A description list, so a screen reader announces each label with
          its value. */}
      <dl
        className={cn("m-0 grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-4")}
        aria-label="Company facts"
      >
        <div className={cn("col-span-2 md:col-span-1 min-w-0")}>
          <Fact
            label="Industry"
            value={industry ?? NOT_AVAILABLE}
            muted={!industry}
          />
        </div>
        <Fact
          label="Headquarters"
          value={company.hqCountry ?? NOT_AVAILABLE}
          muted={!company.hqCountry}
        />
        <Fact
          label="Listing"
          value={listing}
          muted={!ticker && !exchange}
          figure
        />
        <Fact
          label="Revenue"
          value={revenue.value}
          muted={revenue.muted}
          figure
          info={REVENUE_INFO}
        />
        <Fact
          label="Public Float"
          value={publicFloat.value}
          muted={publicFloat.muted}
          figure
          info={publicFloatInfo(facts?.publicFloat?.asOf ?? null)}
        />
      </dl>
      <FactSources company={company} facts={facts} />
    </div>
  );
}
