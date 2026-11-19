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
 * Shown wherever a field has no value. Company info is genuinely sparse — 6 of
 * 219 companies have no industry, 53 no ticker — so this is a normal state, not
 * an error. Public float and revenue reuse it too: the company-facts source
 * exists now, so a missing figure is "not reported", not "not built".
 */
const NOT_REPORTED = "Not reported";

/** ISO 10383 MICs appearing in the company-info dataset. */
const MIC_LABELS: Record<string, string> = {
  XNYS: "NYSE",
  XNGS: "Nasdaq GS",
  XNMS: "Nasdaq GM",
  XNCM: "Nasdaq CM",
  XASE: "NYSE American",
  XTSE: "Toronto",
  OTCM: "OTC Markets",
};

/**
 * The source's proprietary exchange codes, kept in a separate table from
 * {@link MIC_LABELS} so it stays obvious which namespace a key belongs to.
 * Separate tables rather than one merged map: the two namespaces happen not to
 * collide today, but nothing upstream guarantees that.
 *
 * Labels deliberately repeat the MIC labels rather than being more precise. In
 * the dataset each code co-occurs with exactly one MIC — `PNK` only ever
 * appears alongside `OTCM`, `NSM` alongside `XNGS` — so giving the code a
 * finer label ("OTC Pink") would print two different names for one exchange
 * depending on which field happened to be populated.
 */
const CODE_LABELS: Record<string, string> = {
  NYS: "NYSE", // XNYS
  NYQ: "NYSE", // no MIC in the data; RICs carry no suffix, so NYSE
  ASE: "NYSE American", // XASE
  NSM: "Nasdaq GS", // XNGS
  NMS: "Nasdaq GM", // XNMS
  NAS: "Nasdaq CM", // XNCM
  // NAQ/NMQ/NSQ never co-occur with a MIC; their RICs end in `.O`, which
  // places them on Nasdaq but says nothing about the tier. The Yahoo-style
  // reading of these codes disagrees with this source — here NMS is the Global
  // Market, where Yahoo uses it for Global Select — so the tier is left off
  // rather than guessed.
  NAQ: "Nasdaq",
  NMQ: "Nasdaq",
  NSQ: "Nasdaq",
  PNK: "OTC Markets", // OTCM
  OTC: "OTC Markets", // OTCM
  TOR: "Toronto", // XTSE
  ASX: "ASX", // no MIC in the data; RIC `.AX`. Already the colloquial name.
};

/**
 * Resolve a listing to a display label. Prefers the MIC because it is a
 * standard identifier, falling back to the source's proprietary code, which
 * has better coverage (179 rows vs 163).
 *
 * Both lookups fall through to the raw value: coverage is best-effort against
 * the exchanges seen so far, and an unrecognized code from a wider company
 * universe should still show something a reader can look up.
 */
function formatExchange(listing: CurrentListing | null): string {
  if (!listing) return NOT_REPORTED;
  const { exchangeMic, exchangeCode } = listing;
  if (exchangeMic) return MIC_LABELS[exchangeMic] ?? exchangeMic;
  if (exchangeCode) return CODE_LABELS[exchangeCode] ?? exchangeCode;
  return NOT_REPORTED;
}

type FactProps = {
  label: string;
  value: string;
  /** Dims the value to mark it as absent rather than reported. */
  muted?: boolean;
  /** A number or a ticker. Set in the mono unless `muted`. */
  figure?: boolean;
  /** Popover body explaining the figure; adds a click-to-open info trigger by the label. */
  info?: ReactNode;
};

/**
 * One fact: a micro-label over a value, with an info popover for a figure that
 * needs explaining. The label row has a minimum height so the info icon does
 * not push a label below its neighbours.
 *
 * No box around it, and no as-of or citation line under it. These were
 * bordered cells in the page header; inside the Overview card a second level of
 * boxes would only nest borders, and each group's one source line says where
 * its facts came from (#67).
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
          "m-0 type-value",
          figure && !muted && "type-figure",
          muted ? "text-muted" : "text-foreground",
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
 * USD` -- or the not-reported marker when no filing carried a value. The code
 * rides with the value so a non-USD figure is never mistaken for dollars at a
 * glance.
 */
