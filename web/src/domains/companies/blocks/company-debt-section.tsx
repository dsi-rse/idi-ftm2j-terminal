"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { RowIndex, Table } from "@/components/table";
import { formatAmountShort } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type {
  Company,
  CurrentCommercialDebt,
  DebtParty,
} from "@/types/domain";

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
      instrument.parties.some((party) => party.name.toLowerCase().includes(q)),
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
 * The Ends cell: the maturity, or, for a revolver whose filing states only when
 * the commitment ends, that date, with the second line saying which it is. An
 * instrument the filings give no end date for says so rather than showing
 * nothing. Most instruments are in that state, so a blank would read as a
 * rendering fault.
 */
function EndDateCell({ instrument }: { instrument: CurrentCommercialDebt }) {
  if (instrument.endDate)
    return <Table.Cell primary={instrument.endDate} secondary="Maturity" />;
  if (instrument.commitmentEndDate)
    return (
      <Table.Cell
        primary={instrument.commitmentEndDate}
        secondary="Commitment end"
      />
    );
  return (
    <Table.Cell
      primary={<span className={cn("text-muted")}>Not disclosed</span>}
    />
  );
}

/** A party as the CDT dashboard writes it: its name, then its role. */
function partyLabel(party: DebtParty): string {
  return `${party.name} (${party.role})`;
}

/**
 * The note for lenders the filings describe but never name, worded as the CDT
 * dashboard words it: "other" only when some lender is named.
 */
function unnamedLendersNote(parties: DebtParty[]): string {
  return parties.some((party) => party.role === "lender")
    ? "other lenders not named"
    : "lenders not named";
}

/**
 * The Parties cell: the first party, with the rest behind a toggle.
 *
 * A party is anyone the filing names other than the borrower (lenders first,
 * then agents, trustees, underwriters, guarantors), each followed by its role
 * in parentheses, as on the CDT dashboard. Role phrases standing in for a name
 * ("lenders party thereto", "the Trustee") are dropped in the pipeline, so an
 * instrument whose filing names no party shows the placeholder. When the
 * filings also describe lenders they never name, the list ends with a muted
 * "other lenders not named", so a lone named bank in a syndicate does not read
 * as the only lender.
 *
 * "+N more" is a button rather than a caption because this section is the only
 * place those names exist. A series of senior notes can name twenty
 * underwriters, so the full list cannot sit on a collapsed row. Leaving it
 * unreachable would also break the search above, which matches every party: a
 * reader could search a bank, see the row match, and never see the name they
 * searched for.
 */
