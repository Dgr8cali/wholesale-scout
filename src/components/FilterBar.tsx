"use client";

import { ChevronDownIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover as PopoverRoot, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  activeChips,
  APPROVAL_LABELS,
  EMPTY_FILTERS,
  normalizeFilters,
  RANGE_KEYS,
  RANGE_LABELS,
  type Approval,
  type FilterSet,
  type Verdict,
} from "@/lib/filters";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

/** Pill toggles: pressed state in the verdict's colour, or the brand colour. */
const PILL = "h-7 rounded-full px-3 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted hover:text-foreground";
const PRESSED: Record<Verdict | "brand" | "fav", string> = {
  pass: "data-[state=on]:bg-pass-soft data-[state=on]:text-pass data-[state=on]:ring-1 data-[state=on]:ring-pass",
  warn: "data-[state=on]:bg-warn-soft data-[state=on]:text-warn data-[state=on]:ring-1 data-[state=on]:ring-warn",
  fail: "data-[state=on]:bg-fail-soft data-[state=on]:text-fail data-[state=on]:ring-1 data-[state=on]:ring-fail",
  error: "data-[state=on]:bg-fail-soft data-[state=on]:text-fail data-[state=on]:ring-1 data-[state=on]:ring-fail",
  dormant: "data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-foreground/40",
  brand: "data-[state=on]:bg-brand-soft data-[state=on]:text-brand data-[state=on]:ring-1 data-[state=on]:ring-brand",
  fav: "data-[state=on]:bg-warn-soft data-[state=on]:text-warn data-[state=on]:ring-1 data-[state=on]:ring-warn",
};

export interface FilterOptions {
  brands: string[];
  suppliers: string[];
  gates: { id: string; label: string; count: number }[];
  verdictCounts: Partial<Record<Verdict, number>>;
}

