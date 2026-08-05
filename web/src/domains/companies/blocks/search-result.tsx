import { useRouter } from "next/navigation";

import type { CompanySearchMeta } from "@/domains/companies/stores/companies";
import { formatRelativeTime } from "@/lib/format-relative-time";

import { CompanyBookmark } from "./company-bookmark";

type SearchResultProps = {
  index: number;
  /**
   * Digits to zero-pad the rank to. Pass the width of the highest rank on the
   * page so every row's rank is the same width and the names line up; a page
   * can straddle a digit boundary (91-100), which would otherwise leave the
   * last rows indented past the rest.
   */
  rankWidth?: number;
  active?: boolean;
  company: CompanySearchMeta;
  viewedAt?: number;
};

export function SearchResult({
  index,
  rankWidth = 2,
  active = false,
  company,
  viewedAt,
}: SearchResultProps) {
  const router = useRouter();
  const { permId, companyName, sector, country, tickers } = company;
  return (
    <div
      // Columns are content-sized rather than fixed fractions: the rank grows
      // past two digits deep in the result set and, pinned to one eighth of the
      // panel, would otherwise overrun the name beside it.
      className={`grid grid-cols-[auto_1fr_auto] gap-2 text-sm border-b border-muted/25 p-3 cursor-pointer border-l-2 ${active ? "border-l-primary" : "border-l-transparent"} hover:bg-muted/10`}
      onClick={() => router.push(`/companies/${permId}`)}
    >
      <div className="text-muted text-xs font-mono leading-none">
        <div className="flex flex-row gap-2 items-start">
          <CompanyBookmark company={company} />
          <p>{index.toString().padStart(Math.max(2, rankWidth), "0")}</p>
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-xs leading-none">{companyName}</p>
          <p className="text-muted text-xs font-light leading-none">
            {sector ?? "--"}
          </p>
          <p className="text-muted text-xs font-light leading-none">
            {country ?? "--"}
          </p>
          {viewedAt !== undefined && (
            <p className="text-muted text-xs font-light leading-none">
              {formatRelativeTime(viewedAt)}
            </p>
          )}
        </div>
      </div>
      {tickers && tickers.length > 0 && (
        <div className="justify-self-end leading-none">
          <div className="flex flex-col gap-1">
            {tickers.map((ticker) => (
              <p
                key={ticker}
                className="inline-block font-mono bg-muted/25 text-xs px-1 rounded-sm"
              >
                {ticker}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
