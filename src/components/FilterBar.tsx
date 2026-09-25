"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

const VERDICT_STYLE: Record<Verdict, string> = {
  pass: "bg-pass-soft text-pass",
  warn: "bg-warn-soft text-warn",
  fail: "bg-fail-soft text-fail",
  error: "bg-fail-soft text-fail",
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

/** A dropdown panel that closes on a click outside it. */
function Popover({ label, active, children, wide = false }: { label: ReactNode; active: boolean; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className={`btn cursor-pointer list-none py-1 text-xs ${active ? "border-accent text-accent" : ""}`}>{label} ▾</summary>
      <div className={`absolute left-0 z-30 mt-1 rounded-md border border-line bg-surface p-2 shadow-lg ${wide ? "w-80" : "w-60"}`}>{children}</div>
    </details>
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
      {searchable && <input className="input mb-2 py-1 text-xs" placeholder={`Find ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="max-h-64 space-y-0.5 overflow-auto">
        {shown.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-surface-2">
            <input type="checkbox" checked={value.includes(o.id)} onChange={() => onChange(toggle(value, o.id))} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count != null && <span className="num text-muted">{o.count}</span>}
          </label>
        ))}
        {!shown.length && <p className="px-1 text-xs text-muted">Nothing to choose.</p>}
      </div>
      {value.length > 0 && <button className="mt-2 text-xs text-accent hover:underline" onClick={() => onChange([])}>Clear</button>}
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
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [setsNote, setSetsNote] = useState<string | null>(null);
  const set = (patch: Partial<FilterSet>) => onChange({ ...value, ...patch });
  const chips = activeChips(value, gateLabels);
  const rangeCount = RANGE_KEYS.filter((k) => value.ranges[k] && (value.ranges[k]!.min != null || value.ranges[k]!.max != null)).length;

  useEffect(() => {
    api<{ sets: SavedSet[]; unavailable?: string }>("/api/filter-sets")
      .then((r) => {
        setSets(r.sets);
        if (r.unavailable) setSetsNote(r.unavailable);
      })
      .catch(() => {});
  }, []);

  async function saveSet() {
    const name = prompt("Name this filter set");
    if (!name?.trim()) return;
    try {
      const r = await api<{ set: SavedSet }>("/api/filter-sets", { method: "POST", json: { name, filters: value } });
      setSets((s) => [...s.filter((x) => x.name !== r.set.name), r.set].sort((a, b) => a.name.localeCompare(b.name)));
      setSetsNote(`Saved “${r.set.name}”`);
    } catch (e) {
      setSetsNote((e as Error).message);
    }
  }

  async function deleteSet(s: SavedSet) {
    if (!confirm(`Delete the filter set “${s.name}”?`)) return;
    await api(`/api/filter-sets?id=${s.id}`, { method: "DELETE" }).catch(() => {});
    setSets((xs) => xs.filter((x) => x.id !== s.id));
  }

  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  return (
    <div className="card space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Verdict">
          {(["pass", "warn", "fail", "error"] as Verdict[]).filter((v) => v !== "error" || options.verdictCounts.error).map((v) => (
            <button key={v} onClick={() => set({ verdicts: toggle(value.verdicts, v) })} aria-pressed={value.verdicts.includes(v)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${value.verdicts.includes(v) ? `${VERDICT_STYLE[v]} ring-1 ring-current` : "bg-surface-2 text-muted"}`}>
              {v} {options.verdictCounts[v] ?? 0}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Band">
          {["green", "amber", "grey"].map((b) => (
            <button key={b} onClick={() => set({ bands: toggle(value.bands, b) })} aria-pressed={value.bands.includes(b)}
              className={`rounded-full px-2.5 py-1 text-xs ${value.bands.includes(b) ? "bg-accent-soft font-semibold text-accent ring-1 ring-accent" : "bg-surface-2 text-muted"}`}>
              {b}
            </button>
          ))}
        </div>
        <MultiSelect label="Failed gate" options={options.gates} value={value.gates} onChange={(gates) => set({ gates })} />
        <MultiSelect label="Brand" options={options.brands.map((b) => ({ id: b, label: b }))} value={value.brands} onChange={(brands) => set({ brands })} searchable />
        <select className={`input w-auto py-1 text-xs ${value.supplier ? "border-accent text-accent" : ""}`} value={value.supplier ?? ""} aria-label="Supplier"
          onChange={(e) => set({ supplier: e.target.value || null })}>
          <option value="">Any supplier</option>
          {options.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-md border border-line text-xs" role="group" aria-label="Amazon on listing">
          <span className="bg-surface-2 px-2 py-1 text-muted">Amazon on listing</span>
          {(["any", "yes", "no"] as const).map((a) => (
            <button key={a} onClick={() => set({ amazon: a })} aria-pressed={value.amazon === a}
              className={`border-l border-line px-2 py-1 ${value.amazon === a ? "bg-ink font-semibold text-surface" : ""}`}>{a}</button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Approval status">
          {(Object.keys(APPROVAL_LABELS) as Approval[]).map((a) => (
            <button key={a} onClick={() => set({ approval: toggle(value.approval, a) })} aria-pressed={value.approval.includes(a)}
              className={`rounded-full px-2.5 py-1 text-xs ${value.approval.includes(a) ? "bg-accent-soft font-semibold text-accent ring-1 ring-accent" : "bg-surface-2 text-muted"}`}>
              {APPROVAL_LABELS[a]}
            </button>
          ))}
        </div>
        {favouritesAvailable && (
          <label className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${value.favouritesOnly ? "bg-warn-soft font-semibold text-warn" : "bg-surface-2 text-muted"}`}>
            <input type="checkbox" className="sr-only" checked={value.favouritesOnly} onChange={(e) => set({ favouritesOnly: e.target.checked })} />
            ★ Favourites only
          </label>
        )}
        <button onClick={() => set({ waivedOnly: !value.waivedOnly })} aria-pressed={value.waivedOnly}
          className={`rounded-full px-2.5 py-1 text-xs ${value.waivedOnly ? "bg-accent-soft font-semibold text-accent ring-1 ring-accent" : "bg-surface-2 text-muted"}`}>
          Waived
        </button>
        <Popover label={<>Ranges{rangeCount ? ` (${rangeCount})` : ""}</>} active={rangeCount > 0} wide>
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-x-2 gap-y-1.5 text-xs">
            <span />
            <span className="text-muted">min</span>
            <span className="text-muted">max</span>
            {RANGE_KEYS.map((k) => {
              const r = value.ranges[k] ?? { min: null, max: null };
              return [
                <span key={`${k}-l`}>{RANGE_LABELS[k].label}{RANGE_LABELS[k].unit ? ` (${RANGE_LABELS[k].unit})` : ""}</span>,
                <input key={`${k}-min`} className="input num py-0.5 text-xs" type="number" step="any" value={r.min ?? ""} aria-label={`${RANGE_LABELS[k].label} minimum`}
                  onChange={(e) => set({ ranges: { ...value.ranges, [k]: { ...r, min: num(e.target.value) } } })} />,
                <input key={`${k}-max`} className="input num py-0.5 text-xs" type="number" step="any" value={r.max ?? ""} aria-label={`${RANGE_LABELS[k].label} maximum`}
                  onChange={(e) => set({ ranges: { ...value.ranges, [k]: { ...r, max: num(e.target.value) } } })} />,
              ];
            })}
          </div>
        </Popover>
        <input className="input w-56 py-1 text-xs" placeholder="Search name, brand, EAN, ASIN, why" value={value.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search" />
        <Popover label="Saved filters" active={false}>
          <div className="space-y-1">
            {sets.map((s) => (
              <div key={s.id} className="flex items-center gap-1 text-xs">
                <button className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left hover:bg-surface-2" onClick={() => onChange(normalizeFilters(s.filters))}>{s.name}</button>
                <button className="px-1 text-muted hover:text-fail" aria-label={`Delete ${s.name}`} onClick={() => deleteSet(s)}>×</button>
              </div>
            ))}
            {!sets.length && <p className="px-1 text-xs text-muted">No saved filter sets yet.</p>}
            <button className="btn mt-1 w-full py-1 text-xs" onClick={saveSet} disabled={!chips.length}>Save current filters…</button>
            {setsNote && <p className="px-1 text-xs text-muted">{setsNote}</p>}
          </div>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm">
          Showing <span className="num font-semibold">{matching}</span> of <span className="num">{total}</span> {unit}
        </span>
        {chips.map((c) => (
          <button key={c.id} onClick={() => onChange(c.remove(value))} aria-label={`Remove filter ${c.label}`}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent hover:ring-1 hover:ring-accent">
            {c.label} <span aria-hidden="true">×</span>
          </button>
        ))}
        {chips.length > 0 && <button className="text-xs text-muted hover:text-ink hover:underline" onClick={() => onChange(EMPTY_FILTERS)}>Clear all</button>}
      </div>
    </div>
  );
}
