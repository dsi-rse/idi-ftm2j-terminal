"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  HTMLAttributes,
  PropsWithChildren,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

type SortDirection = "asc" | "desc" | null;

type TableRootProps = HTMLAttributes<HTMLTableElement>;

/**
 * The root of the {@link Table} compound component. Renders a plain `<table>`
 * with full-width layout and small-body typography. Callers wrap it in a
 * scrolling container as needed.
 */
function TableRoot({ className, children, ...props }: TableRootProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        {...props}
        className={cn(
          "w-full text-xs md:text-sm border-collapse",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}
TableRoot.displayName = "Table.Root";

type TableToolbarProps = HTMLAttributes<HTMLDivElement>;

/**
 * The optional toolbar rendered above a {@link Table}. Slot for search
 * inputs, filters, or action buttons.
 */
function TableToolbar({ className, ...props }: TableToolbarProps) {
  return (
    <div
      {...props}
      className={cn("flex items-center gap-2 pb-3", className)}
    />
  );
}
TableToolbar.displayName = "Table.Toolbar";

type TableHeadProps = HTMLAttributes<HTMLTableSectionElement>;

/**
 * The `<thead>` for a {@link Table}. Applies muted uppercase styling to
 * every child {@link TableHeaderCell}.
 */
function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <thead
      {...props}
      className={cn("border-b border-muted/25", className)}
    />
  );
}
TableHead.displayName = "Table.Head";

type TableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  sortable?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
};

/**
 * A `<th>` cell with uppercase muted styling. Set `sortable` and provide
 * `onSort` + `sortDirection` for interactive sorting; a caret indicator
 * appears alongside the label.
 */
function TableHeaderCell({
  className,
  align = "left",
  sortable = false,
  sortDirection = null,
  onSort,
  children,
  ...props
}: TableHeaderCellProps) {
  const alignmentClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th
      {...props}
      className={cn(
        "px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted font-medium",
        alignmentClass,
        className,
      )}
      aria-sort={
        sortable
          ? sortDirection === "asc"
            ? "ascending"
            : sortDirection === "desc"
              ? "descending"
              : "none"
          : undefined
      }
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1 font-mono uppercase tracking-wider",
            "cursor-pointer hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-sm",
            align === "right" && "ml-auto",
          )}
        >
          <span>{children}</span>
          <SortCaret direction={sortDirection} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}
TableHeaderCell.displayName = "Table.HeaderCell";

function SortCaret({ direction }: { direction: SortDirection }) {
  if (direction === "asc") {
    return <ChevronUp className="size-3 text-primary" aria-hidden />;
  }
  if (direction === "desc") {
    return <ChevronDown className="size-3 text-primary" aria-hidden />;
  }
  return <ChevronDown className="size-3 opacity-40" aria-hidden />;
}

type TableBodyProps = HTMLAttributes<HTMLTableSectionElement>;

/**
 * The `<tbody>` for a {@link Table}. Applies row-divider borders.
 */
function TableBody({ className, ...props }: TableBodyProps) {
  return (
    <tbody
      {...props}
      className={cn("divide-y divide-muted/15", className)}
    />
  );
}
TableBody.displayName = "Table.Body";

type TableRowProps = HTMLAttributes<HTMLTableRowElement>;

/**
 * A `<tr>` with a subtle hover state. Use inside {@link TableBody}.
 */
function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      {...props}
      className={cn("hover:bg-overlay transition-colors", className)}
    />
  );
}
TableRow.displayName = "Table.Row";

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  primary?: string;
  secondary?: string;
};

/**
 * A `<td>` cell. Pass children for a plain cell, or `primary` + `secondary`
 * for a two-line label (primary above muted secondary). `align="right"`
 * right-aligns numeric columns.
 */
function TableCell({
  className,
  align = "left",
  primary,
  secondary,
  children,
  ...props
}: TableCellProps) {
  const alignmentClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  const content =
    primary !== undefined ? (
      <div
        className={cn(
          "flex flex-col gap-0.5",
          align === "right" && "items-end",
          align === "center" && "items-center",
        )}
      >
        <span className="text-foreground">{primary}</span>
        {secondary ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {secondary}
          </span>
        ) : null}
      </div>
    ) : (
      children
    );
  return (
    <td
      {...props}
      className={cn("px-3 py-3", alignmentClass, className)}
    >
      {content}
    </td>
  );
}
TableCell.displayName = "Table.Cell";

