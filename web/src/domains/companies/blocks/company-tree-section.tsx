"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/blocks/section-card";
import { Pagination } from "@/components/pagination";
import type { TreeEntity } from "@/domains/companies/types";

type CompanyTreeSectionProps = {
  tree: TreeEntity[];
  source: string;
};

const ROOTS_PER_PAGE = 6;

/**
 * Group the flat tree entity list into contiguous chunks whose first entry
 * has depth 0 or 1 (roots). Each group is displayed as one page.
 */
function groupByRoot(entities: TreeEntity[]): TreeEntity[][] {
  const groups: TreeEntity[][] = [];
  let current: TreeEntity[] = [];
  for (const entity of entities) {
    if (entity.depth <= 1 && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(entity);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function TreeLines({ entities }: { entities: TreeEntity[] }) {
  return (
    <div className="font-geist text-xs md:text-sm text-foreground overflow-x-auto">
      <ul className="list-none m-0 p-0">
        {entities.map((entity, i) => {
          const indent = " ".repeat(entity.depth * 4);
          const prefix = entity.depth === 0 ? "" : "└─";
          return (
            <li
              key={`${entity.name}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-0.5 hover:bg-overlay"
            >
              <span className="truncate">
                {indent}
                {prefix ? (
                  <span className="text-muted mr-2">{prefix}</span>
                ) : null}
                <span
                  className={
                    entity.depth === 0 ? "text-foreground" : "text-foreground"
                  }
                >
                  {entity.name}
                </span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
                {entity.country}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The "Corporate Tree" section — indented, monospaced list of controlled
 * entities. Paginated by root grouping inline; the fullscreen modal renders
 * every entity unpaginated.
 */
export function CompanyTreeSection({ tree, source }: CompanyTreeSectionProps) {
  const [page, setPage] = useState(1);
  const groups = useMemo(() => groupByRoot(tree), [tree]);
  const flatPageSize = ROOTS_PER_PAGE;
  const totalGroups = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / flatPageSize));
  const start = (page - 1) * flatPageSize;
  const visibleGroups = groups.slice(start, start + flatPageSize);
  const visible = visibleGroups.flat();

  return (
    <SectionCard
      id="tree"
      title="Corporate Tree"
      subtitle={`${tree.length} entities · illustrative sample`}
      info="Controlled subsidiaries and reconciled ownership relationships, sourced from filings that disclose material ownership stakes."
      source={source}
      expanded={
        <div className="max-w-3xl mx-auto">
          <TreeLines entities={tree} />
          {source ? (
            <p className="mt-8 text-xs text-muted leading-relaxed">
              <span className="uppercase tracking-wider font-medium mr-2">
                Source.
              </span>
              {source}
            </p>
          ) : null}
        </div>
      }
    >
      <TreeLines entities={visible} />
      {totalPages > 1 ? (
        <div className="mt-4 flex justify-end">
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
