"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import {
  DeltaCell,
  DistributionBar,
  RowIndex,
  Table,
} from "@/components/table";
import type { Shareholder } from "@/domains/companies/types";
import { formatUsdShort } from "@/lib/format-currency";

type CompanyShareholdersSectionProps = {
  shareholders: Shareholder[];
  source: string;
};

type SortKey = "stakePct" | "deltaPct" | "valueUsd";
type SortState = { key: SortKey; direction: "asc" | "desc" };

const INLINE_PAGE_SIZE = 5;
const EXPANDED_PAGE_SIZE = 15;

function filterShareholders(
  shareholders: Shareholder[],
  query: string,
): Shareholder[] {
  const q = query.trim().toLowerCase();
  if (!q) return shareholders;
  return shareholders.filter(
    (holder) =>
      holder.name.toLowerCase().includes(q) ||
      holder.type.toLowerCase().includes(q) ||
      holder.country.toLowerCase().includes(q),
  );
}

function sortShareholders(
  shareholders: Shareholder[],
  sort: SortState,
): Shareholder[] {
  const factor = sort.direction === "desc" ? -1 : 1;
  return [...shareholders].sort(
    (a, b) => (a[sort.key] - b[sort.key]) * factor,
  );
}

function ShareholdersTable({
  shareholders,
  pageSize,
  maxStake,
}: {
  shareholders: Shareholder[];
  pageSize: number;
  maxStake: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({
    key: "stakePct",
    direction: "desc",
  });

  const filtered = useMemo(
    () => filterShareholders(shareholders, query),
    [shareholders, query],
  );
  const sorted = useMemo(() => sortShareholders(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );
  };

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
            <Table.HeaderCell
              align="right"
              sortable
              sortDirection={sort.key === "stakePct" ? sort.direction : null}
              onSort={() => toggleSort("stakePct")}
            >
              Stake
            </Table.HeaderCell>
            <Table.HeaderCell
              align="right"
              sortable
              sortDirection={sort.key === "deltaPct" ? sort.direction : null}
              onSort={() => toggleSort("deltaPct")}
            >
              Δ Q-1
            </Table.HeaderCell>
            <Table.HeaderCell
              align="right"
              sortable
              sortDirection={sort.key === "valueUsd" ? sort.direction : null}
              onSort={() => toggleSort("valueUsd")}
            >
              Value
            </Table.HeaderCell>
            <Table.HeaderCell>Distribution</Table.HeaderCell>
          </tr>
        </Table.Head>
        <Table.Body>
          {visible.length === 0 ? (
            <Table.Empty colSpan={7}>No holders match your search.</Table.Empty>
          ) : (
            visible.map((holder, i) => (
              <Table.Row key={`${holder.name}-${i}`}>
                <Table.Cell>
                  <RowIndex index={start + i + 1} />
                </Table.Cell>
                <Table.Cell primary={holder.name} secondary={holder.type} />
                <Table.Cell>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    {holder.country}
                  </span>
                </Table.Cell>
                <Table.Cell align="right">
                  <span className="tabular-nums font-medium">
                    {holder.stakePct.toFixed(2)}%
                  </span>
                </Table.Cell>
                <Table.Cell align="right">
                  <DeltaCell value={holder.deltaPct} />
                </Table.Cell>
                <Table.Cell align="right">
                  <span className="tabular-nums">
                    {formatUsdShort(holder.valueUsd)}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <DistributionBar value={holder.stakePct / maxStake} />
                </Table.Cell>
              </Table.Row>
            ))
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

/**
 * The "Shareholders" section: searchable, sortable, paginated table of
 * institutional and sovereign holders. Inline view paginates 5-per-page;
 * fullscreen modal view paginates 15-per-page and gives the table more
 * horizontal room.
 */
export function CompanyShareholdersSection({
  shareholders,
  source,
}: CompanyShareholdersSectionProps) {
  const maxStake = Math.max(
    ...shareholders.map((s) => s.stakePct),
    0.0001,
  );
  return (
    <SectionCard
      id="holders"
      title="Shareholders"
      subtitle={`${shareholders.length} institutional holders · illustrative sample`}
      info="Institutional and sovereign holders aggregated from 13-F filings and beneficial-ownership disclosures. Stake percentages are of outstanding shares. Not yet wired to real filings."
      source={source}
      expanded={
        <ShareholdersTable
          shareholders={shareholders}
          pageSize={EXPANDED_PAGE_SIZE}
          maxStake={maxStake}
        />
      }
    >
      <ShareholdersTable
        shareholders={shareholders}
        pageSize={INLINE_PAGE_SIZE}
        maxStake={maxStake}
      />
    </SectionCard>
  );
}
