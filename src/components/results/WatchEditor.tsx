"use client";

import { EyeIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CONDITION_KINDS, CONDITION_LABELS, conditionLabel, needsValue, suggestCondition, type ConditionKind, type WatchCondition } from "@/lib/watch";
import type { Fav, Result } from "./types";

/**
 * Put a row on the watchlist with a flip condition, suggested from what blocked it and
 * editable; or change the condition of one already watched.
 */
export function WatchEditor({ r, fav, onWatch }: { r: Result; fav?: Fav; onWatch: (r: Result, condition: WatchCondition | null, noSupplier: boolean) => Promise<void> }) {
  const suggested = suggestCondition({
    failed_gate: r.failed_gate, gate_outcomes: r.gate_outcomes, hurdle_price: r.hurdle_price, landed_cost: r.landed_cost,
    inputs: r.inputs as never, offer: r.offer ? { stock: r.offer.stock, cost_known: r.offer.cost_known } : null,
  });
  const start = fav ? fav.condition ?? null : suggested;
  const [kind, setKind] = useState<ConditionKind | "">(start?.kind ?? "");
  const [value, setValue] = useState(start?.value != null ? String(start.value) : "");
  const [noSupplier, setNoSupplier] = useState(fav?.no_supplier ?? r.offer?.cost_known === false);
  const [busy, setBusy] = useState(false);
  const condition: WatchCondition | null = kind ? { kind, ...(needsValue(kind) ? { value: Number(value) } : {}) } : null;
  const valid = !kind || !needsValue(kind) || Number(value) > 0;
  const changed = !fav || JSON.stringify(fav.condition ?? null) !== JSON.stringify(condition) || !!fav.no_supplier !== noSupplier;

  async function save() {
    setBusy(true);
    try {
      await onWatch(r, condition, noSupplier);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">
        Watchlist{fav ? `: ${conditionLabel(fav.condition)}` : suggested ? ` · suggested: ${conditionLabel(suggested)}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <NativeSelect size="sm" className="w-48" value={kind} aria-label="Flip condition"
          onChange={(e) => {
            const k = e.target.value as ConditionKind | "";
            setKind(k);
            if (k && k === suggested?.kind && suggested.value != null) setValue(String(suggested.value));
          }}>
          <NativeSelectOption value="">Re-check weekly</NativeSelectOption>
          {CONDITION_KINDS.map((k) => <NativeSelectOption key={k} value={k}>{CONDITION_LABELS[k]}</NativeSelectOption>)}
        </NativeSelect>
        {kind && needsValue(kind) && (
          <Input className="num h-7 w-20" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
            aria-label={kind === "sellers" ? "Sellers" : "Amount, £"} placeholder={kind === "sellers" ? "N" : "£"} />
        )}
        <label className="flex items-center gap-1.5">
          <Checkbox checked={noSupplier} onCheckedChange={(v) => setNoSupplier(!!v)} aria-label="No supplier yet" />
          No supplier yet
        </label>
        <Button size="sm" variant={fav ? "outline" : "default"} disabled={busy || !valid || !changed} onClick={save}>
          <EyeIcon /> {fav ? "Save" : "Watch"}
        </Button>
      </div>
      {noSupplier && <p className="text-muted-foreground">Any upload or Qogita pull offering this EAN at or under its max landed cost alerts at once.</p>}
    </div>
  );
}
