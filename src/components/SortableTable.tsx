"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useState, type ReactNode, type ThHTMLAttributes } from "react";
import { inferKind, nextSort, parseStoredSort, sortRows, sortStorageKey, type SortDir, type SortKind, type SortState } from "@/lib/ui/sort";
import { cn } from "@/lib/utils";

/** How a column sorts: the value to sort by (any shape: numbers, "≥ 201", dates, text) and, optionally, its kind. */
export interface SortColumn<T> { value: (row: T) => unknown; kind?: SortKind }

export interface Sorting<T> {
  /** The rows in the chosen order (as given when nothing is chosen). */
  rows: T[];
  sort: SortState | null;
  /** Click a column's header. */
  toggle: (key: string) => void;
  /** The header props for a column: pass to <SortTh>. */
  th: (key: string) => { sortKey: string; sort: SortState | null; onSort: (key: string) => void };
}

function readStored(tableId: string, keys: string[]): SortState | null {
  try {
    return typeof window === "undefined" ? null : parseStoredSort(localStorage.getItem(sortStorageKey(tableId)), keys);
  } catch {
    return null;
  }
}

/**
 * Click-to-sort for a table, remembered per table in this browser (`tableId`). Every table in the
 * app uses this (the run results table stores its sort the same way): numbers and dates sort by
 * value, highest/newest first on the first click; text A–Z; blanks always last.
 */
export function useSortable<T>(tableId: string, rows: T[], columns: Record<string, SortColumn<T>>, initial?: SortState): Sorting<T> {
  const keys = Object.keys(columns);
  const [sort, setSort] = useState<SortState | null>(() => readStored(tableId, keys) ?? initial ?? null);
  // A column's kind: as declared, else read from its values.
  const kindOf = (key: string): SortKind => columns[key]?.kind ?? inferKind(rows.map(columns[key].value));
  const sorted = sort && columns[sort.key] ? sortRows(rows, columns[sort.key].value, kindOf(sort.key), sort.dir) : rows;
  const toggle = (key: string) => {
    const next = nextSort(sort, key, columns[key] ? kindOf(key) : "text");
    setSort(next);
    try { localStorage.setItem(sortStorageKey(tableId), JSON.stringify(next)); } catch { /* not remembered */ }
  };
  return { rows: sorted, sort, toggle, th: (key) => ({ sortKey: key, sort, onSort: toggle }) };
}

/** A header cell that sorts its column on click, with an arrow on the active one. */
export function SortTh({ sortKey, sort, onSort, children, className, numeric, ...rest }: {
  sortKey: string; sort: SortState | null; onSort: (key: string) => void; children: ReactNode; numeric?: boolean;
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, "children">) {
  const active = sort?.key === sortKey;
  const dir: SortDir | null = active ? sort!.dir : null;
  return (
    <th {...rest} className={cn(className, "select-none")} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-0.5 uppercase hover:text-foreground", numeric && "flex-row-reverse", active && "text-foreground")}
        title="Sort by this column (click again to reverse)">
        <span>{children}</span>
        {dir === "asc" ? <ArrowUpIcon className="size-3" aria-hidden /> : dir === "desc" ? <ArrowDownIcon className="size-3" aria-hidden /> : <span className="inline-block size-3" aria-hidden />}
      </button>
    </th>
  );
}

/**
 * The same, styled as the shadcn table's <TableHead> (labels as written, not upper-cased), for
 * tables built from src/components/ui/table.tsx.
 */
export function SortTableHead({ sortKey, sort, onSort, children, className, numeric, ...rest }: {
  sortKey: string; sort: SortState | null; onSort: (key: string) => void; children: ReactNode; numeric?: boolean;
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, "children">) {
  const active = sort?.key === sortKey;
  const dir: SortDir | null = active ? sort!.dir : null;
  return (
    <th data-slot="table-head" {...rest}
      className={cn("h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground select-none", numeric && "text-right", className)}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
      <button type="button" onClick={() => onSort(sortKey)} title="Sort by this column (click again to reverse)"
        className={cn("inline-flex items-center gap-0.5 hover:text-foreground", numeric && "flex-row-reverse", !active && "text-muted-foreground")}>
        <span>{children}</span>
        {dir === "asc" ? <ArrowUpIcon className="size-3" aria-hidden /> : dir === "desc" ? <ArrowDownIcon className="size-3" aria-hidden /> : <span className="inline-block size-3" aria-hidden />}
      </button>
    </th>
  );
}
