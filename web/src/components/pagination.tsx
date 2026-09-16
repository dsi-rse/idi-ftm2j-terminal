"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type PaginationVariant = "solid" | "subtle";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  variant?: PaginationVariant;
  /**
   * Render `‹ 3 / 22 ›` instead of the numbered page list. For narrow
   * containers: the full list with both ellipses runs to ~304px, wider than
   * the 312px company search rail's usable width.
   */
  compact?: boolean;
};

type PaginationItem = number | "ellipsis";

function getPaginationRange(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(currentPage - 1, 2);
  const rightSibling = Math.min(currentPage + 1, totalPages - 1);
  const showLeftDots = leftSibling > 3;
  const showRightDots = rightSibling < totalPages - 2;

  if (!showLeftDots && showRightDots) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }
  if (showLeftDots && !showRightDots) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  if (showLeftDots && showRightDots) {
    return [
      1,
      "ellipsis",
      currentPage - 1,
      currentPage,
      currentPage + 1,
      "ellipsis",
      totalPages,
    ];
  }
  return Array.from({ length: totalPages }, (_, i) => i + 1);
}

const cellBase =
  "inline-flex items-center justify-center h-8 min-w-8 px-2 type-value text-sm rounded-sm " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary " +
  "transition-colors";

type PageJumpProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

/**
 * The `3 / 22` readout of the compact pager, with the current page number
 * doubling as a jump control: click it and it becomes a numeric field that
 * commits on Enter and cancels on Escape or blur. Out-of-range entries clamp
 * rather than fail, so typing `999` lands on the last page. This keeps the
 * pager's footprint fixed where a numbered page list or a dropdown of every
 * page would not fit.
 */
function PageJump({ currentPage, totalPages, onPageChange }: PageJumpProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  // Wide enough for the largest page number, so the field does not resize as
  // digits are typed and the separator beside it stays put.
  const digits = String(totalPages).length;

  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isNaN(parsed)) return;
    const page = Math.min(Math.max(parsed, 1), totalPages);
    if (page !== currentPage) onPageChange(page);
  };

  return (
    <span
      aria-current={editing ? undefined : "page"}
      className={cn(cellBase, "gap-0 px-1 text-muted tabular-nums")}
    >
      {editing ? (
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={`Jump to page, 1 to ${totalPages}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onFocus={(e) => e.target.select()}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") setDraft(null);
          }}
          style={{ width: `${digits + 1}ch` }}
          className={cn(
            "h-6 rounded-sm border border-primary bg-transparent px-1 text-center text-foreground font-semibold",
            "outline-none",
          )}
        />
      ) : (
        <button
          type="button"
          aria-label={`Page ${currentPage} of ${totalPages}. Jump to page`}
          title="Jump to page"
          onClick={() => setDraft(String(currentPage))}
          className={cn(
            "h-6 cursor-text rounded-sm px-1 text-foreground font-semibold",
            "underline decoration-dotted decoration-muted underline-offset-4 hover:bg-overlay hover:decoration-foreground",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          )}
        >
          {currentPage}
        </button>
      )}
      <span className={cn("px-1")}>/</span>
      {totalPages}
    </span>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  variant = "solid",
  compact = false,
}: PaginationProps) {
  const items = getPaginationRange(currentPage, totalPages);
  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  const activeClass =
    variant === "subtle"
      ? "text-primary border-b border-primary rounded-none"
      : "bg-primary text-primary-foreground font-semibold";
  const inactiveClass =
    variant === "subtle"
      ? "text-muted hover:text-foreground"
      : "text-foreground hover:bg-overlay";

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex justify-center", className)}
    >
      <ul className="flex items-center gap-1">
        <li>
          <button
            type="button"
            aria-label="Previous page"
            disabled={isFirst}
            onClick={() => onPageChange(currentPage - 1)}
            className={cn(
              cellBase,
              "cursor-pointer text-muted hover:text-foreground hover:bg-overlay",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
        </li>

        {compact ? (
          <li>
            <PageJump
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </li>
        ) : (
          items.map((item, i) =>
            item === "ellipsis" ? (
              <li key={`ellipsis-${i}`}>
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center h-8 min-w-6 px-1 type-value text-sm text-muted"
                >
                  …
                </span>
              </li>
            ) : (
              <li key={item}>
                <button
                  type="button"
                  aria-label={`Page ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                  className={cn(
                    cellBase,
                    item === currentPage ? activeClass : inactiveClass,
                  )}
                >
                  {item}
                </button>
              </li>
            ),
          )
        )}

        <li>
          <button
            type="button"
            aria-label="Next page"
            disabled={isLast}
            onClick={() => onPageChange(currentPage + 1)}
            className={cn(
              cellBase,
              "text-muted hover:text-foreground hover:bg-overlay",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
