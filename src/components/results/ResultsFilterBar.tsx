"use client";

import { ChevronDownIcon, SearchIcon, SlidersHorizontalIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  activeChips, APPROVAL_LABELS, EMPTY_FILTERS, normalizeFilters, RANGE_LABELS, VERDICT_WORDS,
  type Approval, type FilterSet, type Range, type RangeKey, type Verdict,
} from "@/lib/filters";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { ChipRemove } from "@/components/ui/chip-toggle";

/** What the page can offer to filter by: its brands, suppliers and failed gates, and verdict counts. */
export interface FilterOptions {
  brands: string[];
  suppliers: string[];
  gates: { id: string; label: string; count: number }[];
  /** Left out (a server's pages): the chips show no counts. */
  verdictCounts?: Partial<Record<Verdict, number>>;
}

interface SavedSet { id: string; name: string; filters: FilterSet }

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const MAIN_VERDICTS: Verdict[] = ["pass", "warn", "fail", "unscored"];
const PILL = "h-8 rounded-full px-3 text-xs font-medium bg-subtle text-muted-foreground hover:bg-subtle hover:text-foreground";
const PRESSED: Record<Verdict | "brand", string> = {
  pass: "data-[state=on]:bg-success-soft data-[state=on]:text-success data-[state=on]:ring-1 data-[state=on]:ring-pass",
  warn: "data-[state=on]:bg-warn-soft data-[state=on]:text-warn-ink data-[state=on]:ring-1 data-[state=on]:ring-highlight",
  fail: "data-[state=on]:bg-danger-soft data-[state=on]:text-danger data-[state=on]:ring-1 data-[state=on]:ring-fail",
  unscored: "data-[state=on]:bg-neutral-soft data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-foreground/40",
  error: "data-[state=on]:bg-danger-soft data-[state=on]:text-danger data-[state=on]:ring-1 data-[state=on]:ring-fail",
  dormant: "data-[state=on]:bg-neutral-soft data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-foreground/40",
  brand: "data-[state=on]:bg-primary-soft data-[state=on]:text-primary-ink data-[state=on]:ring-1 data-[state=on]:ring-brand",
};
/** The four quick figures in the bar; the rest of the ranges are under More filters. */
const QUICK: { key: RangeKey; end: "min" | "max"; label: string; prefix?: string; suffix?: string }[] = [
  { key: "profit", end: "min", label: "Profit ≥", prefix: "£" },
  { key: "roi", end: "min", label: "ROI ≥", suffix: "%" },
  { key: "sales", end: "min", label: "Sales/mo ≥" },
  { key: "bsr", end: "max", label: "BSR ≤" },
];
const MORE_RANGES: RangeKey[] = ["sellers", "margin", "sell", "profit", "roi", "sales", "bsr"];

/** A number typed into a filter: kept as typed, committed a moment after the last key. */
function NumField({ value, onCommit, label, className, prefix, suffix }: {
  value: number | null; onCommit: (v: number | null) => void; label: string; className?: string; prefix?: string; suffix?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);
  // Follow the address (a chip removed, Clear all) unless you're typing in it.
  if (value !== lastValue) { setLastValue(value); if (!focused) setText(value == null ? "" : String(value)); }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (t: string) => {
    const n = t.trim() === "" || !Number.isFinite(Number(t)) ? null : Number(t);
    if (n !== value) onCommit(n);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      {prefix && <span className="pointer-events-none absolute left-2 text-xs text-muted-foreground">{prefix}</span>}
      <Input type="number" inputMode="decimal" step="any" aria-label={label} value={text}
        className={cn("num h-8 text-xs", prefix && "pl-5", suffix && "pr-6")}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { setFocused(false); if (timer.current) clearTimeout(timer.current); commit(e.target.value); }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(t), 450);
        }} />
      {suffix && <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

/** The search box: as you type, committed a moment after the last key. */
function SearchField({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) { setLastValue(value); setText(value); }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className="relative w-full sm:w-64">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="h-8 pl-8 text-sm" placeholder="ASIN, EAN, title or brand" aria-label="Search" value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onCommit(t), 300);
        }} />
    </div>
  );
}

