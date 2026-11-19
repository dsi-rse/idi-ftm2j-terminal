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
  /** Small line under the value, e.g. the as-of date and currency. */
  sub?: string;
  /** URL of the filing the figure was extracted from, linked as attribution. */
  href?: string | null;
  /** Short label for the {@link href} link, e.g. the form type "10-K". */
  hrefLabel?: string;
};

/**
 * One fact: a micro-label over a value. The categorical facts pass only those;
 * a financial figure adds an info popover and an as-of/currency subline linking
 * the filing it came from. One component rather than two so the facts cannot
 * drift apart. The label row has a minimum height so the info icon does not
 * push a label below its neighbours.
 *
 * No box around it. These were bordered cells in the page header; inside the
 * Overview card a second level of boxes would only nest borders (#67).
 */
function Fact({
  label,
  value,
  muted,
  figure,
  info,
  sub,
  href,
  hrefLabel,
}: FactProps) {
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
      {sub || href ? (
        <dd className={cn("m-0 type-caption")}>
          {sub}
          {sub && href ? " · " : null}
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              // nowrap on the link alone: the line may wrap before "10-K" on a
              // phone, but never at its hyphen.
              className={cn(
                "whitespace-nowrap underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              )}
            >
              {hrefLabel ?? "filing"}
            </a>
          ) : null}
        </dd>
      ) : null}
    </div>
  );
}

/**
 * The public-float info body. Public float is not market capitalization, and
 * the label is careful to say so; this explains the distinction in place.
 */
const PUBLIC_FLOAT_INFO =
  "The market value of shares held by non-affiliates. It is similar to market " +
  "capitalization, but excludes insider and controlling holdings. It is " +
  "measured as of the date shown.";

/**
 * The revenue info body. Says which filing the figure comes from and that the
 * currency is the filing's own, since the header shows no exchange rate.
 */
const REVENUE_INFO =
  "Total revenue reported in the company's most recent 10-K or 20-F, for " +
  "the fiscal year ending on the date shown, in the filing's currency.";

/**
 * Formats a company-facts figure with its currency symbol and ISO code -- `$53.60B
 * USD` -- or the not-reported marker when no filing carried a value. The code
 * rides with the value rather than the subline so a non-USD figure is never
 * mistaken for dollars at a glance; the subline names only the as-of date and
 * the figure's own citation.
 *
 * The citation is per figure rather than per record: a record based on a 10-K/A
 * can take its revenue from the 10-K that amendment amends, and linking both
 * figures to the amendment would cite a filing that does not contain the
 * revenue shown. See {@link RegistrantFacts}.
 */
function formatStat(figure: CitedFigure | null): {
  value: string;
  sub?: string;
  muted: boolean;
  href: string | null;
  hrefLabel: string;
} {
  if (figure === null) {
    return { value: NOT_REPORTED, muted: true, href: null, hrefLabel: "filing" };
  }
  const amount = formatAmountShort(figure.value, figure.currency);
  return {
    value: figure.currency ? `${amount} ${figure.currency}` : amount,
    sub: figure.asOf ? `as of ${figure.asOf}` : undefined,
    muted: false,
    href: figure.sources[0]?.url ?? null,
    hrefLabel: figure.formType || "filing",
  };
}

/** The company facts shown here come from the primary registrant. */
function primaryFacts(company: Company): RegistrantFacts | null {
  return company.registrants.find((r) => r.isPrimary)?.facts ?? null;
}


/**
 * The company's headline facts: the categorical record (industry / HQ country /
 * primary listing / ticker) and the financial figures (public float / revenue),
 * as one list of label/value pairs. Rendered inside the Overview card; these
 * were the bordered cells of the page header until #67.
 *
 * The financials read from the primary registrant's company-facts. They sit in
 * the same list as the categorical facts rather than a separate panel -- the
 * source boundary is not something a reader needs -- but each carries an
 * as-of subline linking its own filing. There is no market-cap or
 * employee-count field: the figure the cover page reports is public float, and
 * no headcount is extracted.
 *
 * The categorical facts are all read off one LSEG PermID record, so they share
 * one citation beneath the list rather than repeating it four times. The
 * financial facts cite their own SEC filing inline.
 */
export function CompanyFacts({ company }: { company: Company }) {
  const industry = company.currentIndustry?.name;
  const ticker = company.currentListing?.ticker;
  const exchange = formatExchange(company.currentListing);

  const facts = primaryFacts(company);
  // Each figure carries its own citation -- the two can name different filings
  // when the record was merged across an amendment. Linked as attribution;
  // absent when the cited filing has no URL.
  const publicFloat = formatStat(facts?.publicFloat ?? null);
  const revenue = formatStat(facts?.revenue ?? null);

  const [companyInfoSource] = company.sources;

  return (
    <div className={cn("flex flex-col gap-3")}>
      {/* Two columns on a phone, three from md: the two rows then split into
          the listing record and the money. A description list, so a screen
          reader announces each label with its value. */}
      <dl
        className={cn("m-0 grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4")}
        aria-label="Company facts"
      >
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
        <Fact
          label="Public Float"
          value={publicFloat.value}
          sub={publicFloat.sub}
          muted={publicFloat.muted}
          figure
          info={PUBLIC_FLOAT_INFO}
          href={publicFloat.href}
          hrefLabel={publicFloat.hrefLabel}
        />
        <Fact
          label="Revenue"
          value={revenue.value}
          sub={revenue.sub}
          muted={revenue.muted}
          figure
          info={REVENUE_INFO}
          href={revenue.href}
          hrefLabel={revenue.hrefLabel}
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
  );
}
