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
        className={`font-mono text-xs whitespace-nowrap ${
          muted ? "text-muted" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * One column of the stat group. The value is deliberately not a number: market
 * cap, revenue, and employees are all routed through the company-facts
 * processor, which does not exist yet. The grouping matches the design so the
 * shape is already right when real figures arrive, but the muted text keeps it
 * legible as pending rather than as data.
 */
function PendingStat({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 flex-1 min-w-0">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted font-medium">
        {label}
      </span>
      <span className="font-inter-tight text-sm text-muted leading-none py-1">
        {PENDING}
      </span>
      <span className="font-mono text-[10px] text-muted">
        pending company facts
      </span>
    </div>
  );
}

/**
 * The top-of-page header block for a company: name, primary metadata cells
 * (industry / HQ country / primary listing / ticker), and the three financial stat
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
        {/* Cells size to their content and wrap, rather than sitting in a
            fixed grid — mono labels vary enough in width that equal columns
            either clip or force the longest label onto two lines. */}
        <div className="flex flex-wrap gap-2 max-w-2xl">
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
        </div>
      </div>
      <div className="flex flex-col sm:flex-row border border-muted/25 divide-y sm:divide-y-0 sm:divide-x divide-muted/25 md:min-w-[520px]">
        <PendingStat label="Market Cap" />
        <PendingStat label="Revenue" />
        <PendingStat label="Employees" />
      </div>
    </header>
  );
}
