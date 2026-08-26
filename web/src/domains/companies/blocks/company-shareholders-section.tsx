"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { RowIndex, Table } from "@/components/table";
import { formatAmountShort } from "@/lib/format-currency";
import type { Company, CurrentShareholder } from "@/types/domain";

type CompanyShareholdersSectionProps = {
  company: Company;
};

type SortState = { direction: "asc" | "desc" };

const INLINE_PAGE_SIZE = 5;
const EXPANDED_PAGE_SIZE = 15;

/**
 * Largest USD market value first. There is no percent-ownership column to sort
 * on — the shareholder-tracker reports no shares-outstanding denominator — so
 * value is the one meaningful order.
 */
const DEFAULT_SORT: SortState = { direction: "desc" };

function filterShareholders(
  holders: CurrentShareholder[],
  query: string,
): CurrentShareholder[] {
  const q = query.trim().toLowerCase();
  if (!q) return holders;
  return holders.filter(
    (holder) =>
      (holder.investor.name ?? "").toLowerCase().includes(q) ||
      holder.investorType.toLowerCase().includes(q) ||
      (holder.investorCountry ?? "").toLowerCase().includes(q),
  );
}

/**
 * Sorts by USD market value, keeping holdings with no reported value last in
 * **both** directions. An absent value is missing information, not zero, so
 * ascending order must not open with the blank cells.
 */
function sortShareholders(
  holders: CurrentShareholder[],
  sort: SortState,
): CurrentShareholder[] {
  const factor = sort.direction === "desc" ? -1 : 1;
  return [...holders].sort((a, b) => {
    if (a.marketValueUsd === null || b.marketValueUsd === null) {
      if (a.marketValueUsd === b.marketValueUsd) return 0;
      return a.marketValueUsd === null ? 1 : -1;
    }
    return (a.marketValueUsd - b.marketValueUsd) * factor;
  });
}

