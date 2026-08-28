import fs from "fs";
import path from "path";

import type { Company } from "@/types/domain";

/**
 * Build-time access to the company dataset the static site is generated from.
 *
 * Server-only (`fs`): imported by the companies route at build time, never by a
 * client component. `build_dataset.py` writes `index.ndjson` (one light record
 * per company) plus one `detail/<shard>/<permId>.json` per company; this module
 * reads the index to pick and order the pages that get prerendered, then reads
 * only each rendered page's own detail file. Keeping every shareholding makes
 * the full array exceed Node's ~536 MB single-string cap, so the dataset can no
 * longer be read as one string.
 */

/**
 * How many company pages to prerender.
 *
 * The Workers Free plan caps the number of static asset files per Worker
 * *version*, and Next emits several files per page (`.html`, `.rsc`, and
 * per-segment prefetch payloads under `.segments/`), so the full dataset's
 * asset count exceeds that cap and Cloudflare refuses the deploy (API error
 * 10304). Prerendering a capped subset keeps the deploy under the limit.
 *
 * This is a billing constraint, not a data or product decision. Workers Paid
 * raises the limit enough to fit the whole dataset; at that point this
 * constant, `rankForDeploy`, and the slice in `selectedIndex` should all be
 * deleted rather than retuned. Until then `MAX_COMPANY_PAGES` overrides the
 * default without a code change, and the rejection message reports the exact
 * asset count, so the true ceiling is measurable rather than guessed.
 */
const MAX_COMPANY_PAGES = Number(process.env.MAX_COMPANY_PAGES ?? 2000);

const DATA_DIR = process.env.INPUT_DATA_DIR;

/**
 * The light per-company record in `index.ndjson`: identity plus the
 * content-depth counts `rankForDeploy` sorts on. The heavy nested lists live
 * in the detail file and are never loaded to pick or order pages.
 */
export type CompanyIndexEntry = {
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
 * landed: most companies have a tree, so every tree-bearing company outranked
 * every shareholder-only one, and the largest holder lists -- Alphabet (no debt,
 * no tree), Apple, Amazon -- fell past the cap entirely.
 *
 * So rank each company by its *best* standing in any one section: the top holder
 * pages, the top tree pages, and all debt pages interleave at the front, and no
 * section is washed out by a section that happens to be more common. Total
 * content and then `permId` break ties, keeping the surviving set stable build
 * to build so a page does not silently 404 between deploys.
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
const detailCache = new Map<string, Company>();

function loadIndex(): CompanyIndexEntry[] {
  indexCache ??= readIndex();
  return indexCache;
}

/** The companies that get a prerendered page, capped and content-ordered. */
export function selectedIndex(): CompanyIndexEntry[] {
  selectedCache ??= (() => {
    const all = loadIndex();
    if (all.length <= MAX_COMPANY_PAGES) return all;
    return rankForDeploy(all).slice(0, MAX_COMPANY_PAGES);
  })();
  return selectedCache;
}

/** Reads one company's full record from its detail file. */
export function findCompany(permId: string): Company | undefined {
  if (!DATA_DIR) return undefined;
  if (!detailCache.has(permId)) {
    const detailPath = path.join(
      DATA_DIR,
      "detail",
      detailShard(permId),
      `${permId}.json`,
    );
    if (!fs.existsSync(detailPath)) {
      // A page is only rendered for an id the index vouches for
      // (generateStaticParams + dynamicParams=false), so a missing detail file
      // is an index/detail mismatch in our own build, not a real 404. Fail the
      // build loudly rather than emit a broken page.
      throw new Error(
        `Company ${permId} is in the index but has no detail file at ` +
          `${detailPath}; index.ndjson and detail/ are out of sync.`,
      );
    }
    detailCache.set(
      permId,
      JSON.parse(fs.readFileSync(detailPath, "utf-8")) as Company,
    );
  }
  return detailCache.get(permId);
}