interface SavedSet {
  id: string;
  name: string;
  filters: FilterSet;
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** A filter dropdown: an outline button that opens a panel. */
function Popover({ label, active, children, wide = false }: { label: ReactNode; active: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(active && "border-brand text-brand")}>
          {label} <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={wide ? "w-80" : "w-64"}>{children}</PopoverContent>
    </PopoverRoot>
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
    <Popover label={<>{label}{value.length ? ` (${value.length})` : ""}</>} active={value.length > 0}>
      {searchable && <Input className="h-7 text-xs" placeholder={`Find ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="max-h-64 space-y-0.5 overflow-auto">
        {shown.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted">
            <Checkbox checked={value.includes(o.id)} onCheckedChange={() => onChange(toggle(value, o.id))} aria-label={o.label} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count != null && <span className="num text-muted-foreground">{o.count}</span>}
          </label>
        ))}
        {!shown.length && <p className="px-1 text-xs text-muted-foreground">Nothing to choose.</p>}
      </div>
      {value.length > 0 && <Button variant="link" size="xs" className="h-auto self-start p-0 text-brand" onClick={() => onChange([])}>Clear</Button>}
    </Popover>
  );
}

export function FilterBar({ value, onChange, options, favouritesAvailable, matching, total, unit = "products", gateLabels }: {
  value: FilterSet;
  onChange: (f: FilterSet) => void;
  options: FilterOptions;
  favouritesAvailable: boolean;
  matching: number;
  total: number;
  unit?: string;
  gateLabels: Record<string, string>;
}) {
  const { confirm, prompt } = useDialogs();
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [setsNote, setSetsNote] = useState<string | null>(null);
  const set = (patch: Partial<FilterSet>) => onChange({ ...value, ...patch });
  const chips = activeChips(value, gateLabels);
  const rangeCount = RANGE_KEYS.filter((k) => value.ranges[k] && (value.ranges[k]!.min != null || value.ranges[k]!.max != null)).length;
  // On a phone the controls fold away behind "Filters"; the count and active chips stay in view.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    api<{ sets: SavedSet[]; unavailable?: string }>("/api/filter-sets")
      .then((r) => {
        setSets(r.sets);
        if (r.unavailable) setSetsNote(r.unavailable);
      })
      .catch(() => {});
  }, []);

  async function saveSet() {
    const name = await prompt({ title: "Save filter set", label: "Name", description: "Reapply it on any run from Saved filters.", confirmLabel: "Save" });
    if (!name) return;
    try {
      const r = await api<{ set: SavedSet }>("/api/filter-sets", { method: "POST", json: { name, filters: value } });
      setSets((s) => [...s.filter((x) => x.name !== r.set.name), r.set].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Saved “${r.set.name}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteSet(s: SavedSet) {
    if (!(await confirm({ title: `Delete “${s.name}”?`, description: "The filter set is removed for every run.", confirmLabel: "Delete", destructive: true }))) return;
    await api(`/api/filter-sets?id=${s.id}`, { method: "DELETE" }).catch(() => {});
    setSets((xs) => xs.filter((x) => x.id !== s.id));
  }

  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  return (
    <div className="panel space-y-3 p-3">
      <Button variant="outline" size="sm" className="sm:hidden" aria-expanded={shown} onClick={() => setShown((v) => !v)}>
        {shown ? "Hide filters" : `Filters${chips.length ? ` (${chips.length} on)` : ""}`}
      </Button>
      <div className={cn("flex-wrap items-center gap-2", shown ? "flex" : "hidden sm:flex")}>
        <div className="flex gap-1" role="group" aria-label="Verdict">
          {(["pass", "warn", "fail", "error", "dormant"] as Verdict[]).filter((v) => v !== "error" || options.verdictCounts.error).map((v) => (
            <Toggle key={v} size="sm" pressed={value.verdicts.includes(v)} onPressedChange={() => set({ verdicts: toggle(value.verdicts, v) })}
              className={cn(PILL, "font-semibold", PRESSED[v])}>
              {v} <span className="num">{options.verdictCounts[v] ?? 0}</span>
            </Toggle>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Band">
          {["green", "amber", "grey"].map((b) => (
            <Toggle key={b} size="sm" pressed={value.bands.includes(b)} onPressedChange={() => set({ bands: toggle(value.bands, b) })} className={cn(PILL, PRESSED.brand)}>
              {b}
            </Toggle>
          ))}
        </div>
        <MultiSelect label="Failed gate" options={options.gates} value={value.gates} onChange={(gates) => set({ gates })} />
        <MultiSelect label="Brand" options={options.brands.map((b) => ({ id: b, label: b }))} value={value.brands} onChange={(brands) => set({ brands })} searchable />
        <NativeSelect size="sm" className={cn("w-auto", value.supplier && "[&_select]:border-brand [&_select]:text-brand")} value={value.supplier ?? ""} aria-label="Supplier"
          onChange={(e) => set({ supplier: e.target.value || null })}>
          <NativeSelectOption value="">Any supplier</NativeSelectOption>
          {options.suppliers.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
        </NativeSelect>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Amazon on listing</span>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={value.amazon} aria-label="Amazon on listing"
            onValueChange={(a) => a && set({ amazon: a as FilterSet["amazon"] })}>
            {(["any", "yes", "no"] as const).map((a) => (
              <ToggleGroupItem key={a} value={a} aria-label={a} className="px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background">{a}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex gap-1" role="group" aria-label="Approval status">
          {(Object.keys(APPROVAL_LABELS) as Approval[]).map((a) => (
            <Toggle key={a} size="sm" pressed={value.approval.includes(a)} onPressedChange={() => set({ approval: toggle(value.approval, a) })} className={cn(PILL, PRESSED.brand)}>
              {APPROVAL_LABELS[a]}
            </Toggle>
          ))}
        </div>
        {favouritesAvailable && (
          <Toggle size="sm" pressed={value.favouritesOnly} onPressedChange={(on) => set({ favouritesOnly: on })} className={cn(PILL, PRESSED.fav)}>
            <StarIcon /> Favourites only
          </Toggle>
        )}
        <Toggle size="sm" pressed={value.waivedOnly} onPressedChange={(on) => set({ waivedOnly: on })} className={cn(PILL, PRESSED.brand)}>
          Waived
        </Toggle>
        <Popover label={<>Ranges{rangeCount ? ` (${rangeCount})` : ""}</>} active={rangeCount > 0} wide>
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-x-2 gap-y-1.5 text-xs">
            <span />
            <span className="text-muted-foreground">min</span>
            <span className="text-muted-foreground">max</span>
            {RANGE_KEYS.map((k) => {
              const r = value.ranges[k] ?? { min: null, max: null };
              return [
                <span key={`${k}-l`}>{RANGE_LABELS[k].label}{RANGE_LABELS[k].unit ? ` (${RANGE_LABELS[k].unit})` : ""}</span>,
                <Input key={`${k}-min`} className="h-7 text-xs num" type="number" step="any" value={r.min ?? ""} aria-label={`${RANGE_LABELS[k].label} minimum`}
                  onChange={(e) => set({ ranges: { ...value.ranges, [k]: { ...r, min: num(e.target.value) } } })} />,
                <Input key={`${k}-max`} className="h-7 text-xs num" type="number" step="any" value={r.max ?? ""} aria-label={`${RANGE_LABELS[k].label} maximum`}
                  onChange={(e) => set({ ranges: { ...value.ranges, [k]: { ...r, max: num(e.target.value) } } })} />,
              ];
            })}
          </div>
        </Popover>
        <Input className="h-7 w-full text-xs sm:w-56" placeholder="Search name, brand, EAN, ASIN, why" value={value.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search" />
        <Popover label="Saved filters" active={false}>
          <div className="space-y-1">
            {sets.map((s) => (
              <div key={s.id} className="flex items-center gap-1 text-xs">
                <Button variant="ghost" size="xs" className="min-w-0 flex-1 justify-start truncate" onClick={() => onChange(normalizeFilters(s.filters))}>{s.name}</Button>
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-fail" aria-label={`Delete ${s.name}`} onClick={() => deleteSet(s)}><Trash2Icon /></Button>
              </div>
            ))}
            {!sets.length && <p className="px-1 text-xs text-muted-foreground">No saved filter sets yet.</p>}
            <Button variant="outline" size="sm" className="w-full" onClick={saveSet} disabled={!chips.length}>Save current filters…</Button>
            {setsNote && <p className="px-1 text-xs text-muted-foreground">{setsNote}</p>}
          </div>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm">
          Showing <span className="num font-semibold">{matching}</span> of <span className="num">{total}</span> {unit}
        </span>
        {chips.map((c) => (
          <Badge key={c.id} variant="brand" asChild>
            <button onClick={() => onChange(c.remove(value))} aria-label={`Remove filter ${c.label}`} className="cursor-pointer hover:ring-1 hover:ring-brand">
              {c.label} <XIcon aria-hidden="true" />
            </button>
          </Badge>
        ))}
        {chips.length > 0 && <Button variant="link" size="xs" className="text-muted-foreground" onClick={() => onChange(EMPTY_FILTERS)}>Clear all</Button>}
      </div>
    </div>
  );
}