function MultiSelect({ label, options, value, onChange, searchable = false }: {
  label: string;
  options: { id: string; label: string; count?: number }[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}{value.length ? ` (${value.length})` : ""}</p>
      {searchable && options.length > 8 && <Input className="h-7 text-xs" placeholder={`Find ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="max-h-40 space-y-0.5 overflow-auto rounded-md border p-1">
        {shown.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-subtle">
            <Checkbox checked={value.includes(o.id)} onCheckedChange={() => onChange(toggle(value, o.id))} aria-label={o.label} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count != null && <span className="num text-muted-foreground">{o.count}</span>}
          </label>
        ))}
        {!shown.length && <p className="px-1 py-0.5 text-xs text-muted-foreground">Nothing to choose.</p>}
      </div>
    </div>
  );
}

const YesNo = ({ label, value, onChange }: { label: string; value: "any" | "yes" | "no"; onChange: (v: "any" | "yes" | "no") => void }) => (
  <div className="flex items-center gap-1.5 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={value} aria-label={label}
      onValueChange={(a) => a && onChange(a as "any" | "yes" | "no")}>
      {(["any", "yes", "no"] as const).map((a) => (
        <ToggleGroupItem key={a} value={a} className="h-8 px-2.5 text-xs capitalize data-[state=on]:bg-primary-soft data-[state=on]:text-primary-ink">{a}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  </div>
);

/**
 * The filter bar above every results table: search, the verdict chips, profit, ROI, sales and BSR,
 * gated, supplier, and More filters for the rest (and saved filter sets). Its value lives in the
 * address (useUrlFilters). Under the controls: how many match, and a removable chip per filter.
 */
export function ResultsFilterBar({ value, onChange, options, matching, total, unit = "products", gateLabels, favouritesAvailable = false, count, extra }: {
  value: FilterSet;
  onChange: (f: FilterSet) => void;
  options: FilterOptions;
  /** "Showing n of m": left out on a server's pages, where `count` says what's shown instead. */
  matching?: number;
  total?: number;
  unit?: string;
  count?: ReactNode;
  gateLabels: Record<string, string>;
  /** The page has starred products that aren't all of it (a run, Products): offer "On Shortlist". */
  favouritesAvailable?: boolean;
  /** A page's own filter, after the others (Products: Bought). */
  extra?: ReactNode;
}) {
  const set = (patch: Partial<FilterSet>) => onChange({ ...value, ...patch });
  const setRange = (k: RangeKey, r: Range) => set({ ranges: { ...value.ranges, [k]: r.min == null && r.max == null ? undefined : r } });
  const chips = activeChips(value, gateLabels);
  const quickOn = QUICK.filter((x) => value.ranges[x.key]?.[x.end] != null).length + (value.gated !== "any" ? 1 : 0) + (value.supplier ? 1 : 0);
  const moreOn = chips.length - quickOn - value.verdicts.filter((v) => MAIN_VERDICTS.includes(v)).length - (value.q.trim() ? 1 : 0);
  // On a phone everything but the search and the verdict chips folds away behind "Filters".
  const [open, setOpen] = useState(false);

  return (
    <div className="panel space-y-2.5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={value.q} onCommit={(q) => set({ q })} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Verdict">
          {MAIN_VERDICTS.map((v) => (
            <Toggle key={v} size="sm" pressed={value.verdicts.includes(v)} onPressedChange={() => set({ verdicts: toggle(value.verdicts, v) })}
              className={cn(PILL, "font-semibold", PRESSED[v])}>
              {VERDICT_WORDS[v]}{options.verdictCounts && <span className="num">{options.verdictCounts[v] ?? 0}</span>}
            </Toggle>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="sm:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontalIcon /> {open ? "Hide filters" : `Filters${quickOn + moreOn ? ` (${quickOn + moreOn})` : ""}`}
        </Button>
        <div className={cn("w-full flex-wrap items-center gap-2 sm:flex sm:w-auto", open ? "flex" : "hidden")}>
          {QUICK.map((x) => (
            <label key={x.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">{x.label}</span>
              <NumField className="w-20" label={`${RANGE_LABELS[x.key].label} ${x.end === "min" ? "minimum" : "maximum"}`} prefix={x.prefix} suffix={x.suffix}
                value={value.ranges[x.key]?.[x.end] ?? null}
                onCommit={(v) => setRange(x.key, { ...(value.ranges[x.key] ?? { min: null, max: null }), [x.end]: v })} />
            </label>
          ))}
          <YesNo label="Gated" value={value.gated} onChange={(gated) => set({ gated })} />
          {options.suppliers.length > 0 && (
            <NativeSelect size="sm" className={cn("w-auto max-w-48", value.supplier && "[&_select]:border-primary [&_select]:text-link")} value={value.supplier ?? ""} aria-label="Supplier"
              onChange={(e) => set({ supplier: e.target.value || null })}>
              <NativeSelectOption value="">Any supplier</NativeSelectOption>
              {/* A supplier from the address that this page doesn't list still shows as chosen. */}
              {value.supplier && !options.suppliers.includes(value.supplier) && <NativeSelectOption value={value.supplier}>{value.supplier}</NativeSelectOption>}
              {options.suppliers.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
            </NativeSelect>
          )}
          {extra}
          <MoreFilters value={value} onChange={onChange} options={options} active={Math.max(0, moreOn)} favouritesAvailable={favouritesAvailable} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm" aria-live="polite">
          {count ?? <>Showing <span className="num font-semibold">{(matching ?? 0).toLocaleString("en-GB")}</span> of <span className="num">{(total ?? 0).toLocaleString("en-GB")}</span> {unit}</>}
        </span>
        {chips.map((c) => (
          <ChipRemove key={c.id} onClick={() => onChange(c.remove(value))} label={`Remove filter ${c.label}`}>{c.label}</ChipRemove>
        ))}
        {chips.length > 0 && <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange(EMPTY_FILTERS)}>Clear all</Button>}
      </div>
    </div>
  );
}

/** Everything else: error / dormant, band, failed gate, brand, Amazon, approval, starred, waived, the other ranges, saved sets. */
function MoreFilters({ value, onChange, options, active, favouritesAvailable }: {
  value: FilterSet; onChange: (f: FilterSet) => void; options: FilterOptions; active: number; favouritesAvailable: boolean;
}) {
  const set = (patch: Partial<FilterSet>) => onChange({ ...value, ...patch });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className={cn(active > 0 && "border-primary text-link")}>
          More filters{active > 0 ? ` (${active})` : ""} <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 overflow-auto">
        <div className="flex flex-wrap gap-1" role="group" aria-label="More verdicts">
          {(["error", "dormant"] as Verdict[]).filter((v) => v !== "error" || !options.verdictCounts || options.verdictCounts.error).map((v) => (
            <Toggle key={v} size="sm" pressed={value.verdicts.includes(v)} onPressedChange={() => set({ verdicts: toggle(value.verdicts, v) })} className={cn(PILL, "h-7", PRESSED[v])}>
              {VERDICT_WORDS[v]}{options.verdictCounts && <span className="num">{options.verdictCounts[v] ?? 0}</span>}
            </Toggle>
          ))}
          {["green", "amber", "grey"].map((b) => (
            <Toggle key={b} size="sm" pressed={value.bands.includes(b)} onPressedChange={() => set({ bands: toggle(value.bands, b) })} className={cn(PILL, "h-7 capitalize", PRESSED.brand)}>
              {b} band
            </Toggle>
          ))}
          {favouritesAvailable && (
            <Toggle size="sm" pressed={value.favouritesOnly} onPressedChange={(on) => set({ favouritesOnly: on })} className={cn(PILL, "h-7", PRESSED.brand)}>
              <StarIcon /> On Shortlist
            </Toggle>
          )}
          <Toggle size="sm" pressed={value.waivedOnly} onPressedChange={(on) => set({ waivedOnly: on })} className={cn(PILL, "h-7", PRESSED.brand)}>Waived</Toggle>
        </div>
        <YesNo label="Amazon on listing" value={value.amazon} onChange={(amazon) => set({ amazon })} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Approval status">
          {(Object.keys(APPROVAL_LABELS) as Approval[]).map((a) => (
            <Toggle key={a} size="sm" pressed={value.approval.includes(a)} onPressedChange={() => set({ approval: toggle(value.approval, a) })} className={cn(PILL, "h-7", PRESSED.brand)}>
              {APPROVAL_LABELS[a]}
            </Toggle>
          ))}
        </div>
        {options.gates.length > 0 && <MultiSelect label="Failed gate" options={options.gates} value={value.gates} onChange={(gates) => set({ gates })} />}
        {options.brands.length > 0 && <MultiSelect label="Brand" options={options.brands.map((b) => ({ id: b, label: b }))} value={value.brands} onChange={(brands) => set({ brands })} searchable />}
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="font-medium">Ranges</span>
          <span className="text-muted-foreground">min</span>
          <span className="text-muted-foreground">max</span>
          {MORE_RANGES.map((k) => {
            const r = value.ranges[k] ?? { min: null, max: null };
            return [
              <span key={`${k}-l`}>{RANGE_LABELS[k].label}{RANGE_LABELS[k].unit ? ` (${RANGE_LABELS[k].unit})` : ""}</span>,
              <NumField key={`${k}-min`} label={`${RANGE_LABELS[k].label} minimum`} value={r.min}
                onCommit={(min) => set({ ranges: { ...value.ranges, [k]: min == null && r.max == null ? undefined : { ...r, min } } })} />,
              <NumField key={`${k}-max`} label={`${RANGE_LABELS[k].label} maximum`} value={r.max}
                onCommit={(max) => set({ ranges: { ...value.ranges, [k]: max == null && r.min == null ? undefined : { ...r, max } } })} />,
            ];
          })}
        </div>
        <SavedSets value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/** Saved filter sets, shared by every results page. */
function SavedSets({ value, onChange }: { value: FilterSet; onChange: (f: FilterSet) => void }) {
  const { confirm, prompt } = useDialogs();
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    api<{ sets: SavedSet[]; unavailable?: string }>("/api/filter-sets")
      .then((r) => { setSets(r.sets); if (r.unavailable) setNote(r.unavailable); })
      .catch(() => {});
  }, []);
  async function save() {
    const name = await prompt({ title: "Save filter set", label: "Name", description: "Reapply it on any results page from More filters.", confirmLabel: "Save" });
    if (!name) return;
    try {
      const r = await api<{ set: SavedSet }>("/api/filter-sets", { method: "POST", json: { name, filters: value } });
      setSets((s) => [...s.filter((x) => x.name !== r.set.name), r.set].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Saved “${r.set.name}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(s: SavedSet) {
    if (!(await confirm({ title: `Delete “${s.name}”?`, description: "The filter set is removed for every page.", confirmLabel: "Delete", destructive: true }))) return;
    await api(`/api/filter-sets?id=${s.id}`, { method: "DELETE" }).catch(() => {});
    setSets((xs) => xs.filter((x) => x.id !== s.id));
  }
  return (
    <div className="space-y-1 border-t pt-2">
      <p className="text-xs font-medium">Saved filters</p>
      {sets.map((s) => (
        <div key={s.id} className="flex items-center gap-1 text-xs">
          <Button variant="ghost" size="xs" className="min-w-0 flex-1 justify-start truncate" onClick={() => onChange(normalizeFilters(s.filters))}>{s.name}</Button>
          <Button variant="ghost" size="icon-xs" className="text-danger" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2Icon /></Button>
        </div>
      ))}
      {!sets.length && <p className="text-xs text-muted-foreground">No saved filter sets yet.</p>}
      <Button variant="secondary" size="sm" className="w-full" onClick={save} disabled={!activeChips(value, {}).length}>Save current filters…</Button>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
