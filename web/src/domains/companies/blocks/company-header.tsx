"use client";

import type { ReactNode } from "react";

import { InfoButton } from "@/blocks/info-button";
import { Popover } from "@/components/popover";
import { formatAmountShort } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { Company, CurrentListing, RegistrantFacts } from "@/types/domain";

type CompanyHeaderProps = {
  company: Company;
};

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

type LabeledCellProps = {
  label: string;
  value: string;
  /** Dims the value to mark it as absent rather than reported. */
  muted?: boolean;
};

function LabeledCell({ label, value, muted }: LabeledCellProps) {
  return (
    <div className="flex flex-col gap-1 border border-muted/25 px-3 py-2">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted font-medium whitespace-nowrap">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-xs whitespace-nowrap",
          muted ? "text-muted" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

type StatCellProps = {
  label: string;
  value: string;
  /** Small line under the value, e.g. the as-of date and currency. */
  sub?: string;
  /** Dims the value to mark it as absent rather than reported. */
  muted?: boolean;
  /** Popover body explaining the figure; adds a click-to-open info trigger by the label. */
  info?: ReactNode;
  /** URL of the filing the figure was extracted from, linked as attribution. */
  href?: string | null;
  /** Short label for the {@link href} link, e.g. the form type "10-K". */
  hrefLabel?: string;
};

/**
 * A financial figure in the header cell group. Heavier than {@link LabeledCell}
 * — the value is Inter Tight rather than mono, and it carries an as-of/currency
 * subline — so a market figure reads as a headline number rather than as
 * another categorical tag. Cells share the metadata cells' border and box so
 * the group reads as one strip; the type weight is the only thing setting the
 * financials apart.
 */
function StatCell({
  label,
  value,
  sub,
  muted,
  info,
  href,
  hrefLabel,
}: StatCellProps) {
  return (
    <div className="flex flex-col gap-1 border border-muted/25 px-3 py-2">
      <span className="flex items-center gap-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted font-medium whitespace-nowrap">
          {label}
        </span>
        {info ? (
          <Popover>
            <Popover.Trigger
              render={<InfoButton aria-label={`About ${label}`} />}
            />
            <Popover.Content title={label}>{info}</Popover.Content>
          </Popover>
        ) : null}
      </span>
      <span
        className={cn(
          "font-inter-tight text-base leading-none",
          muted ? "text-muted" : "text-foreground",
        )}
      >
        {value}
      </span>
      {sub || href ? (
        <span className="font-mono text-[10px] text-muted whitespace-nowrap">
          {sub}
          {sub && href ? " · " : null}
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {hrefLabel ?? "filing"}
            </a>
          ) : null}
        </span>
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
  "measured as of the date shown, not today.";

/**
 * Formats a company-facts figure with its currency symbol, or the not-reported
 * marker when the filing carried no value. Returns the value and a subline
 * naming the as-of date and ISO currency, so a non-USD figure is never mistaken
 * for dollars.
 */
function formatStat(
  value: number | null,
  currency: string | null,
  asOf: string | null,
): { value: string; sub?: string; muted: boolean } {
  if (value === null) return { value: NOT_REPORTED, muted: true };
  const subParts = [asOf ? `as of ${asOf}` : null, currency].filter(Boolean);
  return {
    value: formatAmountShort(value, currency),
    sub: subParts.length ? subParts.join(" · ") : undefined,
    muted: false,
  };
}

/** The company facts shown in the header come from the primary registrant. */
function primaryFacts(company: Company): RegistrantFacts | null {
  return company.registrants.find((r) => r.isPrimary)?.facts ?? null;
}

/**
 * The top-of-page header block for a company: name, then one cell group holding
 * the categorical metadata (industry / HQ country / primary listing / ticker)
 * and the financial figures (public float / revenue) side by side.
 *
 * The financials read from the primary registrant's company-facts. They sit in
 * the same strip as the metadata rather than a separate panel — the source
 * boundary is not something a reader needs — but carry heavier type and an
 * as-of/currency subline so a market figure still reads as a headline number.
 * There is no market-cap or employee-count field: the figure the cover page
 * reports is public float, and no headcount is extracted. Stacks on mobile.
 */
export function CompanyHeader({ company }: CompanyHeaderProps) {
  const industry = company.currentIndustry?.name;
  const ticker = company.currentListing?.ticker;
  const exchange = formatExchange(company.currentListing);

  const facts = primaryFacts(company);
  const publicFloat = formatStat(
    facts?.publicFloat ?? null,
    facts?.publicFloatCurrency ?? null,
    facts?.publicFloatAsOf ?? null,
  );
  const revenue = formatStat(
    facts?.revenue ?? null,
    facts?.revenueCurrency ?? null,
    facts?.revenueAsOf ?? null,
  );
  // Both figures come from the primary registrant's one filing, so they share
  // its citation. Linked as attribution; absent when there is no source URL.
  const filingUrl = facts?.sources?.[0]?.url ?? null;
  const filingLabel = facts?.formType || "filing";

  return (
    <header className="w-full flex flex-col gap-3 pb-6 border-b border-muted/25">
      <h1 className="font-inter-tight tracking-tight text-3xl md:text-4xl font-semibold text-foreground leading-none">
        {company.name}
      </h1>
      {/* Cells size to their content and wrap, rather than sitting in a
          fixed grid — mono labels vary enough in width that equal columns
          either clip or force the longest label onto two lines. */}
      <div className="flex flex-wrap gap-2">
        <LabeledCell
          label="Primary Industry"
          value={industry ?? NOT_REPORTED}
          muted={!industry}
        />
        <LabeledCell
          label="Country Headquartered"
          value={company.hqCountry ?? NOT_REPORTED}
          muted={!company.hqCountry}
        />
        <LabeledCell
          label="Primary Listing"
          value={exchange}
          muted={exchange === NOT_REPORTED}
        />
        <LabeledCell
          label="Ticker"
          value={ticker ?? NOT_REPORTED}
          muted={!ticker}
        />
        <StatCell
          label="Public Float"
          value={publicFloat.value}
          sub={publicFloat.sub}
          muted={publicFloat.muted}
          info={PUBLIC_FLOAT_INFO}
          href={publicFloat.muted ? null : filingUrl}
          hrefLabel={filingLabel}
        />
        <StatCell
          label="Revenue"
          value={revenue.value}
          sub={revenue.sub}
          muted={revenue.muted}
          href={revenue.muted ? null : filingUrl}
          hrefLabel={filingLabel}
        />
      </div>
    </header>
  );
}
