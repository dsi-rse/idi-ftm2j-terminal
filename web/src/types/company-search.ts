/**
 * The raw company metadata Pagefind returns for a search hit — the
 * `data-pagefind-meta` fields emitted by the company detail route, before
 * normalization.
 *
 * Every value is a string because Pagefind meta is string-only; list fields
 * arrive JSON-encoded and need parsing. Distinct from `CompanySearchMeta` in
 * `domains/companies/stores/companies.ts`, which is the normalized shape the
 * UI and the persisted store consume.
 *
 * Lives here rather than in the companies domain because it is read from two
 * layers — `components/search.tsx` and the domain's search hooks — and
 * `components/` may not import from `domains/`.
 */
export type PagefindCompanyMeta = {
  permId: string;
  companyName: string;
  countryName?: string;
  /** JSON-encoded string array. */
  sectors?: string;
  /** JSON-encoded string array. */
  tickers?: string;
};
