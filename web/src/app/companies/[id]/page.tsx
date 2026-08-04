import fs from "fs";

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
import { getMockSections } from "@/domains/companies/mock-sections";
import { StandardPageLayout, TerminalShell } from "@/layouts";
import type { Company } from "@/types/domain";

/**
 * Metadata for the "Companies" page.
 */
export const metadata: Metadata = {
  title: "Companies | FTM2J Terminal | Inclusive Development International",
  description:
    "How FTM2J assembles corporate ownership, shareholder, and debt data from primary disclosures.",
};

function loadCompanies(): Company[] {
  const filePath = process.env.INPUT_DATA_FILE_PATH;
  if (!filePath || !fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return loadCompanies().map((c) => ({ id: c.permId }));
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
 * The hidden Pagefind index block. Kept in the DOM so `pagefind` picks up
 * every meta field at build time, but visually hidden and removed from the
 * a11y tree.
 *
 * Only fields something downstream actually reads belong here — see
 * `use-all-companies-search.ts` and `components/search.tsx`.
 */
function PagefindIndex({ company }: { company: Company }) {
  const ticker = company.currentListing?.ticker;
  return (
    <article
      data-pagefind-body
      aria-hidden="true"
      className="sr-only"
    >
      <div data-pagefind-meta="permId">{company.permId}</div>
      <div
        data-pagefind-meta="companyName"
        data-pagefind-sort="companyName"
        data-pagefind-weight="2.0"
      >
        {company.name}
      </div>
      <div data-pagefind-meta="countryName">{company.hqCountry ?? ""}</div>
      <div data-pagefind-meta="tickers">
        {JSON.stringify(ticker ? [ticker] : [])}
      </div>
      <div data-pagefind-meta="sectors">
        {JSON.stringify(sectorNames(company))}
      </div>
    </article>
  );
}

const CompanyPage = async ({ params }: CompanyPageParams) => {
  const { id } = await params;
  const company = loadCompanies().find((c) => c.permId === id);
  if (!company) {
    return (
      <StandardPageLayout>
        <div className="py-16 text-center text-muted">
          <p className="text-sm">Company not found.</p>
        </div>
      </StandardPageLayout>
    );
  }

  // Tree, Holders, and Debt have no processor yet; everything else on this
  // page is real. See mock-sections.ts.
  const mock = getMockSections(company);

  return (
    <TerminalShell>
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
        <CompanySearchDrawer />
        <CompanyInspectorOpener />
        <main className="flex-1 min-w-0 flex flex-col gap-4 px-4 md:pl-8 md:pr-4">
          <CompanyHeader company={company} />
          <CompanyTabs />
          <div className="flex flex-col gap-4">
            <CompanyOverviewSection company={company} />
            <CompanyTreeSection tree={mock.tree} source={mock.treeSource} />
            <CompanyShareholdersSection
              shareholders={mock.shareholders}
              source={mock.shareholdersSource}
            />
            <CompanyDebtSection
              debtInstruments={mock.debtInstruments}
              source={mock.debtSource}
            />
          </div>
        </main>
        <PagefindIndex company={company} />
      </div>
    </TerminalShell>
  );
};

export default CompanyPage;
