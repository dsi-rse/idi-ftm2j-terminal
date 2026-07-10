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
import { getMockCompanyDetail } from "@/domains/companies/mock-detail";
import type { CompanyData } from "@/domains/companies/types";
import { StandardPageLayout } from "@/layouts";

/**
 * Metadata for the "Companies" page.
 */
export const metadata: Metadata = {
  title: "Companies | FTM2J Terminal | Inclusive Development International",
  description:
    "How FTM2J assembles corporate ownership, shareholder, and debt data from primary disclosures.",
};

function loadCompanies(): CompanyData[] {
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
 * The hidden Pagefind index block. Kept in the DOM so `pagefind` picks up
 * every meta field at build time, but visually hidden and removed from the
 * a11y tree.
 */
function PagefindIndex({ company }: { company: CompanyData }) {
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
      <div data-pagefind-meta="countryName">{company.country}</div>
      <div data-pagefind-meta="countryCode">{company.countryCode}</div>
      <div data-pagefind-meta="tickers">{JSON.stringify(company.tickers)}</div>
      <div data-pagefind-meta="subsidiaries">
        {JSON.stringify(company.subsidiaries)}
      </div>
      <div data-pagefind-meta="sectors">{JSON.stringify(company.sectors)}</div>
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

  const detail = getMockCompanyDetail(company);

  return (
    <StandardPageLayout>
      <RecentlyViewedTracker
        company={{
          permId: company.permId,
          companyName: company.name,
          sector: company.sectors[0],
          country: company.country,
          tickers: company.tickers,
        }}
      />
      <div className="relative flex flex-1 w-full">
        <CompanySearchDrawer />
        <CompanyInspectorOpener />
        <main className="flex-1 min-w-0 flex flex-col gap-4 px-4 md:pl-8 md:pr-4">
          <CompanyHeader detail={detail} />
          <CompanyTabs />
          <div className="flex flex-col gap-4">
            <CompanyOverviewSection detail={detail} />
            <CompanyTreeSection detail={detail} />
            <CompanyShareholdersSection detail={detail} />
            <CompanyDebtSection detail={detail} />
          </div>
        </main>
        <PagefindIndex company={company} />
      </div>
    </StandardPageLayout>
  );
};

export default CompanyPage;
