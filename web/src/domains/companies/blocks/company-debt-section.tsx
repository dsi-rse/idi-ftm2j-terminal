"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { RowIndex, Table } from "@/components/table";
import { formatAmountShort } from "@/lib/format-currency";
import type { Company, CurrentCommercialDebt } from "@/types/domain";

type CompanyDebtSectionProps = {
  company: Company;
};

type SortKey = "filedOn" | "amount";
type SortState = { key: SortKey; direction: "asc" | "desc" };

const INLINE_PAGE_SIZE = 5;
const EXPANDED_PAGE_SIZE = 15;

/**
 * Most recently disclosed first. Not by amount: a third of instruments report no
 * amount at all and the rest span five currencies with no conversion rate, so
 * ordering by that number ranks nothing meaningful.
 */
const DEFAULT_SORT: SortState = { key: "filedOn", direction: "desc" };

/**
 * Instrument names arrive with the filing's line breaks intact — "Senior Notes
 * due\n2024" — because they are spans lifted out of 8-K prose. Collapsing runs
 * of whitespace is a display fix and changes no words.
 */
function displayName(instrument: CurrentCommercialDebt): string {
  return instrument.instrumentName.replace(/\s+/g, " ").trim();
}

function filterDebt(
  debt: CurrentCommercialDebt[],
  query: string,
): CurrentCommercialDebt[] {
  const q = query.trim().toLowerCase();
  if (!q) return debt;
  return debt.filter(
    (instrument) =>
      displayName(instrument).toLowerCase().includes(q) ||
      instrument.lenders.some((lender) => lender.toLowerCase().includes(q)),
  );
}

/**
 * Sorts by the active column, keeping instruments with no amount last in **both**
 * directions. An absent amount is missing information, not a small number, so
 * ascending order must not open with 385 blank cells.
 */
function sortDebt(
  debt: CurrentCommercialDebt[],
  sort: SortState,
): CurrentCommercialDebt[] {
  const factor = sort.direction === "desc" ? -1 : 1;
  return [...debt].sort((a, b) => {
    if (sort.key === "amount") {
      if (a.amount === null || b.amount === null) {
        if (a.amount === b.amount) return 0;
        return a.amount === null ? 1 : -1;
      }
      return (a.amount - b.amount) * factor;
    }
    // ISO-8601 dates compare lexicographically.
    return a.asOf.localeCompare(b.asOf) * factor;
  });
}

/**
 * The maturity line under an instrument's name. An instrument the filing gave no
 * end date for says so rather than showing an empty cell — 86% of what ships is
 * in that state, so silence would read as a rendering fault.
 */
function maturityLabel(instrument: CurrentCommercialDebt): string {
  if (instrument.status === "Undated" || !instrument.endDate) {
    return "No end date disclosed";
  }
  return `Matures ${instrument.endDate}`;
}

/**
 * Lender labels for one instrument, and the count of any beyond the first.
 *
 * A label is whatever the filing called the counterparty, which is often a role
 * rather than a name — "lenders party thereto", "the underwriters". Those are
 * carried through deliberately; see the section's info copy.
 */
function lenderLabel(instrument: CurrentCommercialDebt): {
  primary: string;
  secondary: string | undefined;
} {
  const [first, ...rest] = instrument.lenders;
  if (!first) return { primary: "Lender not disclosed", secondary: undefined };
  return {
    primary: first,
    secondary: rest.length ? `+${rest.length} more` : undefined,
  };
}

