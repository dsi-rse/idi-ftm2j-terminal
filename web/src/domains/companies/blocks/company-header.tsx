import type { Company, CurrentListing } from "@/types/domain";

type CompanyHeaderProps = {
  company: Company;
};

/**
 * Shown wherever a field has no value. Company info is genuinely sparse — 6 of
 * 219 companies have no industry, 53 no ticker — so this is a normal state, not
 * an error.
 */
const NOT_REPORTED = "Not reported";

/**
 * Shown for fields whose data source does not exist yet. Distinct from
 * {@link NOT_REPORTED}: this says "we have not built this", not "the source
 * does not have it", and the two should not look alike.
 */
const PENDING = "Awaiting source";

/** ISO 10383 MICs appearing in the company-info dataset. */
const EXCHANGE_LABELS: Record<string, string> = {
  XNYS: "NYSE",
  XNGS: "Nasdaq GS",
  XNMS: "Nasdaq GM",
  XNCM: "Nasdaq CM",
  XASE: "NYSE American",
  XTSE: "Toronto",
  OTCM: "OTC Markets",
};

/**
 * Resolve a listing to a display label. Prefers the MIC because it is a
 * standard identifier, falling back to the source's proprietary code, which
 * has better coverage (179 rows vs 163).
 */
function formatExchange(listing: CurrentListing | null): string {
  if (!listing) return NOT_REPORTED;
  const { exchangeMic, exchangeCode } = listing;
  if (exchangeMic) return EXCHANGE_LABELS[exchangeMic] ?? exchangeMic;
  if (exchangeCode) return exchangeCode;
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
    <div className="flex flex-col gap-1 border border-muted/25 px-3 py-2 min-w-0">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted font-medium">
        {label}
      </span>
      <span
        className={`font-mono text-xs truncate ${
          muted ? "text-muted" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A stat cell whose data source has not been built yet. Renders the label and
 * an explicit pending state rather than a number, so the page never presents a
 * figure it cannot cite.
 */
function PendingStatCell({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1 border border-dashed border-muted/25 px-4 py-3 min-w-0">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted font-medium">
        {label}
      </span>
      <span className="text-sm text-muted font-inter-tight leading-none py-1">
        {PENDING}
      </span>
      <span className="font-mono text-[10px] text-muted">pending company facts</span>
    </div>
  );
}

/**
 * The top-of-page header block for a company: name, primary metadata cells
 * (industry / HQ country / ticker / exchange), and the three financial stat
 * cells.
 *
 * Market cap, revenue, and employees have no source in the company-info
 * dataset — the data spec routes all three through the company-facts processor,
 * which does not exist yet — so they render a pending state instead of a
 * figure. Stacks vertically on mobile.
 */
export function CompanyHeader({ company }: CompanyHeaderProps) {
  const industry = company.currentIndustry?.name;
  const ticker = company.currentListing?.ticker;
  const exchange = formatExchange(company.currentListing);

  return (
    <header className="w-full flex flex-col md:flex-row md:items-start md:justify-between gap-6 pb-6 border-b border-muted/25">
      <div className="flex flex-col gap-3 min-w-0">
        <h1 className="font-inter-tight tracking-tight text-3xl md:text-4xl font-semibold text-foreground leading-none">
          {company.name}
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl">
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
            label="Ticker"
            value={ticker ?? NOT_REPORTED}
            muted={!ticker}
          />
          <LabeledCell
            label="Exchange"
            value={exchange}
            muted={exchange === NOT_REPORTED}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:min-w-[520px]">
        <PendingStatCell label="Market Cap" />
        <PendingStatCell label="Revenue" />
        <PendingStatCell label="Employees" />
      </div>
    </header>
  );
}
