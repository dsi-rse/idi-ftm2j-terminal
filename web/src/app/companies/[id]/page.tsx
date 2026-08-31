import { Metadata } from "next";

import { CompanyDebtSection } from "@/domains/companies/blocks/company-debt-section";
import { CompanyHeader } from "@/domains/companies/blocks/company-header";
import { CompanyOverviewSection } from "@/domains/companies/blocks/company-overview-section";
import { CompanyShareholdersSection } from "@/domains/companies/blocks/company-shareholders-section";
import { CompanyTabs } from "@/domains/companies/blocks/company-tabs";
import { CompanyTreeSection } from "@/domains/companies/blocks/company-tree-section";
import { RecentlyViewedTracker } from "@/domains/companies/blocks/recently-viewed-tracker";
import {
  CompanyInspectorOpener,
  CompanySearchDrawer,
} from "@/domains/companies/blocks/search-drawer";
import { findCompany, selectedIndex } from "@/domains/companies/dataset";
import { StandardPageLayout, TerminalShell } from "@/layouts";
import { foldDiacritics } from "@/lib/fold-diacritics";
import type { Company } from "@/types/domain";

/**
 * Metadata for the "Companies" page.
 */
export const metadata: Metadata = {
  title: "Companies | FTM2J Terminal | Inclusive Development International",
  description:
    "How FTM2J assembles corporate ownership, shareholder, and debt data from primary disclosures.",
};

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return selectedIndex().map((entry) => ({ id: entry.permId }));
}

type CompanyPageParams = {
  params: Promise<{ id: string }>;
};

/**
 * Every sector label for a company, most specific first. Feeds the Pagefind
 * `sectors` meta field, which renders the sector chip in search results.
 */
function sectorNames(company: Company): string[] {
  const names = [
    company.currentIndustry?.name,
    ...company.currentSectors.map((s) => s.name),
  ];
  return names.filter((n): n is string => Boolean(n));
}

/**
 * Every subsidiary this company disclosed, in the order it disclosed them.
 *
 * Feeds two Pagefind fields at once: the folded text that makes a subsidiary
 * name findable, and the `subsidiaries` meta the result row reads back to say
 * *which* subsidiary a query matched. Both come from the same array so the two
 * can never disagree.
 *
 * Uncapped, deliberately — Community Health Systems discloses 1,284 names, about
 * 18 KB gzipped in its fragment. Truncating the list would save little (a
 * fragment is fetched only for a result actually on screen) and would leave rows
 * that matched on a dropped name unable to explain themselves.
 *
 * Blank names are dropped: they carry nothing to match and, joined with ". "
 * into the indexed text, an empty entry would emit a lone "." word that throws
 * off the word-count reconstruction in `match-fields.ts` (which counts this same
 * array), forcing that whole page onto the unreliable fallback path.
 */
function subsidiaryNames(company: Company): string[] {
  return company.currentCorporateRelationships
    .map((r) => r.child.name.trim())
    .filter((name) => name !== "");
}

/**
 * The hidden Pagefind index block. Kept in the DOM so `pagefind` picks up
 * every meta field at build time, but visually hidden and removed from the
 * a11y tree.
 *
 * Only fields something downstream actually reads belong here — see
 * `use-all-companies-search.ts` and `components/search.tsx`.
 *
 * **Two halves, deliberately.** The first group is what Pagefind *indexes*, and
 * it is diacritic-folded so an ASCII query reaches an accented name (see
 * `fold-diacritics.ts`). The second group carries no indexable text at all —
 * `data-pagefind-ignore` keeps it out of the index — and exists only to hand
 * the *unfolded* display strings to the UI as metadata.
 *
 * One element cannot do both jobs. Before folding existed each `div` was
 * simultaneously the indexed text and the meta value, and folding such an
 * element in place would ship `"Panama"` to the search results for a company
 * filed as `"Panamá"` — correct matching, wrong name on screen. An ignored
 * element still contributes its `data-pagefind-meta` value, and still registers
 * `data-pagefind-sort`, which is what makes the split work.
 */
function PagefindIndex({ company }: { company: Company }) {
  const ticker = company.currentListing?.ticker;
  const tickers = ticker ? [ticker] : [];
  const sectors = sectorNames(company);
  const subsidiaries = subsidiaryNames(company);
  return (
    <article
      data-pagefind-body
      aria-hidden="true"
      className="sr-only"
    >
      {/* Indexed, folded. No meta — these are search fodder only. The name
          outweighs the rest so a name match beats an incidental one. */}
      <div>{company.permId}</div>
      <div data-pagefind-weight="2.0">{foldDiacritics(company.name)}</div>
      <div>{foldDiacritics(company.hqCountry ?? "")}</div>
      <div>{tickers.join(" ")}</div>
      <div>{foldDiacritics(sectors.join(" "))}</div>
      {/* Subsidiaries are weighted well below the company name so a company
          that *is* the query outranks one that merely owns something matching
          it. Names are separated by ". " rather than " " to keep a quoted
          phrase query from matching across the seam between two of them. */}
      <div data-pagefind-weight="0.3">
        {foldDiacritics(subsidiaries.join(". "))}
      </div>

      {/* Display values, unfolded and unindexed. List fields travel
          JSON-encoded because Pagefind meta is string-only. */}
      <div data-pagefind-ignore data-pagefind-meta="permId">
        {company.permId}
      </div>
      <div
        data-pagefind-ignore
        data-pagefind-meta="companyName"
        data-pagefind-sort="companyName"
      >
        {company.name}
      </div>
      <div data-pagefind-ignore data-pagefind-meta="countryName">
        {company.hqCountry ?? ""}
      </div>
      <div data-pagefind-ignore data-pagefind-meta="tickers">
        {JSON.stringify(tickers)}
      </div>
      <div data-pagefind-ignore data-pagefind-meta="sectors">
        {JSON.stringify(sectors)}
      </div>
      <div data-pagefind-ignore data-pagefind-meta="subsidiaries">
        {JSON.stringify(subsidiaries)}
      </div>
    </article>
  );
}

const CompanyPage = async ({ params }: CompanyPageParams) => {
  const { id } = await params;
  const company = findCompany(id);
  if (!company) {
    return (
      <StandardPageLayout>
        <div className="py-16 text-center text-muted">
          <p className="text-sm">Company not found.</p>
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <TerminalShell sidebar={<CompanySearchDrawer />}>
      <RecentlyViewedTracker
        company={{
          permId: company.permId,
          companyName: company.name,
          sector: company.currentIndustry?.name,
          country: company.hqCountry ?? undefined,
          tickers: company.currentListing?.ticker
            ? [company.currentListing.ticker]
            : [],
        }}
      />
      <div className="relative flex flex-1 w-full">
        <CompanyInspectorOpener />
        <main className="flex-1 min-w-0 flex flex-col gap-4 px-4 md:pl-8 md:pr-4">
          <CompanyHeader company={company} />
          <CompanyTabs companyName={company.name} />
          <div className="flex flex-col gap-4">
            <CompanyOverviewSection company={company} />
            <CompanyTreeSection company={company} />
            <CompanyShareholdersSection company={company} />
            <CompanyDebtSection company={company} />
          </div>
        </main>
        <PagefindIndex company={company} />
      </div>
    </TerminalShell>
  );
};

export default CompanyPage;
