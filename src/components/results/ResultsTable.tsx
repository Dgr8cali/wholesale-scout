"use client";

import {
  columnOrderingFeature, columnPinningFeature, columnResizingFeature, columnSizingFeature, columnVisibilityFeature,
  createColumnHelper, tableFeatures, useTable,
  type Column, type ColumnOrderState, type ColumnSizingState, type ColumnVisibilityState, type Header,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, Columns3Icon, GripVerticalIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FavouriteStar } from "@/components/FavouriteStar";
import { ProductThumb } from "@/components/ProductThumb";
import { VerdictBadge } from "@/components/VerdictBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Sparks } from "@/lib/sparkline";
import { RestrictionLink } from "@/lib/ui/RestrictionLink";
import { gbp, pct } from "@/lib/ui/client";
import { firstOrderFigures, type Figure } from "@/lib/ui/metrics";
import { brandOf, dormantOf, favKey, isWaived } from "@/lib/ui/resultRows";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { loadPrefs, normalizePrefs, savePrefs, type Density, type TablePrefs } from "./tablePrefs";
import { figure, listingMoq, titleOf, type Result, type SortKey } from "./types";

/** One line of the table: a listing, and whether it's an alternative ASIN under its EAN's lead. */
export interface DisplayRow { r: Result; alt: boolean; groupKey: string; others: number }

interface ColSpec {
  id: string;
  label: string;
  /** Header text when it differs from the label (the label names it in the Columns menu). */
  header?: ReactNode;
  hint?: string;
  sort?: SortKey;
  numeric?: boolean;
  size: number;
  min?: number;
  max?: number;
  fixed?: boolean;
}

const COLS: ColSpec[] = [
  { id: "select", label: "Select", size: 60, fixed: true },
  { id: "product", label: "Product", sort: "title", size: 270, min: 200, max: 640 },
  { id: "verdict", label: "Verdict", sort: "verdict", size: 96, min: 88, max: 160 },
  { id: "score", label: "Score", sort: "score", numeric: true, size: 68, min: 56, max: 120 },
  { id: "sales", label: "Sales / mo", header: <>Sales<br />/ mo</>, hint: "Est. sales / month", sort: "sales", numeric: true, size: 76, min: 60, max: 140 },
  { id: "share", label: "Your share / mo", header: <>Your share<br />/ mo</>, hint: "Sales / mo ÷ (FBA sellers + you), Amazon counted as 3 sellers", sort: "share", numeric: true, size: 84, min: 64, max: 140 },
  { id: "orderQty", label: "Order qty", header: <>Order<br />qty</>, hint: "First order: the line cap ÷ landed cost, or the MOQ if that's more (flagged)", sort: "orderQty", numeric: true, size: 72, min: 56, max: 120 },
  { id: "months", label: "Months to sell", header: <>Months<br />to sell</>, hint: "Order qty ÷ your share / mo", sort: "months", numeric: true, size: 76, min: 60, max: 120 },
  { id: "sellers", label: "Sellers", sort: "sellers", numeric: true, size: 72, min: 56, max: 120 },
  { id: "buybox", label: "Buy Box", header: <>Buy<br />Box</>, sort: "buybox", numeric: true, size: 80, min: 64, max: 140 },
  { id: "rank90", label: "Rank, 90 days", header: <>Rank<br />90 d</>, hint: "Sales rank over 90 days from the stored Keepa snapshot; up is a better rank", size: 92, min: 80, max: 220 },
  { id: "bb90", label: "Buy Box, 90 days", header: <>Buy Box<br />90 d</>, hint: "Buy Box price over 90 days from the stored Keepa snapshot", size: 92, min: 80, max: 220 },
  { id: "landed", label: "Landed", sort: "landed_cost", numeric: true, size: 80, min: 64, max: 140 },
  { id: "sell", label: "Sell", sort: "sell_price", numeric: true, size: 80, min: 64, max: 140 },
  { id: "profit", label: "Profit", sort: "profit", numeric: true, size: 80, min: 64, max: 140 },
  { id: "profitMo", label: "Your profit / mo", header: <>Your profit<br />/ mo</>, hint: "Your share × profit per unit", sort: "profitMo", numeric: true, size: 88, min: 64, max: 150 },
  { id: "roi", label: "ROI", sort: "roi", numeric: true, size: 68, min: 56, max: 120 },
  { id: "margin", label: "Margin", sort: "margin", numeric: true, size: 72, min: 56, max: 120 },
  { id: "hurdle", label: "Hurdle", sort: "hurdle_price", numeric: true, size: 80, min: 64, max: 140, hint: "Sell price at which this clears every profit floor" },
  { id: "why", label: "Why", size: 320, min: 200, max: 900 },
];
const SPEC = Object.fromEntries(COLS.map((c) => [c.id, c])) as Record<string, ColSpec>;
const IDS = COLS.map((c) => c.id);
const BOUNDS = Object.fromEntries(COLS.filter((c) => !c.fixed).map((c) => [c.id, { min: c.min ?? 40, max: c.max ?? 1000 }]));
/** Columns that stay in view when scrolling sideways. */
const PINNED = { start: ["select", "product"], end: [] as string[] };

