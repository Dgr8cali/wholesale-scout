"use client";

import { VatTag, vatBasisOf } from "@/components/VatTag";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  columnOrderingFeature, columnPinningFeature, columnResizingFeature, columnSizingFeature, columnVisibilityFeature,
  createColumnHelper, tableFeatures, useTable,
  type Column, type ColumnOrderState, type ColumnSizingState, type Header,
} from "@tanstack/react-table";
import {
  ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, Columns3Icon, CopyIcon, ExternalLinkIcon, GripVerticalIcon,
  MoreHorizontalIcon, PackageIcon, RefreshCwIcon, StarIcon, StarOffIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { ProductThumb } from "@/components/ProductThumb";
import { VerdictBadge } from "@/components/VerdictBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProductDecision, StatusChip } from "@/components/ui/status-chip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Sparks } from "@/lib/sparkline";
import { gbp, pct } from "@/lib/ui/client";
import { firstOrderFigures, type Figure } from "@/lib/ui/metrics";
import { approvalOf, brandOf, dormantOf, isCostOverridden, isWaived } from "@/lib/ui/resultRows";
import { ago } from "@/lib/ui/when";
import { overrideTitle } from "@/lib/costOverride";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { loadPrefs, normalizePrefs, pickerSummary, savePrefs, setShown, shiftColumn, visibilityOf, type Density, type TablePrefs } from "./tablePrefs";
import { buyPrice, decisionOf, figure, listingMoq, titleOf, type Result, type RowExtras, type SortKey } from "./types";

/**
 * One line of the table: a result, what the page adds to it (the brand map's verdict on Products and
 * Brand detail), and on a run whether it's an alternative ASIN under its EAN's lead.
 */
export interface ResultRow { r: Result; x?: RowExtras; alt?: boolean; groupKey?: string; others?: number }

/** The four pages that list wholesale products; each remembers its own columns. */
export type ResultsPage = "run" | "shortlist" | "brand" | "products";

/**
 * How rows arrive: a long list held in the browser and scrolled (a run), a list held in the
 * browser and paged (Shortlist, Brand detail), or pages from the server (Products).
 */
export type Paging =
  | { kind: "virtual" }
  | { kind: "client" }
  | { kind: "server"; page: number; more: boolean; onPage: (page: number) => void };

/** Rows a page: 50, or 10 on a phone (each row is a card there). */
export const PAGE_SIZE = 50;
export const PHONE_PAGE_SIZE = 10;

const PHONE = "(max-width: 639px)";
const subscribe = (f: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };
/** Under 640px wide: rows become cards. */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
}

interface ColSpec {
  id: string;
  label: string;
  /** Header text when it differs from the label (the label names it in the column picker). */
  header?: ReactNode;
  hint?: string;
  sort?: SortKey;
  numeric?: boolean;
  size: number;
  min?: number;
  max?: number;
  /** Always shown, never moved: the checkbox, the product and the row menu. */
  fixed?: boolean;
}

