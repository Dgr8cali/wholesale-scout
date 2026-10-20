"use client"

import {
  createColumnHelper, createPaginatedRowModel, createSortedRowModel, rowPaginationFeature, rowSortingFeature,
  sortFn_alphanumeric, sortFn_basic, tableFeatures, useTable,
  type PaginationState, type RowData, type SortingState,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Fragment, useMemo, useState, type ReactNode } from "react"

import { EmptyState } from "@/components/States"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

/** One column: what the cell shows, and optionally how it sorts and where it shows on a phone. */
export interface DataColumn<T extends RowData> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** The value it sorts by; leave out for a column that doesn't sort. Nulls sort last. */
  sortValue?: (row: T) => string | number | null | undefined
  /** Right-aligned mono figures (prices, counts, ASINs in a figure column). */
  numeric?: boolean
  /**
   * On a phone (<640px) each row is a card. `mobile: "title"` is the card's heading; numbers 1–3
   * are the key fields shown under it (in that order); the rest open under "Details".
   */
  mobile?: "title" | 1 | 2 | 3
  /** Hide from the phone card entirely (e.g. a checkbox or an action column shown elsewhere). */
  mobileHidden?: boolean
  /** Keep this (last) column in view at the right edge while a wide table scrolls sideways: row actions. */
  pinEnd?: boolean
  className?: string
  headerClassName?: string
}

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { basic: sortFn_basic, alphanumeric: sortFn_alphanumeric },
})

const PAGE_SIZES = [25, 50, 100, 200]
/** A pinned last column: opaque, with a soft edge where the scrolled columns pass under it. */
const PIN_END = "sticky right-0 bg-card shadow-[inset_1px_0_0_var(--border),-8px_0_8px_-8px_rgb(0_0_0/0.12)]"

const readSize = (key: string | undefined, fallback: number) => {
  if (!key) return fallback
  try {
    const n = Number(localStorage.getItem(`dt.size.${key}`))
    return PAGE_SIZES.includes(n) ? n : fallback
  } catch { return fallback }
}

/**
 * The shared table: uppercase 12px muted headers, divider rows, right-aligned mono numbers, a sticky
 * header, pagination (50 a page by default, with a page-size picker), an EmptyState when there are
 * no rows, and on a phone each row as a card with its 3–4 key fields and "Details" for the rest.
 */
