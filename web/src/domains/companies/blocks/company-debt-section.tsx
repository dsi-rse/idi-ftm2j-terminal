"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { RowIndex, Table } from "@/components/table";
import { formatAmountShort } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
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
 * The line under an instrument's name: its status, then its end date. The
 * maturity leads; a revolver whose filing states only when the commitment ends
 * shows that instead. An instrument the filings give no end date for says so
 * rather than showing nothing — most instruments are in that state, so silence
 * would read as a rendering fault.
 */
function statusLine(instrument: CurrentCommercialDebt): string {
  const end = instrument.endDate
    ? `Matures ${instrument.endDate}`
    : instrument.commitmentEndDate
      ? `Commitment ends ${instrument.commitmentEndDate}`
      : "No end date disclosed";
  return `${instrument.status} · ${end}`;
}

/**
 * The note the CDT dashboard appends to a lender list the filings know is
 * incomplete, worded as it words it.
 */
const OTHER_LENDERS_UNNAMED = "other lenders not named";

/**
 * The Lender cell: the first label, with the rest behind a toggle.
 *
 * A label is a lender the filing names. Role phrases standing in for a name —
 * "lenders party thereto", "Holders" — are dropped in the pipeline, so an
 * instrument whose filing names no lender shows the placeholder. When the
 * filings also describe lenders they never name, the list ends with "other
 * lenders not named", muted, as on the CDT dashboard — so a lone named bank in
 * a syndicate does not read as the only lender.
 *
 * "+N more" is a button rather than a caption because this section is the only
 * place those labels exist. Many instruments name more than one lender, and a
 * series of senior notes can name twenty, so the full list cannot sit on a
 * collapsed row — but leaving it unreachable also broke the search above,
 * which matches every lender: a reader could search a bank, see the row match,
 * and never see the name they searched for.
 */
function LenderCell({
  instrument,
  expanded,
  onToggle,
}: {
  instrument: CurrentCommercialDebt;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [first, ...others] = instrument.lenders;
  const unnamed = instrument.otherLendersUnnamed;
  // The count is of named lenders only: the note is not a lender, so one
  // named bank plus the note reads "+ others not named", never "+1 more".
  const moreLabel =
    others.length === 0
      ? "+ others not named"
      : unnamed
        ? `+${others.length} more, others not named`
        : `+${others.length} more`;
  // Every branch sets the lender in the display face, as holder names are;
  // the placeholder too, muted, so one column does not switch faces by row.
  const name = "type-display text-name";
  if (!first)
    return (
      <Table.Cell
        primary={
          <span className={cn(name, "text-muted")}>Lender not named</span>
        }
      />
    );
  if (others.length === 0 && !unnamed)
    return <Table.Cell primary={<span className={cn(name)}>{first}</span>} />;

  return (
    <Table.Cell
      primary={
        expanded ? (
          // Labels are de-duplicated per instrument in the pipeline, so a label
          // is its own key; the note gets a key no lender name can take.
          <span className={cn(name, "flex flex-col gap-0.5")}>
            {instrument.lenders.map((lender) => (
              <span key={lender}>{lender}</span>
            ))}
            {unnamed ? (
              <span key="__other-lenders-unnamed" className={cn("text-muted")}>
                {OTHER_LENDERS_UNNAMED}
              </span>
            ) : null}
          </span>
        ) : (
          <span className={cn(name)}>{first}</span>
        )
      }
      secondary={
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cn(
            "type-label-sm cursor-pointer",
            "hover:text-foreground rounded-control",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          )}
        >
          {expanded ? "Show fewer" : moreLabel}
        </button>
      }
    />
  );
}