function PartyCell({
  instrument,
  expanded,
  onToggle,
}: {
  instrument: CurrentCommercialDebt;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { parties, unnamedLenders } = instrument;
  const [first, ...others] = parties;
  const note = unnamedLendersNote(parties);
  // Every branch is semibold, the muted placeholder and note included, so the
  // column does not change weight by row.
  const name = "type-display";
  if (!first)
    return (
      <Table.Cell
        primary={
          <span className={cn(name, "text-muted")}>
            {unnamedLenders ? "Lenders not named" : "No party named"}
          </span>
        }
      />
    );
  if (others.length === 0 && !unnamedLenders)
    return (
      <Table.Cell primary={<span className={cn(name)}>{partyLabel(first)}</span>} />
    );

  // The count is of named parties only: the note is not a party, so one named
  // bank plus the note reads "+ other lenders not named", never "+1 more".
  const moreLabel =
    others.length === 0
      ? `+ ${note}`
      : unnamedLenders
        ? `+${others.length} more, ${note}`
        : `+${others.length} more`;

  return (
    <Table.Cell
      primary={
        expanded ? (
          // A name with two roles appears once per role, so name and role
          // together are the key; the note gets a key no label can take.
          <span className={cn(name, "flex flex-col gap-1")}>
            {parties.map((party) => (
              <span key={partyLabel(party)}>{partyLabel(party)}</span>
            ))}
            {unnamedLenders ? (
              <span key="__unnamed-lenders" className={cn("text-muted")}>
                {note}
              </span>
            ) : null}
          </span>
        ) : (
          <span className={cn(name)}>{partyLabel(first)}</span>
        )
      }
      secondary={
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cn(
            "type-caption cursor-pointer",
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
   * Which rows have their party list open, keyed by instrument identity rather
   * than row position — sorting, searching, and paging all move rows around an
   * open cell, and a positional key would hand the open state to whichever
   * instrument landed in that slot. The domain type carries no id, but `debt`
   * comes off static props and both `filterDebt` and `sortDebt` preserve element
   * references, so the instrument itself is the stable key.
   */
  const [openParties, setOpenParties] = useState<
    ReadonlySet<CurrentCommercialDebt>
  >(() => new Set());

  const filtered = useMemo(() => filterDebt(debt, query), [debt, query]);
  const sorted = useMemo(() => sortDebt(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  const toggleParties = (instrument: CurrentCommercialDebt) =>
    setOpenParties((prev) => {
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
          placeholder="Search debt by instrument or party…"
        />
      </Table.Toolbar>
      {/* Widths are set here so sorting cannot reflow the columns (see
          `Table`). Status and Ends hold short values (mostly "Active" or
          "Announced"; a date over its kind); Instrument and Parties, the long
          ones, share the rest. The fixed columns add up to 560px, so the
          minimum (896px) leaves those two 168px each; below it the table
          scrolls sideways rather than squeezing them. */}
      <Table className={cn("min-w-4xl")}>
        <Table.Head>
          <tr>
            <Table.HeaderCell className={cn("w-16")}>#</Table.HeaderCell>
            <Table.HeaderCell>Instrument</Table.HeaderCell>
            <Table.HeaderCell className={cn("w-28")}>Status</Table.HeaderCell>
            <Table.HeaderCell className={cn("w-32")}>Ends</Table.HeaderCell>
            <Table.HeaderCell>Parties</Table.HeaderCell>
            <Table.HeaderCell
              className={cn("w-32")}
              sortable
              sortDirection={sort.key === "filedOn" ? sort.direction : undefined}
              onSort={() => toggle("filedOn")}
            >
              Filed on
            </Table.HeaderCell>
            <Table.HeaderCell
              className={cn("w-32")}
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
            <Table.Empty colSpan={7}>
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
                    primary={
                      // The instrument's CDT dashboard page, where every
                      // filing and extracted field behind the row can be read.
                      // Underlined like the filing link, so it reads as a link.
                      <a
                        href={instrument.cdtUrl}
                        title="View this instrument on the Commercial Debt Tracker"
                        target="_blank"
                        rel="noreferrer"
                        className={cn("underline hover:text-foreground")}
                      >
                        {displayName(instrument)}
                      </a>
                    }
                  />
                  <Table.Cell
                    primary={
                      <span
                        className={cn(
                          instrument.status === "Unknown" && "text-muted",
                        )}
                      >
                        {instrument.status}
                      </span>
                    }
                  />
                  <EndDateCell instrument={instrument} />
                  <PartyCell
                    instrument={instrument}
                    expanded={openParties.has(instrument)}
                    onToggle={() => toggleParties(instrument)}
                  />
                  <Table.Cell
                    primary={
                      // Per-row click-through to the 8-K. A company can draw on
                      // dozens of filings, so the row is where a citation
                      // belongs — a footer listing 38 links cites nothing
                      // usefully.
                      <span className={cn("type-figure")}>
                        {source ? (
                          <a
                            href={source.url}
                            title={`${source.name} — ${source.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className={cn("underline hover:text-foreground")}
                          >
                            {instrument.asOf}
                          </a>
                        ) : (
                          instrument.asOf
                        )}
                      </span>
                    }
                    secondary={source?.name}
                  />
                  <Table.Cell
                    align="right"
                    primary={
                      instrument.amount === null ? (
                        "Not reported"
                      ) : (
                        <span className="type-figure">
                          {formatAmountShort(
                            instrument.amount,
                            instrument.currency,
                          )}
                        </span>
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
  "Commercial debt instruments disclosed in this company's 8-K and 6-K filings, one row per instrument. Each instrument name links to its page on the Commercial Debt Tracker, and each filing date to the filing it was extracted from. Parties are everyone the filings name other than the borrower, with their role. Statuses follow the Commercial Debt Tracker's own definitions. Instruments the filings show closed — matured, repaid, terminated, exchanged, defaulted, or superseded — are excluded, and private debt never disclosed in an 8-K or 6-K does not appear at all.";

/**
 * The count line under the section title: how many instruments, and when the
 * most recent of them was filed. The status split is left to the Status
 * column; spelled out here it made the line too long to take in at a glance.
 *
 * The date is the latest of many. Unlike the corporate tree, whose rows all come
 * from one filing, a company's debt is assembled from every 8-K that disclosed an
 * instrument — up to 38 of them — so a single date cannot describe the section
 * and the per-row "Filed on" column carries the rest.
 */
function subtitle(debt: CurrentCommercialDebt[]): string {
  const latest = debt.reduce(
    (newest, instrument) =>
      instrument.asOf > newest ? instrument.asOf : newest,
    "",
  );
  const instruments = `${debt.length} instrument${debt.length === 1 ? "" : "s"}`;
  return `${instruments} · latest filed on ${latest}`;
}

/**
 * The "Commercial Debt" section: searchable, paginated table of the debt
 * instruments a company disclosed in its 8-K filings. Inline view paginates
 * 5-per-page; the fullscreen view paginates 15-per-page.
 *
 * Instrument name leads rather than lender, which is the reverse of the original
 * design. Every instrument has a name and most name no lender, so leading with
 * the lender left the first column empty on most rows.
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
        <p className={cn("type-body m-0")}>
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
