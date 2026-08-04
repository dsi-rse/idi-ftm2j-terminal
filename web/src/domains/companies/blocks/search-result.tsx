import { useRouter } from "next/navigation";

import type { CompanySearchMeta } from "@/domains/companies/stores/companies";
import { formatRelativeTime } from "@/lib/format-relative-time";

import { CompanyBookmark } from "./company-bookmark";

type SearchResultProps = {
  index: number;
  active?: boolean;
  company: CompanySearchMeta;
  viewedAt?: number;
};

export function SearchResult({
  index,
  active = false,
  company,
  viewedAt,
}: SearchResultProps) {
  const router = useRouter();
  const { permId, companyName, sector, country, tickers } = company;
  return (
    <div
      className={`grid grid-cols-8 text-sm border-b border-muted/25 p-3 cursor-pointer border-l-2 ${active ? "border-l-primary" : "border-l-transparent"} hover:bg-muted/10`}
      onClick={() => router.push(`/companies/${permId}`)}
    >
      <div className="col-span-1 text-muted text-xs font-mono leading-none">
        <div className="flex flex-row gap-2 items-start">
          <CompanyBookmark company={company} />
          <p>{index.toString().padStart(2, "0")}</p>
        </div>
      </div>
      <div className="col-span-5">
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
        <div className="col-span-2 justify-self-end leading-none">
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