function ShareholdersTable({
  holders,
  pageSize,
}: {
  holders: CurrentShareholder[];
  pageSize: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const filtered = useMemo(
    () => filterShareholders(holders, query),
    [holders, query],
  );
  const sorted = useMemo(
    () => sortShareholders(filtered, sort),
    [filtered, sort],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleSort = () =>
    setSort((prev) => ({
      direction: prev.direction === "desc" ? "asc" : "desc",
    }));

  return (
    <div>
      <Table.Toolbar>
        <SearchInput
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setPage(1);
          }}
          placeholder="Search holders by name, type, or country…"
        />
      </Table.Toolbar>
      <Table>
        <Table.Head>
          <tr>
            <Table.HeaderCell className="w-10">#</Table.HeaderCell>
            <Table.HeaderCell>Holder</Table.HeaderCell>
            <Table.HeaderCell>Country</Table.HeaderCell>
            <Table.HeaderCell>Security</Table.HeaderCell>
            <Table.HeaderCell>Reported</Table.HeaderCell>
            <Table.HeaderCell align="right">Shares</Table.HeaderCell>
            <Table.HeaderCell
              align="right"
              sortable
              sortDirection={sort.direction}
              onSort={toggleSort}
            >
              Value
            </Table.HeaderCell>
          </tr>
        </Table.Head>
        <Table.Body>
          {visible.length === 0 ? (
            <Table.Empty colSpan={7}>No holders match your search.</Table.Empty>
          ) : (
            visible.map((holder, i) => {
              const [source] = holder.sources;
              return (
                <Table.Row key={`${holder.investor.name}-${start + i}`}>
                  <Table.Cell>
                    <RowIndex index={start + i + 1} />
                  </Table.Cell>
                  <Table.Cell
                    primary={holder.investor.name ?? "Unnamed holder"}
                    secondary={holder.investorType}
                  />
                  <Table.Cell>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {holder.investorCountry ?? "—"}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {holder.securityType || "—"}
                    </span>
                  </Table.Cell>
                  <Table.Cell
                    primary={
                      // Per-row click-through to the filing the holding was
                      // extracted from. Holders draw on many filings, so the
                      // row is where the citation belongs.
                      source ? (
                        <a
                          href={source.url}
                          title={`${source.name} — ${source.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          {holder.asOf}
                        </a>
                      ) : (
                        holder.asOf
                      )
                    }
                    secondary={source?.name}
                  />
                  <Table.Cell
                    align="right"
                    primary={
                      holder.sharesOwned === null
                        ? "Not reported"
                        : holder.sharesOwned.toLocaleString()
                    }
                  />
                  <Table.Cell
                    align="right"
                    primary={
                      holder.marketValueUsd === null
                        ? "Not reported"
                        : formatAmountShort(holder.marketValueUsd, "USD")
                    }
                  />
                </Table.Row>
              );
            })
          )}
        </Table.Body>
      </Table>
      {totalPages > 1 ? (
        <Table.Footer>
          <Pagination
            variant="subtle"
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </Table.Footer>
      ) : null}
    </div>
  );
}

const INFO_COPY =
  "Institutional and pension-fund holdings in this company, one row per disclosed holding, each linking to the filing it was extracted from. Institutional holdings come from SEC Form 13-F; pension-fund holdings come from the fund's own reports. Values are reproduced in USD as the processor reported them. Percent-of-outstanding stake is still not shown: the shares-outstanding denominator is now available from the company's latest 10-K or 20-F, but it counts common shares as of that filing's cover date, which mismatches each holding's own report date and share class — so a derived percentage stays deferred pending review rather than presenting a mismatched ratio as a sourced fact. Coverage is limited to holdings whose issuer resolves to a known company, so this is a floor on who holds the company, not a complete register.";

/**
 * The count line under the section title: how many holders, and the report date
 * they were disclosed as of. The date is the latest across holdings; today's
 * data reports a single quarter-end, but a mix would show the most recent.
 */
function subtitle(holders: CurrentShareholder[]): string {
  const latest = holders.reduce(
    (newest, holder) => (holder.asOf > newest ? holder.asOf : newest),
    "",
  );
  const count = `${holders.length} holder${holders.length === 1 ? "" : "s"}`;
  return latest ? `${count} · reported ${latest}` : count;
}

/**
 * The "retrieved" clause of the source footer, honest across all holdings
 * rather than reading one arbitrary row.
 *
 * `lastAccessed` is a real per-holding retrieval date, not a uniform build
 * stamp (unlike the debt section, where every row shares the pipeline run
 * date). Today every attached holding carries the same processor stamp, so
 * this collapses to one date — but a company mixing sources with different
 * access dates renders the full range instead of misrepresenting the rest with
 * the first value. Mirrors the corporate tree's earliest–latest treatment.
 */
function retrievedLabel(holders: CurrentShareholder[]): string {
  const dates = holders
    .map((holder) => holder.sources[0]?.lastAccessed)
    .filter((date): date is string => Boolean(date))
    .sort();
  if (dates.length === 0) return "";
  const earliest = dates[0];
  const latest = dates[dates.length - 1];
  return earliest === latest
    ? `, retrieved ${earliest}`
    : `, retrieved ${earliest}–${latest}`;
}

/**
 * The "Shareholders" section: searchable, sortable, paginated table of the
 * institutional and pension-fund holders disclosed against this company. Inline
 * view paginates 5-per-page; the fullscreen view paginates 15-per-page.
 *
 * Value leads rather than stake percent, which is the reverse of the original
 * design. The shares-outstanding denominator now arrives with company-facts (on
 * the primary registrant, via the passed `company`), but it is the 10-K
 * cover-date common-share count, which does not line up with each holding's own
 * report date and share class. So the percent-of-outstanding column and the
 * quarter-over-quarter delta beside it stay deferred pending review — see the
 * multi-CIK / company-facts plan's open question — rather than rendering a
 * mismatched ratio. Value continues to lead.
 */
export function CompanyShareholdersSection({
  company,
}: CompanyShareholdersSectionProps) {
  const holders = company.currentShareholders;

  if (holders.length === 0) {
    return (
      <SectionCard
        id="holders"
        title="Shareholders"
        subtitle="No disclosed shareholders"
        info={INFO_COPY}
      >
        <p className="text-sm text-muted leading-relaxed m-0">
          No shareholding is attached to this company. Holdings are attached by
          resolving the security a holder reported to a known issuer, and a
          company whose securities have not been resolved appears here even when
          holders exist. Coverage improves as issuer resolution fills in
          upstream.
        </p>
      </SectionCard>
    );
  }

  const documents = new Set(
    holders.map((holder) => holder.sources[0]?.url).filter(Boolean),
  ).size;

  return (
    <SectionCard
      id="holders"
      title="Shareholders"
      subtitle={subtitle(holders)}
      info={INFO_COPY}
      source={
        <>
          {documents} disclosure{documents === 1 ? "" : "s"}
          {retrievedLabel(holders)}. Each row links to the filing it was
          extracted from.
        </>
      }
      expanded={
        <ShareholdersTable holders={holders} pageSize={EXPANDED_PAGE_SIZE} />
      }
    >
      <ShareholdersTable holders={holders} pageSize={INLINE_PAGE_SIZE} />
    </SectionCard>
  );
}
