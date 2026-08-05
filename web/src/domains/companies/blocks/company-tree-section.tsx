"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { SourceCitation } from "@/blocks/source-citation";
import { Pagination } from "@/components/pagination";
import type { Company, CurrentCorporateRelationship } from "@/types/domain";

type CompanyTreeSectionProps = {
  company: Company;
};

const SUBSIDIARIES_PER_PAGE = 10;

/**
 * A row in the rendered tree. The registrant is depth 0 and every disclosed
 * subsidiary is depth 1: Exhibit 21 as the corporate-structure processor emits
 * it is a flat list, with no nesting to recover. `depth` stays because GLEIF and
 * 10-K body extraction are named future sources that would introduce real
 * hierarchy.
 */
type TreeRow = {
  name: string;
  jurisdiction: string | null;
  depth: number;
};

/**
 * Guide prefix for a row at `depth`, matching the design's tree: one
 * `│` channel per ancestor level, then the `└──` branch for
 * this one. Rendered as monospaced preformatted text so the columns line up by
 * character, independent of the proportional font used for entity names.
 */
function guidePrefix(depth: number): string {
  if (depth === 0) return "";
  return "   │  ".repeat(depth - 1) + "└── ";
}

function TreeLines({ rows }: { rows: TreeRow[] }) {
  return (
    <div className="font-inter-tight text-[13px] text-foreground">
      <ul className="list-none m-0 p-0">
        {rows.map((row, i) => (
          <li
            key={`${row.name}-${i}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-0.5 hover:bg-overlay"
          >
            {/* Guides are a fixed-width prefix that does not shrink, so a name
                long enough to wrap flows under itself rather than under the
                guide column. */}
            <span className="flex min-w-0 items-start">
              <span
                aria-hidden
                className="shrink-0 whitespace-pre font-mono text-muted"
              >
                {guidePrefix(row.depth)}
              </span>
              <span className="min-w-0">{row.name}</span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
              {row.jurisdiction ?? ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The span of filing dates a tree draws on.
 *
 * A single-registrant company has exactly one distinct `asOf`, because its rows
 * all come from one document. A company with several registrants can be built
 * from filings made on different days, so the section reports a range rather
 * than claiming a date it does not have.
 */
function filingRange(relationships: CurrentCorporateRelationship[]) {
  // ISO-8601 dates sort lexicographically, which is why these are plain strings
  // throughout the domain model.
  const dates = relationships
    .map((relationship) => relationship.asOf)
    .filter(Boolean)
    .sort();
  const earliest = dates[0];
  const latest = dates[dates.length - 1];
  return { earliest, latest, spansFilings: Boolean(earliest && latest && earliest !== latest) };
}

/**
 * The citation for the section. Rows from one registrant share a filing, so one
 * source covers them; a multi-registrant tree cites the first and relies on
 * each row carrying its own `sources`.
 */
function TreeSource({
  relationship,
}: {
  relationship: CurrentCorporateRelationship;
}) {
  const [source] = relationship.sources;
  if (!source) return null;
  return (
    <SourceCitation
      source={source}
      detail={`filed ${relationship.asOf}, retrieved ${source.lastAccessed}`}
    />
  );
}

/**
 * The "Corporate Tree" section — indented, monospaced list of the subsidiaries
 * a company disclosed in its most recent Exhibit 21 (10-K) or Exhibit 8 (20-F).
 *
 * The jurisdiction column is the jurisdiction of incorporation exactly as
 * filed. It is deliberately not normalized and deliberately not a country:
 * "Delaware", "DE", and "United Kingdom" all occur in the source.
 */
export function CompanyTreeSection({ company }: CompanyTreeSectionProps) {
  const [page, setPage] = useState(1);
  const relationships = company.currentCorporateRelationships;

  const rows = useMemo<TreeRow[]>(
    () => [
      { name: company.name, jurisdiction: null, depth: 0 },
      ...relationships.map((r) => ({
        name: r.child.name,
        jurisdiction: r.childJurisdiction,
        depth: 1,
      })),
    ],
    [company.name, relationships],
  );

  if (relationships.length === 0) {
    return (
      <SectionCard
        id="tree"
        title="Corporate Tree"
        subtitle="No disclosed subsidiaries"
        info="Subsidiaries disclosed in Exhibit 21 of a 10-K, or Exhibit 8 of a 20-F. Only companies that have filed one of those since the corporate-structure processor's coverage window have a tree."
      >
        <p className="text-sm text-muted leading-relaxed m-0">
          No subsidiary disclosure is available for this company. A corporate
          tree requires an Exhibit 21 or Exhibit 8 subsidiary list attached to a
          10-K or 20-F, and none is in scope for this registrant.
        </p>
      </SectionCard>
    );
  }

  const [first] = relationships;
  const { earliest, latest, spansFilings } = filingRange(relationships);
  const totalPages = Math.max(
    1,
    Math.ceil(relationships.length / SUBSIDIARIES_PER_PAGE),
  );
  // The registrant heads page 1 only; subsidiaries paginate beneath it.
  const start = (page - 1) * SUBSIDIARIES_PER_PAGE;
  const visible: TreeRow[] = [
    ...(page === 1 ? [rows[0]] : []),
    ...rows.slice(1 + start, 1 + start + SUBSIDIARIES_PER_PAGE),
  ];

  const subsidiaryCount = relationships.length;

  return (
    <SectionCard
      id="tree"
      title="Corporate Tree"
      subtitle={
        spansFilings
          ? `${rows.length} entities · filed ${earliest} – ${latest}`
          : `${rows.length} entities · filed ${earliest}`
      }
      info="Subsidiaries disclosed in Exhibit 21 of a 10-K, or Exhibit 8 of a 20-F, taken from this company's most recent such filing. The right-hand column is the jurisdiction of incorporation as disclosed, reproduced verbatim — it may name a US state or a country, and is not normalized. Exhibit 21 reports no ownership percentages, so no stake is shown."
      source={<TreeSource relationship={first} />}
      expanded={
        <div className="max-w-3xl mx-auto">
          <TreeLines rows={rows} />
          <p className="mt-8 text-xs text-muted leading-relaxed">
            <span className="font-mono uppercase tracking-wider font-medium mr-2">
              Source.
            </span>
            <TreeSource relationship={first} />
          </p>
        </div>
      }
    >
      <TreeLines rows={visible} />
      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted m-0">
            {subsidiaryCount} subsidiaries
          </p>
          <Pagination
            variant="subtle"
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}
