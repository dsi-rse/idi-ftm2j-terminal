import fs from "fs";
import path from "path";

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

/**
 * How many company pages to prerender.
 *
 * The Workers Free plan accepts 20,000 static asset files per Worker *version*,
 * and Next does not emit one file per page: each company costs a `.html`, a
 * `.rsc`, and five more per-segment prefetch payloads under `.segments/`, about
 * 7.6 of which are uploaded. The full 4,832-company dataset came to 36,765 and
 * Cloudflare refused the deploy (API error 10304), which puts the ceiling near
 * 2,600 companies.
 *
 * This is a billing constraint, not a data or product decision. Workers Paid
 * raises the limit to 100,000 and fits the whole dataset with room to spare; at
 * that point this constant, `rankForDeploy`, and the slice in `selectedIndex`
 * should all be deleted rather than retuned. Until then `MAX_COMPANY_PAGES`
 * overrides it without a code change, and the rejection message reports the
 * exact asset count, so the true ceiling is measurable rather than guessed.
 */
const MAX_COMPANY_PAGES = Number(process.env.MAX_COMPANY_PAGES ?? 2000);

/**
 * The build reads its data from a directory, not one file. `build_dataset.py`
 * writes `index.ndjson` (one light record per company) plus one
 * `detail/<shard>/<permId>.json` per company. Keeping every shareholding makes
 * the full array >1 GB — past Node's ~536 MB single-string cap — so the whole
 * dataset can no longer be read as one string. Selection reads only the index;
 * each rendered page reads only its own detail file.
 */
const DATA_DIR = process.env.INPUT_DATA_DIR;

/**
 * The light per-company record in `index.ndjson`: identity plus the
 * content-depth counts `byContentDepth` sorts on. The heavy nested lists live
 * in the detail file and are never loaded to pick or order pages.
 */
type CompanyIndexEntry = {
  permId: string;
  name: string;
  hqCountry: string | null;
  debtCount: number;
  treeCount: number;
  shareholderCount: number;
};

/**
 * The detail-file subdirectory for a PermID. Mirrors `index_shard` in
 * `build_dataset.py`; if one changes, the other must.
 */
function detailShard(permId: string): string {
  return permId.length >= 2 ? permId.slice(0, 2) : "_";
}

const CONTENT_SECTIONS = ["debtCount", "treeCount", "shareholderCount"] as const;

/**
 * Orders companies so the cap keeps the pages worth reviewing, richest first.
 *
 * Taking the dataset's own first N would be simpler and is wrong: most companies
 * render empty sections, so an arbitrary slice could contain almost none of a
 * given section -- and a deploy showing none of them cannot be used to review
 * that section.
 *
 * Ranking by one section (debt, then tree) was also wrong once shareholders
 * landed: 4,482 companies have a tree, so every tree-bearing company outranked
 * every shareholder-only one, and the largest holder lists -- Alphabet (9,538
 * holders, no debt, no tree), Apple, Amazon -- fell past the cap entirely.
 *
 * So rank each company by its *best* standing in any one section: the top holder
 * pages, the top tree pages, and all 186 debt pages interleave at the front,
 * and no section is washed out by a section that happens to be more common.
 * Total content and then `permId` break ties, keeping the surviving set stable
 * build to build so a page does not silently 404 between deploys.
 */
function rankForDeploy(entries: CompanyIndexEntry[]): CompanyIndexEntry[] {
  const bestRank = new Map<string, number>();
  for (const section of CONTENT_SECTIONS) {
    const ranked = entries
      .filter((e) => e[section] > 0)
      .sort((a, b) => b[section] - a[section] || a.permId.localeCompare(b.permId));
    ranked.forEach((entry, i) => {
      if (i < (bestRank.get(entry.permId) ?? Infinity)) {
        bestRank.set(entry.permId, i);
      }
    });
  }
  const total = (e: CompanyIndexEntry) =>
    e.debtCount + e.treeCount + e.shareholderCount;
  return [...entries].sort(
    (a, b) =>
      (bestRank.get(a.permId) ?? Infinity) - (bestRank.get(b.permId) ?? Infinity) ||
      total(b) - total(a) ||
      a.permId.localeCompare(b.permId),
  );
}

/**
 * Reads `index.ndjson` as a Buffer split on newlines rather than as one UTF-8
 * string: the index grows with the company count, and a single-string read
 * would reintroduce the ~536 MB cap this split exists to avoid. Each line is
 * one small record.
 */
function readIndex(): CompanyIndexEntry[] {
  if (!DATA_DIR) return [];
  const indexPath = path.join(DATA_DIR, "index.ndjson");
  if (!fs.existsSync(indexPath)) return [];
  const buffer = fs.readFileSync(indexPath);
  const entries: CompanyIndexEntry[] = [];
  let start = 0;
  for (let i = 0; i <= buffer.length; i++) {
    if (i === buffer.length || buffer[i] === 0x0a) {
      if (i > start) {
        const line = buffer.toString("utf8", start, i).trim();
        if (line) entries.push(JSON.parse(line) as CompanyIndexEntry);
      }
      start = i + 1;
    }
  }
  return entries;
}

/**
 * The index and the selected page set, read once per build worker.
 * `generateStaticParams` and every render share them.
 */
let indexCache: CompanyIndexEntry[] | undefined;
let selectedCache: CompanyIndexEntry[] | undefined;
const detailCache = new Map<string, Company | null>();

function loadIndex(): CompanyIndexEntry[] {
  indexCache ??= readIndex();
  return indexCache;
}

/** The companies that get a prerendered page, capped and content-ordered. */
function selectedIndex(): CompanyIndexEntry[] {
  selectedCache ??= (() => {
    const all = loadIndex();
    if (all.length <= MAX_COMPANY_PAGES) return all;
    return rankForDeploy(all).slice(0, MAX_COMPANY_PAGES);
  })();
  return selectedCache;
}

/** Reads one company's full record from its detail file. */
function findCompany(permId: string): Company | undefined {
  if (!DATA_DIR) return undefined;
  if (!detailCache.has(permId)) {
    const detailPath = path.join(
      DATA_DIR,
      "detail",
      detailShard(permId),
      `${permId}.json`,
    );
    const company = fs.existsSync(detailPath)
      ? (JSON.parse(fs.readFileSync(detailPath, "utf-8")) as Company)
      : null;
    detailCache.set(permId, company);
  }
  return detailCache.get(permId) ?? undefined;
}

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
