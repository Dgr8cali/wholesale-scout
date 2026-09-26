"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { overrideTitle, validCost, type CostInput, type CostOverride, type VatBasis } from "@/lib/costOverride";

/**
 * Set your own cost for a product (one row, or every selected row's product): a landed cost, or a
 * supplier price and its VAT basis, with a supplier name and note. The parent saves it.
 */
export function CostOverrideDialog({ open, onOpenChange, count = 1, initial, onSave, onClear, title, hint }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rows it applies to (the bulk bar). */
  count?: number;
  initial?: CostOverride | null;
  onSave: (cost: CostInput) => Promise<void>;
  /** Offered when there's an override to clear. */
  onClear?: () => Promise<void>;
  /** In place of "Set your cost" (the planner names the product). */
  title?: string;
  /** A line under the description, e.g. the most it can cost landed. */
  hint?: string;
}) {
  const [mode, setMode] = useState<"landed" | "price">(initial?.priceGbp != null ? "price" : "landed");
  const [amount, setAmount] = useState(initial ? String(initial.landedGbp ?? initial.priceGbp ?? "") : "");
  const [basis, setBasis] = useState<VatBasis>(initial?.vatBasis ?? "ex_vat");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [moq, setMoq] = useState(initial?.moq != null ? String(initial.moq) : "");
  const [mov, setMov] = useState(initial?.movGbp != null ? String(initial.movGbp) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = (): CostInput => {
    const v = amount.trim() === "" ? NaN : Number(amount.replace(/[£,\s]/g, ""));
    const opt = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[£,\s]/g, "")));
    return {
      ...(mode === "landed" ? { landedGbp: v } : { priceGbp: v, vatBasis: basis }), supplierName: supplier.trim() || null, note: note.trim() || null,
      moq: opt(moq), movGbp: opt(mov),
    };
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const c = cost();
    const bad = validCost(c);
    if (bad) return setError(bad);
    void run(() => onSave(c));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title ?? (count > 1 ? `Set cost for ${count} rows` : "Set your cost")}</DialogTitle>
          <DialogDescription>
            Kept for the product in every run and re-screen, as an offer from the Manual supplier. It competes with the sheet&apos;s price; the cheaper is scored.
            {hint && <span className="mt-1 block font-medium text-foreground">{hint}</span>}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <NativeSelect size="sm" value={mode} onChange={(e) => setMode(e.target.value as "landed" | "price")} aria-label="Cost type">
              <NativeSelectOption value="landed">Landed cost per unit</NativeSelectOption>
              <NativeSelectOption value="price">Supplier price per unit</NativeSelectOption>
            </NativeSelect>
            <Input autoFocus inputMode="decimal" placeholder="£" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Cost per unit (£)" />
          </div>
          {mode === "price" ? (
            <NativeSelect size="sm" value={basis} onChange={(e) => setBasis(e.target.value as VatBasis)} aria-label="VAT basis">
              <NativeSelectOption value="ex_vat">Price excludes VAT</NativeSelectOption>
              <NativeSelectOption value="inc_vat">Price includes VAT (20%)</NativeSelectOption>
            </NativeSelect>
          ) : (
            <p className="text-xs text-muted-foreground">Everything to get one unit to Amazon: goods, VAT you can&apos;t reclaim, duty, prep and inbound.</p>
          )}
          <Input placeholder="Supplier (optional)" maxLength={120} value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier name" />
          <Input placeholder="Note (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Cost note" />
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="numeric" placeholder="MOQ (optional, units)" value={moq} onChange={(e) => setMoq(e.target.value)} aria-label="Minimum order quantity" />
            <Input inputMode="decimal" placeholder="MOV (optional, £)" value={mov} onChange={(e) => setMov(e.target.value)} aria-label="Minimum order value (£)" />
          </div>
          {error && <p className="text-xs text-fail">{error}</p>}
          <DialogFooter className="gap-2">
            {onClear && <Button type="button" variant="outline" className="mr-auto text-fail hover:text-fail" disabled={busy} onClick={() => run(onClear)}>Clear override</Button>}
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save cost"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** In a row's details: "Set your cost", or the override (original on hover) with Edit and Clear. */
export function CostOverrideControl({ override, onSet, onClear }: {
  override: CostOverride | null | undefined;
  onSet: (cost: CostInput) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const clear = async (e: React.MouseEvent) => {
    stop(e);
    setClearing(true);
    setError(null);
    try { await onClear(); } catch (x) { setError((x as Error).message); } finally { setClearing(false); }
  };
  return (
    <p className="mt-1 text-xs">
      {override ? (
        <>
          {override.active
            ? <span className="cursor-help rounded bg-brand-soft px-1 font-semibold text-brand" title={overrideTitle(override)}>cost overridden</span>
            : <span className="cursor-help text-muted-foreground" title={overrideTitle(override)}>Your cost isn&apos;t cheaper than the sheet&apos;s; the sheet&apos;s is scored</span>}
          {override.supplier && <span className="text-muted-foreground"> · {override.supplier}</span>}
          <button type="button" className="ml-2 font-medium text-brand hover:underline" onClick={(e) => { stop(e); setOpen(true); }}>Edit</button>
          <button type="button" className="ml-2 font-medium text-brand hover:underline disabled:opacity-50" disabled={clearing} onClick={clear}>{clearing ? "Clearing…" : "Clear"}</button>
        </>
      ) : (
        <button type="button" className="font-medium text-brand hover:underline" title="Your own cost for this product: it competes with the sheet's price in every run" onClick={(e) => { stop(e); setOpen(true); }}>
          Set your cost
        </button>
      )}
      {error && <span className="ml-2 text-fail">{error}</span>}
      {open && <CostOverrideDialog open={open} onOpenChange={setOpen} initial={override} onSave={onSet} onClear={override ? onClear : undefined} />}
    </p>
  );
}