const features = tableFeatures({ columnVisibilityFeature, columnOrderingFeature, columnPinningFeature, columnSizingFeature, columnResizingFeature });
const helper = createColumnHelper<typeof features, DisplayRow>();
const columns = helper.columns(COLS.map((c) => helper.display({
  id: c.id,
  size: c.size,
  minSize: c.fixed ? c.size : c.min,
  maxSize: c.fixed ? c.size : c.max,
  enableResizing: !c.fixed,
  enableHiding: !c.fixed && c.id !== "product",
})));

const BAND_STYLE = { green: "bg-pass text-white", amber: "bg-warn text-white", grey: "bg-muted text-muted-foreground" } as const;
const VERDICT_EDGE = { pass: "var(--pass)", warn: "var(--warn)", fail: "var(--fail)" } as const;

export interface ResultsTableProps {
  rows: DisplayRow[];
  /** localStorage key for this table's layout. */
  storageKey: string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Every listing the filters match (collapsed alternatives included), for select-all. */
  visibleIds: string[];
  onSelectAll: (next: Set<string>) => void;
  expandedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  open: Set<string>;
  onToggleOpen: (id: string) => void;
  activeId: string | null;
  onActivate: (id: string) => void;
  favourites: Set<string>;
  onStar: (r: Result) => void;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  sparks: Record<string, Sparks | null>;
  observeSparks: (asin: string | null | undefined) => (el: Element | null) => void;
  renderDetail: (r: Result) => ReactNode;
  empty: ReactNode;
  /** The profile's budget for one line (budget × max line share). */
  lineCapGbp: number;
  /** Max months to sell the order (Demand gate), to colour the figure. */
  maxMonths: number;
  /** A seller scan: rows where this seller holds the Buy Box now are marked. */
  scanSellerId?: string | null;
}

