import { type MatchSegment, matchName } from "@/lib/match-subsidiaries";

import type { CompanySearchResultItem } from "./hooks/use-all-companies-search";
import type { CompanySearchMeta } from "./stores/companies";

/** The query's words, split the way the matcher splits them. */
function queryWords(query: string): string[] {
  return query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function hasMatch(segments: MatchSegment[]): boolean {
  return segments.some((s) => s.matched);
}

/**
 * The Recent and Saved tabs' search: the companies kept on this device that
 * match the rail's query, each segmented for the same highlight an All result
 * gets.
 *
 * It matches the fields a stored entry keeps -- name, tickers, PermID, sector
 * and country -- with the word rules the All tab uses to explain its results
 * (`matchName`), and like Pagefind it requires every word of the query to hit
 * one of them. Subsidiaries are not searched: the store deliberately drops them
 * (see `toSearchMeta`), which is why these tabs' placeholder does not offer
 * them.
 *
 * An empty query returns the list unchanged, unsegmented, so the rows render
 * plain.
 */
export function filterStoredCompanies<T extends CompanySearchMeta>(
  companies: T[],
  query: string,
): (T & CompanySearchResultItem)[] {
  const words = queryWords(query);
  if (words.length === 0) return companies;

  return companies.flatMap((company) => {
    const tickers = company.tickers ?? [];
    const fields = [
      company.companyName,
      company.permId,
      company.sector ?? "",
      company.country ?? "",
      ...tickers,
    ];
    const matchesEveryWord = words.every((word) =>
      fields.some((field) => hasMatch(matchName(word, field))),
    );
    if (!matchesEveryWord) return [];
    return [
      {
        ...company,
        nameSegments: matchName(query, company.companyName),
        permIdSegments: matchName(query, company.permId),
        sectorSegments: matchName(query, company.sector ?? ""),
        countrySegments: matchName(query, company.country ?? ""),
        tickerSegments: tickers.map((ticker) => matchName(query, ticker)),
      },
    ];
  });
}
