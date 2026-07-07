import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type PaginationVariant = "solid" | "subtle";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  variant?: PaginationVariant;
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
  "inline-flex items-center justify-center h-8 min-w-8 px-2 text-sm rounded-sm " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary " +
  "transition-colors";

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  variant = "solid",
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

        {items.map((item, i) =>
          item === "ellipsis" ? (
            <li key={`ellipsis-${i}`}>
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center h-8 min-w-6 px-1 text-sm text-muted"
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