export function ResultsTable(props: ResultsTableProps) {
  const { rows, storageKey, sort, onSort, activeId } = props;
  const [prefs, setPrefs] = useState<TablePrefs>(() => loadPrefs(storageKey, IDS, BOUNDS));
  useEffect(() => savePrefs(storageKey, prefs), [storageKey, prefs]);

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (d) => d.r.id,
    columnResizeMode: "onChange",
    state: {
      columnVisibility: prefs.visibility,
      columnOrder: prefs.order,
      columnSizing: prefs.sizing,
      columnPinning: PINNED,
    },
    onColumnVisibilityChange: (u) => setPrefs((p) => ({ ...p, visibility: typeof u === "function" ? (u as (s: ColumnVisibilityState) => ColumnVisibilityState)(p.visibility) : u })),
    onColumnOrderChange: (u) => setPrefs((p) => ({ ...p, order: typeof u === "function" ? (u as (s: ColumnOrderState) => ColumnOrderState)(p.order) : u })),
    onColumnSizingChange: (u) => setPrefs((p) => ({ ...p, sizing: typeof u === "function" ? (u as (s: ColumnSizingState) => ColumnSizingState)(p.sizing) : u })),
  });

  // The card's width, so the flexible column (Why, else the last) can take up any slack.
  const scroller = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const headers = [...table.getStartLeafHeaders(), ...table.getCenterLeafHeaders(), ...table.getEndLeafHeaders()];
  const visibleIds = headers.map((h) => h.column.id);
  const flexId = visibleIds.includes("why") ? "why" : visibleIds[visibleIds.length - 1];
  const total = headers.reduce((s, h) => s + h.getSize(), 0);
  const slack = Math.max(0, boxW - total);
  const widthOf = (c: Column<typeof features, DisplayRow, unknown>) => c.getSize() + (c.id === flexId ? slack : 0);
  const lastPinned = PINNED.start.filter((id) => visibleIds.includes(id)).at(-1);

  const pinStyle = (c: Column<typeof features, DisplayRow, unknown>): CSSProperties | undefined =>
    c.getIsPinned() === "start" ? { position: "sticky", insetInlineStart: c.getStart("start") } : undefined;

  // Keep the active row (the one in the drawer) in view as it steps.
  useEffect(() => {
    if (!activeId) return;
    scroller.current?.querySelector(`[data-row-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // Header drag to reorder (the Columns menu does the same by buttons).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const move = (id: string, to: string) => {
    if (id === to) return;
    table.setColumnOrder((order) => {
      const o = order.length ? [...order] : [...IDS];
      const rightwards = o.indexOf(id) < o.indexOf(to);
      o.splice(o.indexOf(id), 1);
      // Dropped on a column: take its place, pushing it away from where the dragged one came from.
      o.splice(o.indexOf(to) + (rightwards ? 1 : 0), 0, id);
      return o;
    });
  };

  const density = prefs.density;
  const compact = density === "compact";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={density} aria-label="Row density"
          onValueChange={(v) => v && setPrefs((p) => ({ ...p, density: v as Density }))}>
          <ToggleGroupItem value="comfortable" className="px-2.5 text-xs">Comfortable</ToggleGroupItem>
          <ToggleGroupItem value="compact" className="px-2.5 text-xs">Compact</ToggleGroupItem>
        </ToggleGroup>
        <ColumnsMenu prefs={prefs} setPrefs={setPrefs} />
      </div>

      <div ref={scroller} className="results-scroll panel">
        <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: Math.max(total, boxW) }} data-density={density}>
          <colgroup>
            {headers.map((h) => <col key={h.id} style={{ width: widthOf(h.column) }} />)}
          </colgroup>
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              {headers.map((h) => (
                <HeaderCell key={h.id} header={h} spec={SPEC[h.column.id]} sort={sort} onSort={onSort}
                  style={pinStyle(h.column)} edge={h.column.id === lastPinned}
                  dragging={dragId === h.column.id} dropTarget={dropId === h.column.id && dragId !== h.column.id}
                  onDragStart={() => setDragId(h.column.id)} onDragEnd={() => { setDragId(null); setDropId(null); }}
                  onDragOver={() => dragId && setDropId(h.column.id)}
                  onDrop={() => { if (dragId) move(dragId, h.column.id); setDragId(null); setDropId(null); }}>
                  {h.column.id === "select" ? <SelectAll visible={props.visibleIds} selected={props.selected} onChange={props.onSelectAll} /> : null}
                </HeaderCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const d = row.original;
              const r = d.r;
              const cells = [...row.getStartVisibleCells(), ...row.getCenterVisibleCells(), ...row.getEndVisibleCells()];
              const isOpen = props.open.has(r.id);
              return (
                <Fragment key={row.id}>
                  <tr data-row-id={r.id} className="rt-row group cursor-pointer scroll-mt-12 align-top"
                    data-alt={d.alt || undefined} data-selected={props.selected.has(r.id) || undefined} data-active={activeId === r.id || undefined}
                    onClick={() => props.onActivate(r.id)}>
                    {cells.map((cell) => (
                      <td key={cell.id} style={pinStyle(cell.column)}
                        className={cn("border-b", cell.column.getIsPinned() && "z-10", cell.column.id === lastPinned && "rt-edge",
                          SPEC[cell.column.id].numeric && "text-right")}>
                        <Cell id={cell.column.id} d={d} props={props} compact={compact} isOpen={isOpen} />
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr className="rt-detail">
                      <td colSpan={cells.length} className="border-b bg-muted/50 p-0">
                        {/* Pinned to the card's visible width, so it reads without scrolling sideways. */}
                        <div className="sticky left-0 px-4 py-3" style={{ width: boxW || undefined }}>{props.renderDetail(r)}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={headers.length} className="p-0">
                <div className="sticky left-0 px-4 py-10 text-center text-sm text-muted-foreground" style={{ width: boxW || undefined }}>{props.empty}</div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderCell({ header, spec, sort, onSort, style, edge, children, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop }: {
  header: Header<typeof features, DisplayRow, unknown>;
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
  const movable = !col.getIsPinned();
  const sorted = spec.sort && sort.key === spec.sort;
  const label = spec.header ?? spec.label;
  return (
    <th scope="col" style={style} title={spec.hint}
      aria-sort={sorted ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className={cn("group/th relative sticky top-0 border-b bg-card px-2 py-2 align-bottom leading-tight font-medium",
        col.getIsPinned() ? "z-30" : "z-20", edge && "rt-edge", spec.numeric && "text-right",
        dragging && "opacity-50", dropTarget && "shadow-[inset_2px_0_0_var(--brand)]")}
      draggable={movable} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", col.id); onDragStart(); }}
      onDragEnd={onDragEnd} onDragOver={(e) => { if (movable) { e.preventDefault(); onDragOver(); } }} onDrop={(e) => { e.preventDefault(); if (movable) onDrop(); }}>
      {children ?? (
        <span className={cn("flex items-end gap-0.5", spec.numeric && "justify-end")}>
          {movable && <GripVerticalIcon aria-hidden="true" className="mb-px size-3 flex-none cursor-grab text-muted-foreground/0 group-hover/th:text-muted-foreground/60" />}
          {spec.sort ? (
            <button type="button" className={cn("uppercase hover:text-foreground", spec.numeric ? "text-right tracking-normal" : "text-left tracking-wide", sorted && "text-foreground")}
              onClick={() => onSort(spec.sort!)}>
              {label}{sorted ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
            </button>
          ) : <span className="uppercase tracking-wide">{label}</span>}
        </span>
      )}
      {col.getCanResize() && (
        <div role="separator" aria-orientation="vertical" aria-label={`Resize ${spec.label}`}
          onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} onDoubleClick={() => col.resetSize()}
          onClick={(e) => e.stopPropagation()} draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className={cn("absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-brand/60", col.getIsResizing() && "bg-brand")} />
      )}
    </th>
  );
}

function Cell({ id, d, props, compact, isOpen }: { id: string; d: DisplayRow; props: ResultsTableProps; compact: boolean; isOpen: boolean }) {
  const { r, alt } = d;
  const pad = compact ? "px-2 py-1" : "px-2 py-2";
  const num = cn("num block overflow-hidden text-xs whitespace-nowrap text-ellipsis", pad);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  switch (id) {
    case "select": {
      const edge = r.status === "error" ? VERDICT_EDGE.fail : r.verdict ? VERDICT_EDGE[r.verdict] : "transparent";
      return (
        <div className={cn("flex items-center gap-0.5 pl-2.5", compact ? "h-full py-1" : "py-2")} style={{ boxShadow: `inset 3px 0 0 ${edge}` }} onClick={stop}>
          <Checkbox aria-label={`Select ${titleOf(r)}`} checked={props.selected.has(r.id)} onCheckedChange={() => props.onToggleSelect(r.id)} />
          <Button variant="ghost" size="icon-xs" aria-expanded={isOpen} aria-label={isOpen ? "Collapse details" : "Expand details"}
            className="text-muted-foreground" onClick={() => props.onToggleOpen(r.id)}>
            <ChevronRightIcon className={cn("transition-transform", isOpen && "rotate-90")} />
          </Button>
        </div>
      );
    }
    case "product":
      return (
        <div className={cn("flex min-w-0 gap-2.5", pad, alt && "pl-6")}>
          <ProductThumb url={r.product?.image_url} asin={r.product?.asin} title={titleOf(r)} brand={brandOf(r)} size={compact ? 28 : 40} />
          <div className="min-w-0 flex-1">
            <div className={cn("min-w-0 font-medium leading-snug break-words", compact ? "line-clamp-1" : "line-clamp-2")} title={titleOf(r)}>
              {alt ? "↳ " : ""}{titleOf(r)}
            </div>
            <div className="num truncate text-2xs text-muted-foreground">
              {r.product?.ean}
              {r.product?.asin && <> · <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${r.product.asin}`} target="_blank" rel="noreferrer" onClick={stop}>{r.product.asin}</a></>}
              {r.offer?.supplier && <> · {r.offer.supplier.name}{r.offer_count > 1 ? ` (+${r.offer_count - 1})` : ""}</>}
            </div>
            {props.scanSellerId && r.inputs?.market?.buyBoxSellerId != null && (
              r.inputs.market.buyBoxSellerId === props.scanSellerId
                ? <span className="mt-0.5 inline-block rounded bg-brand-soft px-1 text-2xs font-semibold text-brand" title="This seller holds the Buy Box now">Holds Buy Box</span>
                : <span className="mt-0.5 inline-block text-2xs text-muted-foreground" title={`Buy Box held by ${r.inputs.market.buyBoxSellerId}`}>Buy Box: another seller</span>
            )}
            {!alt && d.others > 0 && (
              <button className="text-xs font-medium text-brand hover:underline" onClick={(e) => { stop(e); props.onToggleGroup(d.groupKey); }}>
                {props.expandedGroups.has(d.groupKey) ? "▾ Hide" : "▸"} {d.others} other ASIN{d.others > 1 ? "s" : ""} for this EAN
              </button>
            )}
          </div>
        </div>
      );
    case "verdict":
      return (
        <div className={pad}>
          <div className="flex items-center gap-1.5">
            {r.product
              ? <span className="flex" onClick={stop}><FavouriteStar starred={props.favourites.has(favKey(r.product.ean, r.product.asin))} onToggle={() => props.onStar(r)} /></span>
              : <span className="w-4 flex-none" />}
            <VerdictBadge verdict={r.verdict} error={r.status === "error"} />
          </div>
          {dormantOf(r) && <Badge variant="muted" className="mt-1 ml-[22px]" title="Nobody sells this listing now; judged on its Keepa history">dormant</Badge>}
          {isWaived(r) && <Badge variant="brand" className="mt-1 ml-[22px]" title="A gate on this row is waived by you">waived</Badge>}
        </div>
      );
    case "score":
      return (
        <div className={pad}>
          {r.score != null && r.band
            ? <span className={cn("num inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-xs font-semibold", BAND_STYLE[r.band])}>{Math.round(r.score)}</span>
            : <span className="text-muted-foreground">—</span>}
        </div>
      );
    case "sales": return <FigureCell f={figure(r, "sales")} className={num} />;
    case "sellers": return <FigureCell f={figure(r, "sellers")} className={num} />;
    case "share": return <FigureCell f={figure(r, "share")} className={num} decimals />;
    case "orderQty":
    case "months": {
      if (r.score == null) return <span className={num}><span className="text-muted-foreground">—</span></span>;
      const f = firstOrderFigures(r.inputs?.market, r.landed_cost, listingMoq(r), props.lineCapGbp);
      if (id === "orderQty") {
        return (
          <span className={num} title={f.qty.note}>
            {f.qty.value == null ? <span className="text-muted-foreground">—</span> : f.qty.value.toLocaleString("en-GB")}
            {f.qty.moqOverCap && <span className="ml-1 rounded bg-warn-soft px-1 text-2xs font-semibold text-warn">MOQ</span>}
          </span>
        );
      }
      const v = f.months.value;
      return (
        <span className={cn(num, v != null && v > props.maxMonths && "text-fail")} title={f.months.note}>
          {v == null ? <span className="text-muted-foreground">—</span> : !Number.isFinite(v) ? "∞" : v.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
        </span>
      );
    }
    case "profitMo": {
      const f = figure(r, "profitMo");
      return <FigureCell f={f} className={cn(num, f.value != null && f.value < 0 && "text-fail")} money />;
    }
    case "buybox": return <FigureCell f={figure(r, "buybox")} className={num} money />;
    case "rank90":
    case "bb90": {
      const s = r.product?.asin ? props.sparks[r.product.asin] : undefined;
      const values = id === "rank90" ? s?.rank : s?.buyBox;
      return (
        <div ref={props.observeSparks(r.product?.asin)} className={cn("flex items-center", compact ? "px-2 py-1" : "px-2 py-2.5")}>
          {!r.product?.asin ? <span className="text-muted-foreground">—</span>
            : s === undefined ? <span className="h-[22px] w-20 animate-pulse rounded bg-muted" aria-label="Loading" />
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
    case "sell": return <span className={num}>{gbp(r.sell_price)}</span>;
    case "profit": return <span className={cn(num, r.profit != null && r.profit < 0 && "text-fail")}>{gbp(r.profit)}</span>;
    case "roi": return <span className={num}>{pct(r.roi)}</span>;
    case "margin": return <span className={num}>{pct(r.margin)}</span>;
    case "hurdle": return <span className={num}>{gbp(r.hurdle_price)}</span>;
    case "why":
      return (
        <div className={cn("text-xs leading-snug [overflow-wrap:anywhere]", pad)}>
          {/* Clamped to keep rows even; the full text is in the tooltip and the drawer. Links stay outside the clamp. */}
          <p className={compact ? "line-clamp-2" : "line-clamp-3"} title={(r.status === "error" ? r.error : r.why) ?? undefined}>{r.status === "error" ? r.error : r.why}</p>
          <span className="inline-block [&>a]:ml-0" onClick={stop}><RestrictionLink outcomes={r.gate_outcomes} asin={r.product?.asin} /></span>
        </div>
      );
    default: return null;
  }
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
    <div className="flex pl-2.5">
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

/** Show, hide and reorder columns; reset the layout. */
function ColumnsMenu({ prefs, setPrefs }: { prefs: TablePrefs; setPrefs: (f: (p: TablePrefs) => TablePrefs) => void }) {
  const order = prefs.order.length ? prefs.order : IDS;
  const movable = order.filter((id) => !PINNED.start.includes(id));
  const shift = (id: string, by: -1 | 1) => setPrefs((p) => {
    const o = [...(p.order.length ? p.order : IDS)];
    const list = o.filter((x) => !PINNED.start.includes(x));
    const i = list.indexOf(id), j = i + by;
    if (j < 0 || j >= list.length) return p;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...p, order: [...PINNED.start, ...list] };
  });
  const hidden = Object.values(prefs.visibility).filter((v) => v === false).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Columns3Icon /> Columns{hidden ? <span className="text-muted-foreground"> · {hidden} hidden</span> : null}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-2">
        <p className="eyebrow px-1.5 pb-1">Show and order columns</p>
        <ul className="max-h-[60vh] space-y-0.5 overflow-auto">
          {movable.map((id, i) => {
            const s = SPEC[id];
            const canHide = !s.fixed && id !== "product";
            return (
              <li key={id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                <Checkbox id={`col-${id}`} checked={prefs.visibility[id] !== false} disabled={!canHide}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, visibility: { ...p.visibility, [id]: !!v } }))} />
                <label htmlFor={`col-${id}`} className="min-w-0 flex-1 truncate text-sm">{s.label}</label>
                <Button variant="ghost" size="icon-xs" aria-label={`Move ${s.label} left`} disabled={i === 0} onClick={() => shift(id, -1)}><ArrowUpIcon /></Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Move ${s.label} right`} disabled={i === movable.length - 1} onClick={() => shift(id, 1)}><ArrowDownIcon /></Button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t px-1.5 pt-2">
          <span className="text-2xs text-muted-foreground">Drag headers to reorder; drag their edges to resize.</span>
          <Button variant="ghost" size="xs" onClick={() => setPrefs((p) => ({ ...normalizePrefs(null, IDS), density: p.density }))}>Reset</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
