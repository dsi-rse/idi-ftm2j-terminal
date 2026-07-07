import { formatUsdShortValue } from "@/domains/companies/mock-detail";
import type { CompanyDetail } from "@/domains/companies/types";

type CompanyHeaderProps = {
  detail: CompanyDetail;
};

type LabeledCellProps = {
  label: string;
  value: string;
};

function LabeledCell({ label, value }: LabeledCellProps) {
  return (
    <div className="flex flex-col gap-1 border border-muted/25 px-3 py-2 min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-muted font-medium">
        {label}
      </span>
      <span className="text-sm text-foreground truncate font-inter-tight">
        {value}
      </span>
    </div>
  );
}

type StatCellProps = {
  label: string;
  value: string;
  asOf: string;
};

function StatCell({ label, value, asOf }: StatCellProps) {
  return (
    <div className="flex flex-col gap-1 border border-muted/25 px-4 py-3 min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-muted font-medium">
        {label}
      </span>
      <span className="text-2xl font-semibold text-foreground font-inter-tight leading-none">
        {value}
      </span>
      <span className="text-[10px] text-muted">{asOf}</span>
    </div>
  );
}

/**
 * The top-of-page header block for a company: name, primary metadata
 * cells (industry / HQ / ticker), and three stat cells (market cap /
 * revenue / employees). Stacks vertically on mobile.
 */
export function CompanyHeader({ detail }: CompanyHeaderProps) {
  const ticker = detail.tickers[0] ?? "—";
  return (
    <header className="w-full flex flex-col md:flex-row md:items-start md:justify-between gap-6 pb-6 border-b border-muted/25">
      <div className="flex flex-col gap-3 min-w-0">
        <h1 className="font-inter-tight tracking-tight text-3xl md:text-4xl font-semibold text-foreground leading-none">
          {detail.name}
        </h1>
        <div className="grid grid-cols-3 gap-2 max-w-lg">
          <LabeledCell label="Primary Industry" value={detail.primaryIndustry} />
          <LabeledCell label="Country Headquartered" value={detail.headquarters} />
          <LabeledCell label="Ticker" value={ticker} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:min-w-[520px]">
        <StatCell
          label="Market Cap"
          value={formatUsdShortValue(detail.marketCapUsd)}
          asOf={`as of ${detail.marketCapAsOf}`}
        />
        <StatCell
          label="Revenue"
          value={formatUsdShortValue(detail.revenueUsd)}
          asOf={`as of ${detail.revenueFiscalYearEnd}`}
        />
        <StatCell
          label="Employees"
          value={detail.employees.toLocaleString()}
          asOf={`as of ${detail.revenueFiscalYearEnd}`}
        />
      </div>
    </header>
  );
}