type TableFooterProps = HTMLAttributes<HTMLDivElement>;

/**
 * The footer strip rendered below a {@link Table}. Slot for pagination or
 * per-page controls. Right-aligned by default.
 */
function TableFooter({ className, ...props }: TableFooterProps) {
  return (
    <div
      {...props}
      className={cn("flex items-center justify-end pt-3", className)}
    />
  );
}
TableFooter.displayName = "Table.Footer";

type TableEmptyProps = PropsWithChildren<HTMLAttributes<HTMLTableRowElement>> & {
  colSpan: number;
};

/**
 * A single empty-state row for a {@link Table}. Spans every column and
 * displays muted, centered text.
 */
function TableEmpty({
  colSpan,
  className,
  children,
  ...props
}: TableEmptyProps) {
  return (
    <tr {...props} className={cn(className)}>
      <td
        colSpan={colSpan}
        className="px-3 py-8 text-center text-xs text-muted"
      >
        {children}
      </td>
    </tr>
  );
}
TableEmpty.displayName = "Table.Empty";

/**
 * A tiny numeric row-index label, e.g. `01`, `02`. Pass a 1-based index.
 */
export function RowIndex({ index }: { index: number }) {
  return (
    <span className="font-mono text-[10px] text-muted tabular-nums">
      {String(index).padStart(2, "0")}
    </span>
  );
}

type DeltaCellProps = {
  value: number;
  format?: (n: number) => string;
  className?: string;
};

/**
 * A quarter-over-quarter delta cell. Positive values render green, negative
 * red, zero muted. Supply `format` for units (default: percent with sign).
 */
export function DeltaCell({
  value,
  format = (n) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`,
  className,
}: DeltaCellProps) {
  const color =
    value > 0
      ? "text-green-500"
      : value < 0
        ? "text-red-500"
        : "text-muted";
  return (
    <span className={cn("tabular-nums", color, className)}>
      {format(value)}
    </span>
  );
}

type DistributionBarProps = {
  value: number;
  className?: string;
};

/**
 * A thin horizontal bar sized to `value` (0..1). Used inside a table cell to
 * visualize a fraction — e.g. share of a shareholder register.
 */
export function DistributionBar({ value, className }: DistributionBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span
      className={cn(
        "inline-block w-full max-w-[120px] h-1 bg-overlay rounded-full overflow-hidden align-middle",
        className,
      )}
      aria-hidden
    >
      <span
        className="block h-full bg-foreground/60"
        style={{ width: `${clamped * 100}%` }}
      />
    </span>
  );
}

/**
 * A compound table component: a lightly-styled `<table>` plus toolbar,
 * pagination footer, and helpers for common cell content.
 *
 * Compose as:
 *
 * ```tsx
 * <Table.Toolbar>
 *   <SearchInput … />
 * </Table.Toolbar>
 * <Table>
 *   <Table.Head>
 *     <tr>
 *       <Table.HeaderCell>#</Table.HeaderCell>
 *       <Table.HeaderCell sortable sortDirection="desc" onSort={…}>
 *         Stake
 *       </Table.HeaderCell>
 *     </tr>
 *   </Table.Head>
 *   <Table.Body>
 *     <Table.Row>
 *       <Table.Cell><RowIndex index={1} /></Table.Cell>
 *       <Table.Cell align="right">8.21%</Table.Cell>
 *     </Table.Row>
 *   </Table.Body>
 * </Table>
 * <Table.Footer><Pagination variant="subtle" … /></Table.Footer>
 * ```
 */
export const Table = Object.assign(TableRoot, {
  Root: TableRoot,
  Toolbar: TableToolbar,
  Head: TableHead,
  HeaderCell: TableHeaderCell,
  Body: TableBody,
  Row: TableRow,
  Cell: TableCell,
  Footer: TableFooter,
  Empty: TableEmpty,
});