export function DataTable<T extends RowData>({
  rows, columns, getRowId, pageSize = 50, storageKey, initialSort, empty, onRowClick, rowClassName, rowAttrs, caption, className,
}: {
  rows: T[]
  columns: DataColumn<T>[]
  getRowId: (row: T) => string
  pageSize?: number
  /** Remembers the page size in this browser. */
  storageKey?: string
  initialSort?: { id: string; desc?: boolean }
  empty?: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  rowAttrs?: (row: T) => Record<string, string | undefined>
  /** For screen readers: what the table lists. */
  caption?: string
  className?: string
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [{ id: initialSort.id, desc: !!initialSort.desc }] : [])
  const [pagination, setPagination] = useState<PaginationState>(() => ({ pageIndex: 0, pageSize: readSize(storageKey, pageSize) }))
  const helper = useMemo(() => createColumnHelper<typeof features, T>(), [])
  const defs = useMemo(() => helper.columns(columns.map((c) => helper.accessor((r: T) => (c.sortValue ? c.sortValue(r) ?? undefined : null), {
    id: c.id,
    enableSorting: !!c.sortValue,
    sortUndefined: "last",
    sortFn: c.numeric ? "basic" : "alphanumeric",
    sortDescFirst: !!c.numeric,
  }))), [columns, helper])
  const table = useTable({
    features,
    columns: defs,
    data: rows,
    getRowId: (r) => getRowId(r),
    state: { sorting, pagination },
    onSortingChange: (u) => setSorting((s) => (typeof u === "function" ? (u as (x: SortingState) => SortingState)(s) : u)),
    onPaginationChange: (u) => setPagination((p) => (typeof u === "function" ? (u as (x: PaginationState) => PaginationState)(p) : u)),
    autoResetPageIndex: false,
  })

  if (!rows.length) {
    return empty ? <EmptyState icon={empty.icon} title={empty.title} action={empty.action} className={className}>{empty.description}</EmptyState> : null
  }

  const byId = new Map(columns.map((c) => [c.id, c]))
  const shown = table.getRowModel().rows
  const total = rows.length
  const pageCount = table.getPageCount()
  // The page can run past the end when rows shrink (a filter): show the last page instead.
  const pageIndex = Math.min(pagination.pageIndex, Math.max(0, pageCount - 1))
  const from = total ? pageIndex * pagination.pageSize + 1 : 0
  const to = Math.min(total, (pageIndex + 1) * pagination.pageSize)
  const setSize = (n: number) => {
    setPagination({ pageIndex: 0, pageSize: n })
    if (storageKey) try { localStorage.setItem(`dt.size.${storageKey}`, String(n)) } catch { /* not remembered */ }
  }
  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0]
  const keyCols = columns.filter((c) => typeof c.mobile === "number").sort((a, b) => Number(a.mobile) - Number(b.mobile))
  const detailCols = columns.filter((c) => c !== titleCol && !keyCols.includes(c) && !c.mobileHidden)

  return (
    <div data-slot="data-table" className={cn("panel overflow-hidden", className)}>
      {/* Desktop and tablet: the table, scrolling inside the card with its header in view. */}
      <div className="hidden max-h-[calc(100dvh-var(--app-header)-7rem)] overflow-auto sm:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {table.getHeaderGroups()[0].headers.map((h) => {
                const c = byId.get(h.column.id)!
                const dir = h.column.getIsSorted()
                return (
                  <th key={h.id} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cn("sticky top-0 z-10 border-b border-border bg-card px-3 py-2.5 text-left text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase", c.numeric && "text-right", c.pinEnd && PIN_END, c.pinEnd && "z-20", c.headerClassName)}>
                    {h.column.getCanSort() ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground", c.numeric && "flex-row-reverse")}>
                        {c.header}
                        {dir === "asc" ? <ArrowUpIcon className="size-3" /> : dir === "desc" ? <ArrowDownIcon className="size-3" /> : <span className="size-3" />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} {...(rowAttrs?.(r.original) ?? {})} onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                className={cn("border-b border-divider last:border-b-0 hover:bg-subtle/60", onRowClick && "cursor-pointer", rowClassName?.(r.original))}>
                {columns.map((c) => <td key={c.id} className={cn("px-3 py-2.5 align-middle", c.numeric && "num text-right", c.pinEnd && PIN_END, c.className)}>{c.cell(r.original)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per row, its key fields, and the rest under Details. */}
      <ul className="divide-y divide-divider sm:hidden" aria-label={caption}>
        {shown.map((r) => <MobileRow key={r.id} row={r.original} title={titleCol} keys={keyCols} details={detailCols} onClick={onRowClick} attrs={rowAttrs?.(r.original)} />)}
      </ul>

      {total > PAGE_SIZES[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-meta text-muted-foreground">
          <span className="num">{from.toLocaleString("en-GB")}–{to.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2"><span className="hidden sm:inline">Rows</span>
              <NativeSelect value={String(pagination.pageSize)} onChange={(e) => setSize(Number(e.target.value))} aria-label="Rows a page" className="w-20 [&_select]:h-8">
                {PAGE_SIZES.map((n) => <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPagination((p) => ({ ...p, pageIndex: pageIndex - 1 }))}><ChevronLeftIcon /></Button>
            <span className="num">{pageIndex + 1} / {Math.max(1, pageCount)}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={pageIndex >= pageCount - 1} onClick={() => setPagination((p) => ({ ...p, pageIndex: pageIndex + 1 }))}><ChevronRightIcon /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MobileRow<T extends RowData>({ row, title, keys, details, onClick, attrs }: { row: T; title: DataColumn<T>; keys: DataColumn<T>[]; details: DataColumn<T>[]; onClick?: (row: T) => void; attrs?: Record<string, string | undefined> }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="space-y-2 px-4 py-3" {...(attrs ?? {})}>
      <div className={cn("min-w-0 text-sm font-medium", onClick && "cursor-pointer")} onClick={onClick ? () => onClick(row) : undefined}>{title.cell(row)}</div>
      {keys.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-meta">
          {keys.map((c) => <Fragment key={c.id}><dt className="text-muted-foreground">{c.header}</dt><dd className={cn("min-w-0 break-words", c.numeric && "num")}>{c.cell(row)}</dd></Fragment>)}
        </dl>
      )}
      {details.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-primary">
            {open ? "Hide details" : "Details"} <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-divider pt-2 text-meta">
              {details.map((c) => <Fragment key={c.id}><dt className="text-muted-foreground">{c.header}</dt><dd className={cn("min-w-0 break-words", c.numeric && "num")}>{c.cell(row)}</dd></Fragment>)}
            </dl>
          )}
        </>
      )}
    </li>
  )
}
