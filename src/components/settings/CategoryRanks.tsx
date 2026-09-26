"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DEFAULT_RANK_BY_CATEGORY, TOP_CATEGORIES } from "@/lib/screening/categories";

/**
 * The Demand gate's rank ceiling per top-level category. Any category not listed uses the
 * profile-wide "Max 90-day average rank" (`fallback`).
 */
export function CategoryRanks({ value, fallback, onChange }: { value: Record<string, number>; fallback: number; onChange: (v: Record<string, number>) => void }) {
  const [adding, setAdding] = useState("");
  const rows = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const free = TOP_CATEGORIES.filter((c) => !(c in value));
  const set = (name: string, n: number) => onChange({ ...value, [name]: n });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="field-label">Max rank by category</p>
        <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => onChange({ ...DEFAULT_RANK_BY_CATEGORY })}>Reset to suggested</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Only for products with no sales figure: when sales are known, sales and your share decide and the rank is just shown. Keepa&apos;s top-level category (the one the rank is in); any other category uses the max above ({Number.isFinite(fallback) ? fallback.toLocaleString("en-GB") : "—"}).
      </p>
      {rows.length > 0 && (
        <ul className="grid max-w-md grid-cols-1 gap-y-1.5">
          {rows.map(([name, n]) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <Input className="num h-8 w-28" type="number" min={1} step={1000} aria-label={`Max rank for ${name}`}
                value={Number.isFinite(n) ? n : ""} onChange={(e) => set(name, e.target.value === "" ? NaN : Number(e.target.value))} />
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}
                onClick={() => { const next = { ...value }; delete next[name]; onChange(next); }}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 && (
        <div className="flex items-center gap-2">
          <NativeSelect className="h-8 w-56" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Category to add">
            <NativeSelectOption value="">Add a category…</NativeSelectOption>
            {free.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
          </NativeSelect>
          <Button variant="outline" size="sm" disabled={!adding} onClick={() => { set(adding, Number.isFinite(fallback) ? fallback : 50_000); setAdding(""); }}>
            <PlusIcon /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