const COLS: ColSpec[] = [
  { id: "select", label: "Select", size: 44, fixed: true },
  { id: "product", label: "Product", sort: "title", size: 300, min: 200, max: 640, fixed: true },
  { id: "verdict", label: "Verdict", sort: "verdict", size: 112, min: 96, max: 180 },
  { id: "buy", label: "Buy price", header: <>Buy<br />price</>, hint: "The supplier's unit cost, ex-VAT in GBP", sort: "buy", numeric: true, size: 80, min: 64, max: 140 },
  { id: "sell", label: "Sell price", header: <>Sell<br />price</>, hint: "The price the gates scored at", sort: "sell_price", numeric: true, size: 80, min: 64, max: 140 },
  { id: "profit", label: "Profit", sort: "profit", numeric: true, size: 80, min: 64, max: 140 },
  { id: "roi", label: "ROI", sort: "roi", numeric: true, size: 68, min: 56, max: 120 },
  { id: "sales", label: "Sales / mo", header: <>Sales<br />/ mo</>, hint: "Est. sales / month", sort: "sales", numeric: true, size: 76, min: 60, max: 140 },
  { id: "bsr", label: "BSR", hint: "Best Sellers Rank now", sort: "bsr", numeric: true, size: 84, min: 64, max: 140 },
  { id: "sellers", label: "Offers", hint: "FBA offers on the listing", sort: "sellers", numeric: true, size: 68, min: 56, max: 120 },
  { id: "gated", label: "Gated", hint: "Open to sell, approval needed, or blocked", sort: "gated", size: 112, min: 96, max: 160 },
  { id: "score", label: "Score", sort: "score", numeric: true, size: 68, min: 56, max: 120 },
  { id: "landed", label: "Landed", sort: "landed_cost", numeric: true, size: 80, min: 64, max: 140 },
  { id: "maxLanded", label: "Max landed", header: <>Max<br />landed</>, hint: "The most a unit can cost landed and clear the profit floors", sort: "maxLanded", numeric: true, size: 84, min: 64, max: 140 },
  { id: "margin", label: "Margin", sort: "margin", numeric: true, size: 72, min: 56, max: 120 },
  { id: "share", label: "Your share / mo", header: <>Your share<br />/ mo</>, hint: "Sales / mo ÷ (FBA sellers + you), Amazon counted as 3 sellers", sort: "share", numeric: true, size: 84, min: 64, max: 140 },
  { id: "profitMo", label: "Your profit / mo", header: <>Your profit<br />/ mo</>, hint: "Your share × profit per unit", sort: "profitMo", numeric: true, size: 88, min: 64, max: 150 },
  { id: "orderQty", label: "Order qty", header: <>Order<br />qty</>, hint: "First order: the line cap ÷ landed cost, or the MOQ if that's more (flagged)", sort: "orderQty", numeric: true, size: 72, min: 56, max: 120 },
  { id: "months", label: "Months to sell", header: <>Months<br />to sell</>, hint: "Order qty ÷ your share / mo", sort: "months", numeric: true, size: 76, min: 60, max: 120 },
  { id: "buybox", label: "Buy Box", header: <>Buy<br />Box</>, sort: "buybox", numeric: true, size: 80, min: 64, max: 140 },
  { id: "rank90", label: "Rank, 90 days", header: <>Rank<br />90 d</>, hint: "Sales rank over 90 days from the stored Keepa snapshot; up is a better rank. Sorts by the 90-day average (best first), the current rank until the sparkline has loaded", sort: "rank90", numeric: true, size: 92, min: 80, max: 220 },
  { id: "bb90", label: "Buy Box, 90 days", header: <>Buy Box<br />90 d</>, hint: "Buy Box price over 90 days from the stored Keepa snapshot. Sorts by the 90-day average, the current Buy Box until the sparkline has loaded", sort: "bb90", numeric: true, size: 92, min: 80, max: 220 },
  { id: "hurdle", label: "Hurdle", sort: "hurdle_price", numeric: true, size: 80, min: 64, max: 140, hint: "Sell price at which this clears every profit floor" },
  { id: "supplier", label: "Supplier", sort: "supplier", size: 140, min: 96, max: 300 },
  { id: "screened", label: "Screened", sort: "screened", size: 96, min: 80, max: 160 },
  { id: "why", label: "Why", sort: "why", size: 320, min: 200, max: 900 },
  { id: "actions", label: "Actions", size: 48, fixed: true },
];
const SPEC = Object.fromEntries(COLS.map((c) => [c.id, c])) as Record<string, ColSpec>;
const IDS = COLS.map((c) => c.id);
const FIXED = COLS.filter((c) => c.fixed).map((c) => c.id);
const BOUNDS = Object.fromEntries(COLS.filter((c) => !c.fixed || c.id === "product").map((c) => [c.id, { min: c.min ?? 40, max: c.max ?? 1000 }]));
/** The default set on every page; the column picker shows the rest. */
export const DEFAULT_COLUMNS = ["product", "verdict", "buy", "sell", "profit", "roi", "sales", "bsr", "sellers", "gated"];
/** Columns that stay in view when scrolling sideways. */
const PINNED = { start: ["select", "product"], end: ["actions"] };
const NO_PINS = { start: [] as string[], end: [] as string[] };
const prefsKey = (page: ResultsPage) => `ws.results.columns.${page}`;

const features = tableFeatures({ columnVisibilityFeature, columnOrderingFeature, columnPinningFeature, columnSizingFeature, columnResizingFeature });
const helper = createColumnHelper<typeof features, ResultRow>();
const columns = helper.columns(COLS.map((c) => helper.display({
  id: c.id,
  size: c.size,
  minSize: c.fixed && c.id !== "product" ? c.size : c.min,
  maxSize: c.fixed && c.id !== "product" ? c.size : c.max,
  enableResizing: !c.fixed || c.id === "product",
})));

const BAND_STYLE = { green: "bg-success text-white", amber: "bg-highlight text-white", grey: "bg-subtle text-muted-foreground" } as const;
const VERDICT_EDGE = { pass: "var(--pass)", warn: "var(--highlight)", fail: "var(--fail)" } as const;
const GATED: Record<string, { label: string; tone: "good" | "warn" | "bad" }> = {
  open: { label: "Open", tone: "good" },
  approval_required: { label: "Approval", tone: "warn" },
  blocked: { label: "Blocked", tone: "bad" },
};
/** The DataTable header look: 12px, semibold, uppercase, muted. */
const TH = "text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground";

export interface RowActions {
  /** On the Shortlist (starred). */
  starred: (r: Result) => boolean;
  /** Add to or remove from the Shortlist. */
  onStar?: (r: Result) => void;
  /** Screen this one row again as a new run. */
  onRescreen?: (r: Result) => void;
}

export interface ResultsTableProps {
  rows: ResultRow[];
  page: ResultsPage;
  paging: Paging;
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  /** Every row the filters match (collapsed alternatives included), for select-all. */
  visibleIds: string[];
  /** The row open in the drawer. */
  activeId: string | null;
  onOpen: (id: string) => void;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  actions: RowActions;
  sparks: Record<string, Sparks | null>;
  observeSparks: (asin: string | null | undefined) => (el: Element | null) => void;
  empty: ReactNode;
  /** The profile's budget for one line (budget × max line share). */
  lineCapGbp: number;
  /** Max months to sell the order (Demand gate), to colour the figure. */
  maxMonths: number;
  /** A run: EANs whose other ASINs are shown. */
  expandedGroups?: Set<string>;
  onToggleGroup?: (key: string) => void;
  /** A seller scan: rows where this seller holds the Buy Box now are marked. */
  scanSellerId?: string | null;
  /** A line under a product (Shortlist: when it was last screened, and where). */
  rowNote?: (r: Result) => ReactNode;
  /** Left of the column picker: what's shown ("Showing 40 of 230"). */
  summary?: ReactNode;
}