function DebtTable({
  debt,
  pageSize,
  pinToolbar = false,
}: {
  debt: CurrentCommercialDebt[];
  pageSize: number;
  /** Pin the search bar to the top of the enclosing modal body while it scrolls. */
  pinToolbar?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  /**
   * Which rows have their lender list open, keyed by instrument identity rather
   * than row position — sorting, searching, and paging all move rows around an
   * open cell, and a positional key would hand the open state to whichever
   * instrument landed in that slot. The domain type carries no id, but `debt`
   * comes off static props and both `filterDebt` and `sortDebt` preserve element
   * references, so the instrument itself is the stable key.
   */
  const [openLenders, setOpenLenders] = useState<
    ReadonlySet<CurrentCommercialDebt>
  >(() => new Set());

  const filtered = useMemo(() => filterDebt(debt, query), [debt, query]);
  const sorted = useMemo(() => sortDebt(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleLenders = (instrument: CurrentCommercialDebt) =>
    setOpenLenders((prev) => {
      const next = new Set(prev);
      if (!next.delete(instrument)) next.add(instrument);
      return next;
    });

  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );

  return (
    <div>
      <Table.Toolbar
        // See the tree section's pinned filter for why the margin and padding
        // straddle the modal body's top padding.
        className={cn(
          pinToolbar && "sticky -top-6 z-10 -mt-6 pt-6 bg-background",
        )}
      >
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
              const [source] = instrument.sources;
              return (
                <Table.Row key={`${instrument.asOf}-${start + i}`}>
                  <Table.Cell>
                    <RowIndex index={start + i + 1} />
                  </Table.Cell>
                  <Table.Cell
                    primary={displayName(instrument)}
                    secondary={statusLine(instrument)}
                  />
                  <LenderCell
                    instrument={instrument}
                    expanded={openLenders.has(instrument)}
                    onToggle={() => toggleLenders(instrument)}
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
                        : formatAmountShort(
                          instrument.amount,
                          instrument.currency,
                        )
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
  "Commercial debt instruments disclosed in this company's 8-K and 6-K filings, one row per instrument, each linking to the filing it was extracted from. Statuses follow the Commercial Debt Tracker's own definitions. Instruments the filings show closed — matured, repaid, terminated, exchanged, defaulted, or superseded — are excluded, and private debt never disclosed in an 8-K or 6-K does not appear at all.";

/**
 * The count line under the section title: how many instruments, how they split
 * by status, and when the most recent of them was filed. The three active
 * statuses count as one — "likely" and "expected" qualify how the filings show
 * it, and the row says which.
 *
 * The date is the latest of many. Unlike the corporate tree, whose rows all come
 * from one filing, a company's debt is assembled from every 8-K that disclosed an
 * instrument — up to 38 of them — so a single date cannot describe the section
 * and the per-row "Filed on" column carries the rest.
 */
function subtitle(debt: CurrentCommercialDebt[]): string {
  const count = (match: (status: CurrentCommercialDebt["status"]) => boolean) =>
    debt.filter((i) => match(i.status)).length;
  const active = count((status) => status.startsWith("Active"));
  const announced = count((status) => status === "Announced");
  const unknown = count((status) => status === "Unknown");
  const counts = [
    active ? `${active} active` : null,
    announced ? `${announced} announced` : null,
    unknown ? `${unknown} status unknown` : null,
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
        <p className="type-body m-0">
          No commercial debt instrument is in scope for this company. Instruments
          are extracted from 8-K and 6-K filings, and only those the filings do
          not show closed are listed — a company with no such debt disclosure,
          or whose disclosed instruments have all matured, been repaid, or been
          superseded, appears here. Debt raised privately or never disclosed in
          an 8-K or 6-K is not covered.
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
          {documents} SEC filing{documents === 1 ? "" : "s"}
          {retrieved ? `, retrieved ${retrieved}` : null}.
        </>
      }
      expanded={<DebtTable debt={debt} pageSize={EXPANDED_PAGE_SIZE} pinToolbar />}
    >
      <DebtTable debt={debt} pageSize={INLINE_PAGE_SIZE} />
    </SectionCard>
  );
}