function formatStat(figure: CitedFigure | null): {
  value: string;
  muted: boolean;
} {
  if (figure === null) return { value: NOT_REPORTED, muted: true };
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
 * The citation for the financial figures. Each figure carries its own source,
 * but they come from one filing in every record today, so this collapses them
 * to a single citation naming the fiscal year.
 *
 * A record merged across an amendment can take public float from a 10-K/A and
 * revenue from the 10-K it amends (see {@link RegistrantFacts}); one citation
 * would then name a filing that lacks one of the figures. In that case each
 * filing is cited separately, and says which figure it covers.
 */
function FinancialSources({ facts }: { facts: RegistrantFacts | null }) {
  const figures = [
    { name: "public float", figure: facts?.publicFloat ?? null },
    { name: "revenue", figure: facts?.revenue ?? null },
  ];
  const byUrl = new Map<string, { source: Source; names: string[] }>();
  for (const { name, figure } of figures) {
    const source = figure?.sources[0];
    if (!source) continue;
    const entry = byUrl.get(source.url) ?? { source, names: [] };
    entry.names.push(name);
    byUrl.set(source.url, entry);
  }
  if (byUrl.size === 0) return null;
  const several = byUrl.size > 1;
  const fiscalYear = facts?.reportDate
    ? `fiscal year ended ${facts.reportDate}`
    : null;
  return (
    <>
      {[...byUrl.values()].map(({ source, names }, i) => {
        const detail = [several ? names.join(" and ") : null, fiscalYear]
          .filter(Boolean)
          .join(", ");
        return (
          <span key={source.url}>
            {i > 0 ? " " : null}
            <SourceCitation source={source} detail={detail || undefined} />
          </span>
        );
      })}
    </>
  );
}

/**
 * The company's headline facts, in two groups stacked one above the other:
 * the profile (industry / HQ country / primary listing / ticker) and the
 * financial figures (public float / revenue). Rendered inside the Overview
 * card; these were the bordered cells of the page header until #67.
 *
 * Two groups because the two have different sources and different readers: the
 * profile is one LSEG PermID record, the figures one SEC filing. Each group
 * ends in its own source line, so a citation sits under exactly the facts it
 * covers. Both use the same four-column grid from md, so the figures line up
 * under the first two profile facts; on a phone each is two columns.
 *
 * The financials read from the primary registrant's company-facts. There is no
 * market-cap or employee-count field: the figure the cover page reports is
 * public float, and no headcount is extracted.
 */
export function CompanyFacts({ company }: { company: Company }) {
  const industry = company.currentIndustry?.name;
  const ticker = company.currentListing?.ticker;
  const exchange = formatExchange(company.currentListing);
  const facts = primaryFacts(company);
  const publicFloat = formatStat(facts?.publicFloat ?? null);
  const revenue = formatStat(facts?.revenue ?? null);
  const [companyInfoSource] = company.sources;
  const grid = "m-0 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4";

  return (
    <div className={cn("flex flex-col gap-4")}>
      <div className={cn("flex flex-col gap-3")}>
        {/* A description list, so a screen reader announces each label with
            its value and the group's name. */}
        <dl className={cn(grid)} aria-label="Company profile">
          <Fact
            label="Primary Industry"
            value={industry ?? NOT_REPORTED}
            muted={!industry}
          />
          <Fact
            label="Country Headquartered"
            value={company.hqCountry ?? NOT_REPORTED}
            muted={!company.hqCountry}
          />
          <Fact
            label="Primary Listing"
            value={exchange}
            muted={exchange === NOT_REPORTED}
          />
          <Fact
            label="Ticker"
            value={ticker ?? NOT_REPORTED}
            muted={!ticker}
            figure
          />
        </dl>
        {companyInfoSource ? (
          <p className={cn("type-caption")}>
            <span className={cn("type-label mr-2")}>Source.</span>
            <SourceCitation
              source={companyInfoSource}
              detail={`last accessed ${companyInfoSource.lastAccessed}`}
            />
          </p>
        ) : null}
      </div>
      <div className={cn("flex flex-col gap-3 pt-4 border-t border-muted/15")}>
        <dl className={cn(grid)} aria-label="Financials">
          <Fact
            label="Public Float"
            value={publicFloat.value}
            muted={publicFloat.muted}
            figure
            info={publicFloatInfo(facts?.publicFloat?.asOf ?? null)}
          />
          <Fact
            label="Revenue"
            value={revenue.value}
            muted={revenue.muted}
            figure
            info={REVENUE_INFO}
          />
        </dl>
        {/* Neither figure reported: no filing to cite, so no source line. */}
        {facts?.publicFloat || facts?.revenue ? (
          <p className={cn("type-caption")}>
            <span className={cn("type-label mr-2")}>Source.</span>
            <FinancialSources facts={facts} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