/**
 * The results table on Run detail, Shortlist → Products, Brand detail and Products: one set of
 * columns (a default set, the rest in the column picker, saved per page), mono right-aligned
 * figures, a sticky header and product column, a "⋯" menu per row, and a card per row on a phone.
 * A click on a row opens it in the page's drawer.
 */
export function ResultsTable(props: ResultsTableProps) {
  const { rows, page, sort, activeId, paging } = props;
  const phone = useIsPhone();
  const [prefs, setPrefs] = useState<TablePrefs>(() => loadPrefs(prefsKey(page), IDS, BOUNDS));
  useEffect(() => savePrefs(prefsKey(page), prefs), [page, prefs]);

  // Client paging (and every list on a phone except a server's pages): 50 a page, 10 on a phone.
  const size = phone ? PHONE_PAGE_SIZE : PAGE_SIZE;
  const clientPaged = paging.kind === "client" || (paging.kind === "virtual" && phone);
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(pageIndex, pageCount - 1);
  const shown = clientPaged ? rows.slice(at * size, at * size + size) : rows;
  // Back to the first page when the list changes under it (a filter, a sort).
  const sig = `${rows.length}:${rows[0]?.r.id ?? ""}:${sort.key}:${sort.dir}`;
  const [lastSig, setLastSig] = useState(sig);
  if (sig !== lastSig) { setLastSig(sig); setPageIndex(0); }
  // The active row's page, when the drawer steps past this one.
  const [lastActive, setLastActive] = useState(activeId);
  if (activeId !== lastActive) {
    setLastActive(activeId);
    const i = clientPaged && activeId ? rows.findIndex((d) => d.r.id === activeId) : -1;
    if (i >= 0 && Math.floor(i / size) !== at) setPageIndex(Math.floor(i / size));
  }

  // A new page on a phone starts at its first card.
  const listTop = useRef<HTMLDivElement>(null);
  const turn = (f: (n: number) => void) => (n: number) => {
    f(n);
    if (phone) listTop.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const pager = clientPaged
    ? rows.length > size && <Pager phone={phone} from={at * size + 1} to={Math.min(rows.length, (at + 1) * size)} total={rows.length} page={at} pages={pageCount} onPage={turn(setPageIndex)} />
    : paging.kind === "server" && (paging.page > 0 || paging.more) && <Pager phone={phone} page={paging.page} more={paging.more} onPage={turn(paging.onPage)} />;

  // The VAT basis of the profit, ROI and margin figures: one tag when every row is on the same one.
  const bases = new Set(rows.map((d) => vatBasisOf(d.r.fees)).filter((b): b is boolean => b != null));
  const vatBasis = bases.size === 1 ? [...bases][0] : bases.size > 1 ? "mixed" : null;
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {props.summary}
        {vatBasis === "mixed"
          ? <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-semibold text-warn-ink" title="Rows on different VAT bases: Settings → Business → Recalculate all">Profit on mixed VAT bases</span>
          : vatBasis != null && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Profit, ROI and margin <VatTag registered={vatBasis} /></span>}
      </div>
      {!phone && <ColumnPicker prefs={prefs} setPrefs={setPrefs} />}
    </div>
  );

  if (phone) {
    return (
      <div className="scroll-mt-20 space-y-2" ref={listTop}>
        {toolbar}
        <div className="panel overflow-hidden">
          {!shown.length ? <div className="px-4 py-10 text-center text-sm text-muted-foreground">{props.empty}</div> : (
            <ul className="divide-y divide-divider" aria-label="Products">
              {shown.map((d) => <ResultCard key={d.r.id} d={d} props={props} />)}
            </ul>
          )}
          {pager}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {toolbar}
      <DesktopTable {...props} rows={shown} prefs={prefs} setPrefs={setPrefs} virtual={paging.kind === "virtual"} pager={pager || null} />
    </div>
  );
}

function DesktopTable(props: ResultsTableProps & { prefs: TablePrefs; setPrefs: (f: (p: TablePrefs) => TablePrefs) => void; virtual: boolean; pager: ReactNode }) {
  const { rows, prefs, setPrefs, sort, onSort, activeId, virtual } = props;

  // The card's width (measured below). Narrow, pinning would leave no room to scroll the rest.
  const [boxW, setBoxW] = useState(0);
  const narrow = boxW > 0 && boxW < 640;
  const pinning = narrow ? NO_PINS : PINNED;

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (d) => d.r.id,
    columnResizeMode: "onChange",
    state: {
      columnVisibility: visibilityOf(prefs, IDS, DEFAULT_COLUMNS, FIXED),
      columnOrder: prefs.order,
      columnSizing: prefs.sizing,
      columnPinning: pinning,
    },
    onColumnOrderChange: (u) => setPrefs((p) => ({ ...p, order: typeof u === "function" ? (u as (s: ColumnOrderState) => ColumnOrderState)(p.order) : u })),
    onColumnSizingChange: (u) => setPrefs((p) => ({ ...p, sizing: typeof u === "function" ? (u as (s: ColumnSizingState) => ColumnSizingState)(p.sizing) : u })),
  });

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const headers = [...table.getStartLeafHeaders(), ...table.getCenterLeafHeaders(), ...table.getEndLeafHeaders()];
  const visibleIds = headers.map((h) => h.column.id);
  // The flexible column (Why, else the product) takes up any slack.
  const flexId = visibleIds.includes("why") ? "why" : "product";
  const total = headers.reduce((s, h) => s + h.getSize(), 0);
  const slack = Math.max(0, boxW - total);
  const widthOf = (c: Column<typeof features, ResultRow, unknown>) => c.getSize() + (c.id === flexId ? slack : 0);
  const lastPinned = pinning.start.filter((id) => visibleIds.includes(id)).at(-1);
  const pinStyle = (c: Column<typeof features, ResultRow, unknown>): CSSProperties | undefined =>
    c.getIsPinned() === "start" ? { position: "sticky", insetInlineStart: c.getStart("start") }
      : c.getIsPinned() === "end" ? { position: "sticky", insetInlineEnd: c.getAfter("end") } : undefined;

  // Virtual: only the rows in view (plus a margin) are in the DOM, so a 2,000-row run stays quick.
  const modelRows = table.getRowModel().rows;
  // TanStack Virtual returns functions the React Compiler can't memoise safely; this component opts out.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtual ? modelRows.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => (prefs.density === "compact" ? 41 : 61),
    overscan: 8,
    getItemKey: (i) => modelRows[i]?.id ?? i,
  });
  const items = virtual ? virtualizer.getVirtualItems() : modelRows.map((_, index) => ({ index, start: 0, end: 0 }));
  const padTop = virtual ? items[0]?.start ?? 0 : 0;
  const padBottom = virtual && items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

  // Keep the active row (the one in the drawer) in view as it steps, rendered or not.
  useEffect(() => {
    if (!activeId) return;
    const i = modelRows.findIndex((r) => r.id === activeId);
    if (i < 0) return;
    if (virtual) virtualizer.scrollToIndex(i, { align: "auto" });
    const f = requestAnimationFrame(() => requestAnimationFrame(() => {
      scroller.current?.querySelector(`[data-row-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: "nearest" });
    }));
    return () => cancelAnimationFrame(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the active row changes
  }, [activeId]);

  // Header drag to reorder (the column picker does the same by buttons).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const move = (id: string, to: string) => {
    if (id === to) return;
    table.setColumnOrder((order) => {
      const o = order.length ? [...order] : [...IDS];
      const rightwards = o.indexOf(id) < o.indexOf(to);
      o.splice(o.indexOf(id), 1);
      o.splice(o.indexOf(to) + (rightwards ? 1 : 0), 0, id);
      return o;
    });
  };
  const compact = prefs.density === "compact";

  return (
    <div className="panel overflow-hidden">
      <div ref={scroller} className="results-scroll">
        <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: Math.max(total, boxW) }} data-density={prefs.density}>
          <colgroup>
            {headers.map((h) => <col key={h.id} style={{ width: widthOf(h.column) }} />)}
          </colgroup>
          <thead className="text-left">
            <tr>
              {headers.map((h) => (
                <HeaderCell key={h.id} header={h} spec={SPEC[h.column.id]} sort={sort} onSort={onSort}
                  style={pinStyle(h.column)} edge={h.column.id === lastPinned}
                  dragging={dragId === h.column.id} dropTarget={dropId === h.column.id && dragId !== h.column.id}
                  onDragStart={() => setDragId(h.column.id)} onDragEnd={() => { setDragId(null); setDropId(null); }}
                  onDragOver={() => dragId && setDropId(h.column.id)}
                  onDrop={() => { if (dragId) move(dragId, h.column.id); setDragId(null); setDropId(null); }}>
                  {h.column.id === "select" ? <SelectAll visible={props.visibleIds} selected={props.selected} onChange={props.onSelect} />
                    : h.column.id === "actions" ? <span className="sr-only">Actions</span> : null}
                </HeaderCell>
              ))}
            </tr>
          </thead>
          {padTop > 0 && <tbody aria-hidden="true"><tr><td colSpan={headers.length} style={{ height: padTop, padding: 0, border: 0 }} /></tr></tbody>}
          <tbody>
            {items.map((vi) => {
              const row = modelRows[vi.index];
              const d = row.original;
              const cells = [...row.getStartVisibleCells(), ...row.getCenterVisibleCells(), ...row.getEndVisibleCells()];
              return (
                <tr key={row.id} data-index={vi.index} ref={virtual ? virtualizer.measureElement : undefined} data-row-id={d.r.id}
                  className="rt-row group cursor-pointer scroll-mt-12 align-top"
                  data-alt={d.alt || undefined} data-selected={props.selected.has(d.r.id) || undefined} data-active={activeId === d.r.id || undefined}
                  onClick={() => props.onOpen(d.r.id)}>
                  {cells.map((cell) => (
                    <td key={cell.id} style={pinStyle(cell.column)}
                      className={cn("border-b border-divider", cell.column.getIsPinned() && "z-10", cell.column.id === lastPinned && "rt-edge",
                        cell.column.getIsPinned() === "end" && "rt-edge-end", SPEC[cell.column.id].numeric && "text-right")}>
                      <Cell id={cell.column.id} d={d} props={props} compact={compact} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {padBottom > 0 && <tbody aria-hidden="true"><tr><td colSpan={headers.length} style={{ height: padBottom, padding: 0, border: 0 }} /></tr></tbody>}
          {!rows.length && (
            <tbody><tr><td colSpan={headers.length} className="p-0">
              <div className="sticky left-0 px-4 py-10 text-center text-sm text-muted-foreground" style={{ width: boxW || undefined }}>{props.empty}</div>
            </td></tr></tbody>
          )}
        </table>
      </div>
      {props.pager}
    </div>
  );
}

function HeaderCell({ header, spec, sort, onSort, style, edge, children, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop }: {
  header: Header<typeof features, ResultRow, unknown>;
  spec: ColSpec;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  style?: CSSProperties;
  edge: boolean;
  children?: ReactNode;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const col = header.column;
  const movable = !spec.fixed;
  const sorted = spec.sort && sort.key === spec.sort;
  const label = spec.header ?? spec.label;
  const Arrow = sorted ? (sort.dir === -1 ? ArrowDownIcon : ArrowUpIcon) : null;
  return (
    <th scope="col" style={style} title={spec.hint}
      aria-sort={sorted ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className={cn("group/th relative sticky top-0 border-b border-border bg-card px-2 py-2.5 align-bottom leading-tight", TH,
        col.getIsPinned() ? "z-30" : "z-20", edge && "rt-edge", col.getIsPinned() === "end" && "rt-edge-end", spec.numeric && "text-right",
        dragging && "opacity-50", dropTarget && "shadow-[inset_2px_0_0_var(--brand)]")}
      draggable={movable} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", col.id); onDragStart(); }}
      onDragEnd={onDragEnd} onDragOver={(e) => { if (movable) { e.preventDefault(); onDragOver(); } }} onDrop={(e) => { e.preventDefault(); if (movable) onDrop(); }}>
      {children ?? (
        <span className={cn("flex items-end gap-0.5", spec.numeric && "justify-end")}>
          {movable && <GripVerticalIcon aria-hidden="true" className="mb-px size-3 flex-none cursor-grab text-muted-foreground/0 group-hover/th:text-muted-foreground/60" />}
          {spec.sort ? (
            <button type="button" className={cn("inline-flex cursor-pointer items-end gap-1 uppercase hover:text-foreground", spec.numeric ? "flex-row-reverse text-right" : "text-left", sorted && "text-foreground")}
              onClick={() => onSort(spec.sort!)}>
              <span>{label}</span>
              {Arrow ? <Arrow className="mb-px size-3 flex-none" aria-hidden="true" /> : <span className="size-3 flex-none" />}
            </button>
          ) : <span>{label}</span>}
        </span>
      )}
      {col.getCanResize() && (
        <div role="separator" aria-orientation="vertical" aria-label={`Resize ${spec.label}`}
          onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} onDoubleClick={() => col.resetSize()}
          onClick={(e) => e.stopPropagation()} draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={cn("absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/60", col.getIsResizing() && "bg-primary")} />
      )}
    </th>
  );
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** The product: picture, title, ASIN (to Amazon), EAN and supplier. */
function ProductCell({ d, props, compact, size }: { d: ResultRow; props: ResultsTableProps; compact: boolean; size: number }) {
  const { r, alt } = d;
  const starred = props.actions.starred(r);
  return (
    <div className={cn("flex min-w-0 gap-2.5", alt && "pl-6")}>
      <ProductThumb url={r.product?.image_url} asin={r.product?.asin} title={titleOf(r)} brand={brandOf(r)} size={size} />
      <div className="min-w-0 flex-1">
        <div className={cn("min-w-0 font-medium leading-snug break-words", compact ? "line-clamp-1" : "line-clamp-2")} title={titleOf(r)}>
          {starred && <StarIcon className="mr-1 inline size-3.5 -translate-y-px fill-current text-warn-ink" aria-label="On your Shortlist" />}
          {alt ? "↳ " : ""}{titleOf(r)}
        </div>
        <div className="num truncate text-xs text-muted-foreground">
          {r.product?.asin
            ? <a className="text-primary hover:underline" href={`https://www.amazon.co.uk/dp/${r.product.asin}`} target="_blank" rel="noreferrer" onClick={stop}>{r.product.asin}</a>
            : r.product?.ean}
          {r.product?.asin && r.product.ean && r.product.ean !== r.product.asin && <> · {r.product.ean}</>}
          {r.offer?.supplier && <> · <span className="font-sans">{r.offer.supplier.name}{r.offer_count > 1 ? ` (+${r.offer_count - 1})` : ""}</span></>}
        </div>
        {props.rowNote?.(r)}
        {props.scanSellerId && r.inputs?.market?.buyBoxSellerId != null && (
          r.inputs.market.buyBoxSellerId === props.scanSellerId
            ? <span className="mt-0.5 inline-block rounded bg-primary-soft px-1 text-xs font-semibold text-primary" title="This seller holds the Buy Box now">Holds Buy Box</span>
            : <span className="mt-0.5 inline-block text-xs text-muted-foreground" title={`Buy Box held by ${r.inputs.market.buyBoxSellerId}`}>Buy Box: another seller</span>
        )}
        {!alt && (d.others ?? 0) > 0 && props.onToggleGroup && d.groupKey && (
          <button type="button" className="cursor-pointer text-xs font-medium text-primary hover:underline" onClick={(e) => { stop(e); props.onToggleGroup!(d.groupKey!); }}>
            {props.expandedGroups?.has(d.groupKey) ? "▾ Hide" : "▸"} {d.others} other ASIN{d.others! > 1 ? "s" : ""} for this EAN
          </button>
        )}
      </div>
    </div>
  );
}

/** Buy / Check / Skip / Not scored (or Error), with the row's flags. */
function VerdictCell({ d }: { d: ResultRow }) {
  const { r } = d;
  const v = decisionOf(r, d.x);
  return (
    <div className="flex flex-col items-start gap-1">
      {r.status === "error" && d.x?.decision === undefined ? <VerdictBadge verdict={null} error /> : <ProductDecision verdict={v} />}
      {dormantOf(r) && <StatusChip tone="neutral" icon={false} className="h-5 px-2" title="Nobody sells this listing now; judged on its Keepa history">Dormant</StatusChip>}
      {isWaived(r) && <StatusChip tone="info" icon={false} className="h-5 px-2" title="A gate on this row is waived by you">Waived</StatusChip>}
      {isCostOverridden(r) && <StatusChip tone="info" icon={false} className="h-5 px-2" title={overrideTitle(r.cost_override!)}>Cost overridden</StatusChip>}
    </div>
  );
}

function Cell({ id, d, props, compact }: { id: string; d: ResultRow; props: ResultsTableProps; compact: boolean }) {
  const { r } = d;
  const pad = compact ? "px-2 py-1.5" : "px-2 py-2.5";
  const num = cn("num block overflow-hidden text-sm whitespace-nowrap text-ellipsis", pad);
  const dash = <span className="text-muted-foreground">—</span>;
  switch (id) {
    case "select": {
      const v = decisionOf(r, d.x);
      const edge = r.status === "error" ? VERDICT_EDGE.fail : v ? VERDICT_EDGE[v] : "transparent";
      return (
        <div className={cn("flex items-center pl-3", compact ? "py-1.5" : "py-2.5")} style={{ boxShadow: `inset 4px 0 0 ${edge}` }} onClick={stop}>
          <Checkbox aria-label={`Select ${titleOf(r)}`} checked={props.selected.has(r.id)} onCheckedChange={() => {
            const n = new Set(props.selected);
            if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
            props.onSelect(n);
          }} />
        </div>
      );
    }
    case "product": return <div className={pad}><ProductCell d={d} props={props} compact={compact} size={compact ? 28 : 40} /></div>;
    case "verdict": return <div className={pad}><VerdictCell d={d} /></div>;
    case "score":
      return (
        <div className={pad}>
          {r.score != null && r.band
            ? <span className={cn("num inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold", BAND_STYLE[r.band])}>{Math.round(r.score)}</span>
            : dash}
        </div>
      );
    case "buy": { const b = buyPrice(r, d.x); return <span className={num}>{b == null ? dash : gbp(b)}</span>; }
    case "sales": return <FigureCell f={figure(r, "sales")} className={num} />;
    case "sellers": return <FigureCell f={figure(r, "sellers")} className={num} />;
    case "share": return <FigureCell f={figure(r, "share")} className={num} decimals />;
    case "bsr": {
      const v = r.inputs?.market?.rankNow;
      return <span className={num}>{v == null ? dash : `#${Math.round(v).toLocaleString("en-GB")}`}</span>;
    }
    case "gated": {
      const a = approvalOf(r);
      const g = a ? GATED[a] : undefined;
      return (
        <div className={pad}>{g ? <StatusChip tone={g.tone}>{g.label}</StatusChip> : dash}</div>
      );
    }
    case "orderQty":
    case "months": {
      if (r.score == null) return <span className={num}>{dash}</span>;
      const f = firstOrderFigures(r.inputs?.market, r.landed_cost, listingMoq(r), props.lineCapGbp);
      if (id === "orderQty") {
        return (
          <span className={num} title={f.qty.note}>
            {f.qty.value == null ? dash : f.qty.value.toLocaleString("en-GB")}
            {f.qty.moqOverCap && <span className="ml-1 rounded bg-warn-soft px-1 text-xs font-semibold text-warn-ink">MOQ</span>}
          </span>
        );
      }
      const v = f.months.value;
      return (
        <span className={cn(num, v != null && v > props.maxMonths && "text-danger")} title={f.months.note}>
          {v == null ? dash : !Number.isFinite(v) ? "∞" : v.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
        </span>
      );
    }
    case "profitMo": {
      const f = figure(r, "profitMo");
      return <FigureCell f={f} className={cn(num, f.value != null && f.value < 0 && "text-danger")} money />;
    }
    case "buybox": return <FigureCell f={figure(r, "buybox")} className={num} money />;
    case "rank90":
    case "bb90": {
      const s = r.product?.asin ? props.sparks[r.product.asin] : undefined;
      const values = id === "rank90" ? s?.rank : s?.buyBox;
      return (
        <div ref={props.observeSparks(r.product?.asin)} className={cn("flex items-center justify-end", pad)}>
          {!r.product?.asin ? dash
            : s === undefined ? <span className="h-[22px] w-20 animate-pulse rounded bg-subtle" aria-label="Loading" />
            : <Sparkline values={values} invert={id === "rank90"} height={compact ? 16 : 22}
                label={id === "rank90" ? sparkLabel("Sales rank", values, (v) => `#${Math.round(v).toLocaleString("en-GB")}`) : sparkLabel("Buy Box", values, (v) => gbp(v))} />}
        </div>
      );
    }
    case "landed":
      // No cost given (a check or a seller scan): the most it can cost landed and clear the floors.
      if (r.landed_cost == null && r.inputs?.maxLandedGbp != null) {
        return <span className={cn(num, "text-muted-foreground")} title="No cost given: the most it can cost landed and still clear the profit floors">≤ {gbp(r.inputs.maxLandedGbp)}</span>;
      }
      return <span className={num}>{gbp(r.landed_cost)}</span>;
    case "maxLanded": {
      const v = d.x?.maxLanded !== undefined ? d.x.maxLanded : r.inputs?.maxLandedGbp ?? null;
      return <span className={num}>{v == null ? dash : gbp(v)}</span>;
    }
    case "sell": return <span className={num}>{gbp(r.sell_price)}</span>;
    case "profit": return <span className={cn(num, r.profit != null && r.profit < 0 && "text-danger")}>{gbp(r.profit)}</span>;
    case "roi": return <span className={num}>{pct(r.roi)}</span>;
    case "margin": return <span className={num}>{pct(r.margin)}</span>;
    case "hurdle": return <span className={num}>{gbp(r.hurdle_price)}</span>;
    case "supplier": return <span className={cn("block truncate text-sm", pad)} title={r.offer?.supplier?.name}>{r.offer?.supplier?.name ?? dash}</span>;
    case "screened": {
      const at = d.x?.screenedAt ?? r.updated_at ?? null;
      return <span className={cn("block text-meta whitespace-nowrap text-muted-foreground", pad)}>{at ? ago(at) : "—"}</span>;
    }
    case "why":
      return (
        <div className={cn("text-xs leading-snug [overflow-wrap:anywhere]", pad)}>
          {/* Clamped to keep rows even; the full text is in the tooltip and the drawer. */}
          <p className={compact ? "line-clamp-2" : "line-clamp-3"} title={(r.status === "error" ? r.error : r.why) ?? undefined}>{r.status === "error" ? r.error : r.why}</p>
        </div>
      );
    case "actions": return <div className={cn("flex justify-center", compact ? "py-1" : "py-2")} onClick={stop}><RowMenu r={r} actions={props.actions} /></div>;
    default: return null;
  }
}

/** The "⋯" menu: Shortlist, re-screen, Amazon, copy the ASIN, the product page. */
function RowMenu({ r, actions }: { r: Result; actions: RowActions }) {
  const asin = r.product?.asin;
  const starred = actions.starred(r);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${titleOf(r)}`} className="text-muted-foreground"><MoreHorizontalIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.onStar && r.product && (
          <DropdownMenuItem onSelect={() => actions.onStar!(r)}>
            {starred ? <><StarOffIcon /> Remove from Shortlist</> : <><StarIcon /> Add to Shortlist</>}
          </DropdownMenuItem>
        )}
        {actions.onRescreen && <DropdownMenuItem onSelect={() => actions.onRescreen!(r)}><RefreshCwIcon /> Re-screen</DropdownMenuItem>}
        {(actions.onStar || actions.onRescreen) && asin && <DropdownMenuSeparator />}
        {asin && <DropdownMenuItem asChild><Link href={`/products/${asin}`}><PackageIcon /> Product page</Link></DropdownMenuItem>}
        {asin && <DropdownMenuItem asChild><a href={`https://www.amazon.co.uk/dp/${asin}`} target="_blank" rel="noreferrer"><ExternalLinkIcon /> Open on Amazon</a></DropdownMenuItem>}
        {asin && (
          <DropdownMenuItem onSelect={() => {
            navigator.clipboard?.writeText(asin).then(() => toast.success(`Copied ${asin}`), () => toast.error("Couldn't copy"));
          }}><CopyIcon /> Copy ASIN</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A row on a phone: picture, title, verdict, profit, ROI, sales a month; Details opens the drawer. */
function ResultCard({ d, props }: { d: ResultRow; props: ResultsTableProps }) {
  const { r } = d;
  const sales = figure(r, "sales").value;
  const v = decisionOf(r, d.x);
  return (
    <li className="flex gap-2.5 py-2.5 pr-2 pl-3" data-active={props.activeId === r.id || undefined}
      style={{ boxShadow: `inset 4px 0 0 ${r.status === "error" ? VERDICT_EDGE.fail : v ? VERDICT_EDGE[v] : "transparent"}` }}>
      <div className="pt-0.5 pl-1">
        <Checkbox aria-label={`Select ${titleOf(r)}`} checked={props.selected.has(r.id)} onCheckedChange={() => {
          const n = new Set(props.selected);
          if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
          props.onSelect(n);
        }} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <ProductCell d={d} props={props} compact={false} size={40} />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {r.status === "error" && d.x?.decision === undefined ? <VerdictBadge verdict={null} error /> : <ProductDecision verdict={v} />}
          <span className={cn("num font-medium", r.profit != null && r.profit < 0 && "text-danger")}>{gbp(r.profit)}<span className="font-sans font-normal text-muted-foreground"> profit</span></span>
          <span className="num font-medium">{pct(r.roi)}<span className="font-sans font-normal text-muted-foreground"> ROI</span></span>
          <span className="num font-medium">{sales == null ? "—" : Math.round(sales).toLocaleString("en-GB")}<span className="font-sans font-normal text-muted-foreground">/mo</span></span>
        </div>
      </div>
      <div className="flex flex-none flex-col items-end justify-between gap-1">
        <RowMenu r={r} actions={props.actions} />
        <Button variant="ghost" size="xs" className="px-1.5 text-primary" onClick={() => props.onOpen(r.id)}>Details</Button>
      </div>
    </li>
  );
}

function sparkLabel(what: string, values: (number | null)[] | null | undefined, fmt: (v: number) => string) {
  const nums = (values ?? []).filter((v): v is number => v != null);
  if (!nums.length) return `${what}: no data in 90 days`;
  return `${what} over 90 days: now ${fmt(nums[nums.length - 1])}, range ${fmt(Math.min(...nums))} to ${fmt(Math.max(...nums))}`;
}

/** A number with its source as a tooltip; "—" when there's nothing to show. */
function FigureCell({ f, money, decimals, className }: { f: Figure; money?: boolean; decimals?: boolean; className: string }) {
  return (
    <span className={className} title={f.note}>
      {f.value == null ? <span className="text-muted-foreground">—</span> : money ? gbp(f.value)
        : decimals && f.value < 10 ? f.value.toLocaleString("en-GB", { maximumFractionDigits: 1 }) : Math.round(f.value).toLocaleString("en-GB")}
    </span>
  );
}

/** Select-all for the filtered set: checked when all are selected, dash when some are. */
function SelectAll({ visible, selected, onChange }: { visible: string[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const n = visible.filter((x) => selected.has(x)).length;
  const all = n > 0 && n === visible.length;
  return (
    <div className="flex pl-1">
      <Checkbox aria-label={all ? "Clear selection" : `Select all ${visible.length} shown`}
        title={all ? "Clear selection" : `Select all ${visible.length} rows matching the filters`}
        checked={all ? true : n > 0 ? "indeterminate" : false}
        onCheckedChange={() => {
          const next = new Set(selected);
          if (all) for (const x of visible) next.delete(x);
          else for (const x of visible) next.add(x);
          onChange(next);
        }} />
    </div>
  );
}

/**
 * Previous / next, with "1–50 of 230" for a list held here, or the page number for a server's pages.
 * On a phone: worded Previous and Next buttons (44px) and, when the pages are known, a page picker.
 */
function Pager({ page, pages, from, to, total, more, onPage, phone }: { page: number; pages?: number; from?: number; to?: number; total?: number; more?: boolean; onPage: (n: number) => void; phone?: boolean }) {
  const last = pages != null ? page >= pages - 1 : !more;
  const range = total != null ? `${from!.toLocaleString("en-GB")}–${to!.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")}` : `Page ${page + 1}`;
  if (phone) {
    return (
      <nav aria-label="Pages" className="space-y-2 border-t border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2 text-meta text-muted-foreground">
          <span className="num">{range}</span>
          {pages != null && pages > 1 && (
            <label className="flex items-center gap-1.5">
              Page
              <NativeSelect value={String(page)} onChange={(e) => onPage(Number(e.target.value))} aria-label="Go to page" className="w-20 [&_select]:h-11">
                {Array.from({ length: pages }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
              </NativeSelect>
              of {pages}
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeftIcon /> Previous</Button>
          <Button variant="secondary" className="h-11" disabled={last} onClick={() => onPage(page + 1)}>Next <ChevronRightIcon /></Button>
        </div>
      </nav>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-meta text-muted-foreground">
      <span className="num">{range}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeftIcon /></Button>
        {pages != null && <span className="num">{page + 1} / {pages}</span>}
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={last} onClick={() => onPage(page + 1)}><ChevronRightIcon /></Button>
      </div>
    </div>
  );
}

/** Show, hide and reorder columns (saved for this page); row density; reset. */
function ColumnPicker({ prefs, setPrefs }: { prefs: TablePrefs; setPrefs: (f: (p: TablePrefs) => TablePrefs) => void }) {
  const movable = prefs.order.filter((id) => !FIXED.includes(id));
  const { hidden, added } = pickerSummary(prefs, IDS, DEFAULT_COLUMNS, FIXED);
  const note = [added && `${added} added`, hidden && `${hidden} hidden`].filter(Boolean).join(", ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm"><Columns3Icon /> Columns{note ? <span className="text-muted-foreground"> · {note}</span> : null}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-2">
        <p className="eyebrow px-1.5 pb-1">Show and order columns</p>
        <ul className="max-h-[55vh] space-y-0.5 overflow-auto">
          {movable.map((id, i) => {
            const s = SPEC[id];
            return (
              <li key={id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-subtle">
                <Checkbox id={`col-${id}`} checked={visibilityOf(prefs, [id], DEFAULT_COLUMNS, FIXED)[id]}
                  onCheckedChange={(v) => setPrefs((p) => setShown(p, id, !!v, FIXED))} />
                <label htmlFor={`col-${id}`} className="min-w-0 flex-1 truncate text-sm">{s.label}</label>
                <Button variant="ghost" size="icon-xs" aria-label={`Move ${s.label} left`} disabled={i === 0} onClick={() => setPrefs((p) => shiftColumn(p, id, -1, FIXED))}><ArrowUpIcon /></Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Move ${s.label} right`} disabled={i === movable.length - 1} onClick={() => setPrefs((p) => shiftColumn(p, id, 1, FIXED))}><ArrowDownIcon /></Button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t px-1.5 pt-2">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={prefs.density} aria-label="Row density"
            onValueChange={(v) => v && setPrefs((p) => ({ ...p, density: v as Density }))}>
            <ToggleGroupItem value="comfortable" className="px-2 text-xs">Comfortable</ToggleGroupItem>
            <ToggleGroupItem value="compact" className="px-2 text-xs">Compact</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="ghost" size="xs" onClick={() => setPrefs((p) => ({ ...normalizePrefs(null, IDS), density: p.density }))}>Reset</Button>
        </div>
        <p className="px-1.5 text-xs text-muted-foreground">Drag headers to reorder; drag their edges to resize. Saved for this page.</p>
      </PopoverContent>
    </Popover>
  );
}