function DebtTable({
  debt,
  pageSize,
}: {
  debt: CurrentCommercialDebt[];
  pageSize: number;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const filtered = useMemo(() => filterDebt(debt, query), [debt, query]);
  const sorted = useMemo(() => sortDebt(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );

  return (
    <div>
      <Table.Toolbar>
        <SearchInput
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            setPage(1);
          }}
          placeholder="Search debt by instrument or lender…"
        />
      </Table.Toolbar>
      <Table>
        <Table.Head>
          <tr>
            <Table.HeaderCell className="w-10">#</Table.HeaderCell>
            <Table.HeaderCell>Instrument</Table.HeaderCell>
            <Table.HeaderCell>Lender</Table.HeaderCell>
            <Table.HeaderCell
              sortable
              sortDirection={sort.key === "filedOn" ? sort.direction : undefined}
              onSort={() => toggle("filedOn")}
            >
              Filed on
            </Table.HeaderCell>
            <Table.HeaderCell
              align="right"
              sortable
              sortDirection={sort.key === "amount" ? sort.direction : undefined}
              onSort={() => toggle("amount")}
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
            visible.map((instrument, i) => {
              const lender = lenderLabel(instrument);
              const [source] = instrument.sources;
              return (
                <Table.Row key={`${instrument.asOf}-${start + i}`}>
                  <Table.Cell>
                    <RowIndex index={start + i + 1} />
                  </Table.Cell>
                  <Table.Cell
                    primary={displayName(instrument)}
                    secondary={maturityLabel(instrument)}
                  />
                  <Table.Cell
                    primary={lender.primary}
                    secondary={lender.secondary}
                  />
                  <Table.Cell
                    primary={
                      // Per-row click-through to the 8-K. A company can draw on
                      // dozens of filings, so the row is where a citation
                      // belongs — a footer listing 38 links cites nothing
                      // usefully.
                      source ? (
                        <a
                          href={source.url}
                          title={`${source.name} — ${source.url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          {instrument.asOf}
                        </a>
                      ) : (
                        instrument.asOf
                      )
                    }
                    secondary={source?.name}
                  />
                  <Table.Cell
                    align="right"
                    primary={
                      instrument.amount === null
                        ? "Not reported"
                        : formatAmountShort(instrument.amount)
                    }
                    secondary={instrument.currency ?? undefined}
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
  "Commercial debt instruments disclosed in this company's 8-K filings, one row per instrument, each linking to the filing it was extracted from. Amounts are reproduced as reported and are not converted — instruments occur in several currencies and no exchange rate is available, so figures in different currencies are not comparable and are never totalled. Most instruments disclose no end date; those are shown as undated rather than assumed current or expired. A lender appears as the filing describes it, which is sometimes a role such as \"the lenders party thereto\" rather than a name. Interest rates are not extracted. Matured and superseded instruments are excluded, and private debt never disclosed in an 8-K does not appear at all.";

/**
 * The count line under the section title: how many instruments, how they split
 * between active and undated, and when the most recent of them was filed.
 *
 * The date is the latest of many. Unlike the corporate tree, whose rows all come
 * from one filing, a company's debt is assembled from every 8-K that disclosed an
 * instrument — up to 38 of them — so a single date cannot describe the section
 * and the per-row "Filed on" column carries the rest.
 */
function subtitle(debt: CurrentCommercialDebt[]): string {
  const active = debt.filter((i) => i.status === "Active").length;
  const undated = debt.length - active;
  const counts = [
    active ? `${active} active` : null,
    undated ? `${undated} undated` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const latest = debt.reduce(
    (newest, instrument) =>
      instrument.asOf > newest ? instrument.asOf : newest,
    "",
  );
  const instruments = `${debt.length} instrument${debt.length === 1 ? "" : "s"}`;
  return `${instruments} · ${counts} · latest filed on ${latest}`;
}

/**
 * The "Commercial Debt" section: searchable, paginated table of the debt
 * instruments a company disclosed in its 8-K filings. Inline view paginates
 * 5-per-page; the fullscreen view paginates 15-per-page.
 *
 * Instrument name leads rather than lender, which is the reverse of the original
 * design. Every instrument has a name and only 56% name a lender, so leading with
 * the lender left the first column empty on nearly half the rows.
 */
export function CompanyDebtSection({ company }: CompanyDebtSectionProps) {
  const debt = company.currentCommercialDebt;

  if (debt.length === 0) {
    return (
      <SectionCard
        id="debt"
        title="Commercial Debt"
        subtitle="No disclosed commercial debt"
        info={INFO_COPY}
      >
        <p className="text-sm text-muted leading-relaxed m-0">
          No commercial debt instrument is in scope for this company. Instruments
          are extracted from 8-K filings, and only those that have neither
          matured nor been superseded are shown — a company with no 8-K debt
          disclosure, or whose disclosed instruments have all matured, appears
          here. Debt raised privately or never disclosed in an 8-K is not
          covered.
        </p>
      </SectionCard>
    );
  }

  const documents = new Set(
    debt.map((instrument) => instrument.sources[0]?.url).filter(Boolean),
  ).size;
  const retrieved = debt[0]?.sources[0]?.lastAccessed;

  return (
    <SectionCard
      id="debt"
      title="Commercial Debt"
      subtitle={subtitle(debt)}
      info={INFO_COPY}
      source={
        <>
          {documents} SEC 8-K filing{documents === 1 ? "" : "s"}
          {retrieved ? `, retrieved ${retrieved}` : null}. Each row links to the
          filing it was extracted from.
        </>
      }
      expanded={<DebtTable debt={debt} pageSize={EXPANDED_PAGE_SIZE} />}
    >
      <DebtTable debt={debt} pageSize={INLINE_PAGE_SIZE} />
    </SectionCard>
  );
}
