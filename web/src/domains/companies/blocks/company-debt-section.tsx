"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { RowIndex, Table } from "@/components/table";
import type { DebtInstrument } from "@/domains/companies/types";
import { formatUsdShort } from "@/lib/format-currency";

type CompanyDebtSectionProps = {
  debtInstruments: DebtInstrument[];
  source: string;
};

type SortState = { direction: "asc" | "desc" };

const INLINE_PAGE_SIZE = 5;
const EXPANDED_PAGE_SIZE = 15;

function filterDebt(
  debt: DebtInstrument[],
  query: string,
): DebtInstrument[] {
  const q = query.trim().toLowerCase();
  if (!q) return debt;
  return debt.filter(
    (d) =>
      d.lender.toLowerCase().includes(q) ||
      d.instrument.toLowerCase().includes(q),
  );
}

function sortDebt(debt: DebtInstrument[], sort: SortState): DebtInstrument[] {
  const factor = sort.direction === "desc" ? -1 : 1;
  return [...debt].sort((a, b) => (a.amountUsd - b.amountUsd) * factor);
}

function DebtTable({
  debt,
  pageSize,
}: {
  debt: DebtInstrument[];
  pageSize: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ direction: "desc" });

  const filtered = useMemo(() => filterDebt(debt, query), [debt, query]);
  const sorted = useMemo(() => sortDebt(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  return (
    <div>
      <Table.Toolbar>
        <SearchInput
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setPage(1);
          }}
          placeholder="Search debt by lender or instrument…"
        />
      </Table.Toolbar>
      <Table>
        <Table.Head>
          <tr>
            <Table.HeaderCell className="w-10">#</Table.HeaderCell>
            <Table.HeaderCell>Lender</Table.HeaderCell>
            <Table.HeaderCell>Instrument</Table.HeaderCell>
            <Table.HeaderCell>Rate</Table.HeaderCell>
            <Table.HeaderCell
              align="right"
              sortable
              sortDirection={sort.direction}
              onSort={() =>
                setSort((prev) => ({
                  direction: prev.direction === "desc" ? "asc" : "desc",
                }))
              }
            >
              Amount
            </Table.HeaderCell>
          </tr>
        </Table.Head>
        <Table.Body>
          {visible.length === 0 ? (
            <Table.Empty colSpan={5}>
              No debt instruments match your search.
            </Table.Empty>
          ) : (
            visible.map((instrument, i) => (
              <Table.Row key={`${instrument.lender}-${i}`}>
                <Table.Cell>
                  <RowIndex index={start + i + 1} />
                </Table.Cell>
                <Table.Cell
                  primary={instrument.lender}
                  secondary={`${instrument.currency} · ${instrument.syndication}`}
                />
                <Table.Cell
                  primary={instrument.instrument}
                  secondary={`Maturity ${instrument.maturity}`}
                />
                <Table.Cell
                  primary={instrument.rate}
                  secondary={instrument.rateType}
                />
                <Table.Cell
                  align="right"
                  primary={formatUsdShort(instrument.amountUsd)}
                  secondary="Outstanding"
                />
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
 * The "Commercial Debt" section: searchable, paginated table of disclosed
 * debt instruments. Sortable by outstanding amount. Inline view paginates
 * 5-per-page; fullscreen modal view paginates 15-per-page.
 */
export function CompanyDebtSection({
  debtInstruments,
  source,
}: CompanyDebtSectionProps) {
  const total = debtInstruments.reduce((s, d) => s + d.amountUsd, 0);
  return (
    <SectionCard
      id="debt"
      title="Commercial Debt"
      subtitle={`${debtInstruments.length} instruments · ${formatUsdShort(total)} outstanding · illustrative sample`}
      info="Disclosed commercial debt instruments — revolving facilities, term loans, senior notes, and trade finance. Private debt may not be reflected."
      source={source}
      expanded={
        <DebtTable
          debt={debtInstruments}
          pageSize={EXPANDED_PAGE_SIZE}
        />
      }
    >
      <DebtTable
        debt={debtInstruments}
        pageSize={INLINE_PAGE_SIZE}
      />
    </SectionCard>
  );
}
