"use client";

import { CheckIcon, ClipboardCopyIcon, ExternalLinkIcon, FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  CURRENCIES, DEFAULT_FX, QUOTE_SOURCES, QUOTE_STATUSES, landedCost, landedInputs, priceMultiple, rfqText,
  type LandedInputs, type Quote,
} from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const TARIFF_URL = "https://www.trade-tariff.service.gov.uk/find_commodity";
const MULT_CLS = { pass: "bg-pass-soft text-pass", warn: "bg-warn-soft text-warn", fail: "bg-fail-soft text-fail" } as const;

export interface QuotesCandidate {
  id: string; name: string; niche_keyword: string | null; category: string;
  /** Gate 0's sell price and the fields the RFQ reads (six words, size, weight). */
  sell: number | null; fields: Record<string, { value: string } | undefined>;
}

/** A candidate's supplier quotes side by side, each with its landed cost, and the RFQ to send. */
export function QuotesSection({ c, quotes, chosenQuote, onChanged, onFieldsChanged }: {
  c: QuotesCandidate; quotes: Quote[]; chosenQuote: string | null;
  /** Reload the quotes (and the chosen landed cost). */
  onChanged: () => void;
  /** A quote wrote into the gates: reload the candidate's fields. */
  onFieldsChanged: () => void;
}) {
  const [rfq, setRfq] = useState(false);
  const add = async () => {
    try {
      await api(`/api/pl/candidates/${c.id}/quotes`, { method: "POST", json: { supplier_name: `Supplier ${quotes.length + 1}`, status: "requested" } });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const f = (k: string) => c.fields[k]?.value ?? null;
  const dims = [f("dimL"), f("dimW"), f("dimH")].every(Boolean) ? `${f("dimL")} × ${f("dimW")} × ${f("dimH")}` : null;
  const text = rfqText({ name: c.name, nicheKeyword: c.niche_keyword, category: c.category, differentiator: f("sixWordsText"), sizeCm: dims, weightG: f("weight") ? Number(f("weight")) : null });
  return (
    <section className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-3xl">
          <h2 className="font-heading text-base font-bold">Quotes</h2>
          <p className="text-sm text-muted-foreground">Each supplier&apos;s quote turned into a landed cost per unit and the cash the first order needs. Gatekeeper&apos;s price multiple (sell ÷ landed) passes at 3.5× and warns from 3×. Write the one you trust into Gate 0 and Gate 7; a value you typed yourself stays.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRfq((v) => !v)}><FileTextIcon /> RFQ text</Button>
        <Button size="sm" onClick={add}><PlusIcon /> Add quote</Button>
      </div>
      {rfq && <RfqPanel text={text} hasSix={!!f("sixWordsText")} />}
      {!quotes.length ? <p className="text-sm text-muted-foreground">No quotes yet. Send the RFQ to three suppliers, then add each quote as it comes in.</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quotes.map((q) => <QuoteCard key={q.id} q={q} sell={c.sell} chosen={chosenQuote === q.id} others={quotes.length - 1} onChanged={onChanged} onFieldsChanged={onFieldsChanged} />)}
        </div>
      )}
    </section>
  );
}

function RfqPanel({ text, hasSix }: { text: string; hasSix: boolean }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("RFQ copied"); } catch { toast.error("Couldn't copy: select the text and copy it"); }
  };
  return (
    <div className="space-y-2 rounded-lg border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Supplier enquiry</span>
        {!hasSix && <span className="text-xs text-warn">Gate 4&apos;s &quot;The six words&quot; is empty: fill it so suppliers quote the differentiated product.</span>}
        <Button size="xs" variant="outline" className="ml-auto" onClick={copy}><ClipboardCopyIcon /> Copy</Button>
      </div>
      <textarea readOnly value={text} className="h-72 w-full resize-y rounded-md border bg-background p-2 font-mono text-xs" aria-label="RFQ text" />
    </div>
  );
}

type Draft = Omit<Quote, "calc"> & { calc: Partial<LandedInputs> };

function QuoteCard({ q, sell, chosen, others, onChanged, onFieldsChanged }: { q: Quote; sell: number | null; chosen: boolean; others: number; onChanged: () => void; onFieldsChanged: () => void }) {
  const [d, setD] = useState<Draft>({ ...q, calc: q.calc ?? {} });
  const [rejectOthers, setRejectOthers] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm } = useDialogs();
  /** Shown at once, saved shortly after you stop typing. */
  const set = (patch: Partial<Draft>) => {
    const next = { ...d, ...patch, calc: { ...d.calc, ...(patch.calc ?? {}) } };
    setD(next);
    if (timer.current) clearTimeout(timer.current);
    const body = patch.calc ? { calc: next.calc } : patch;
    timer.current = setTimeout(() => { api(`/api/pl/quotes/${q.id}`, { method: "PATCH", json: body }).catch((e) => toast.error(`Not saved: ${(e as Error).message}`)); }, 500);
  };
  const i = landedInputs(d);
  const l = landedCost(d);
  const m = priceMultiple(sell, l?.perUnit ?? null);
  const apply = async (to: "gate0" | "gate7") => {
    try {
      if (timer.current) { clearTimeout(timer.current); await api(`/api/pl/quotes/${q.id}`, { method: "PATCH", json: { ...d } }); }
      const r = await api<{ written: string[]; kept: string[]; perUnit: number; total: number; units: number }>(`/api/pl/quotes/${q.id}/apply`, { method: "POST", json: { to } });
      if (r.written.length) toast.success(to === "gate0" ? `Gate 0 landed cost: ${gbp(r.perUnit)}` : `Gate 7 first order: ${r.units} units, stock line ${gbp(r.total)}`);
      if (r.kept.length) toast.message(`Kept your own ${r.kept.map((k) => (k === "landed" ? "landed cost" : k)).join(" and ")}: clear it in the gate to use the quote's`);
      onFieldsChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const choose = async () => {
    try {
      if (timer.current) { clearTimeout(timer.current); await api(`/api/pl/quotes/${q.id}`, { method: "PATCH", json: { ...d } }); }
      await api(`/api/pl/quotes/${q.id}/choose`, { method: "POST", json: { rejectOthers } });
      toast.success(`${d.supplier_name} chosen${rejectOthers && others ? `, the other${others === 1 ? "" : "s"} rejected` : ""}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete the quote from ${d.supplier_name}?`, confirmLabel: "Delete", destructive: true }))) return;
    await api(`/api/pl/quotes/${q.id}`, { method: "DELETE" });
    onChanged();
  };
  const field = (label: string, el: React.ReactNode, hint?: React.ReactNode) => (
    <label className="block space-y-0.5"><span className="field-label">{label}</span>{el}{hint && <span className="block text-2xs text-muted-foreground">{hint}</span>}</label>
  );

  return (
    <div className={cn("space-y-3 rounded-lg border p-3", chosen && "border-pass ring-1 ring-pass/40", d.status === "rejected" && "opacity-70")}>
      <div className="flex items-center gap-2">
        <Input className="h-8 font-medium" value={d.supplier_name} onChange={(e) => set({ supplier_name: e.target.value })} aria-label="Supplier" />
        {chosen && <span className="rounded-full bg-pass-soft px-2 py-0.5 text-xs font-semibold text-pass">Chosen</span>}
        <button type="button" onClick={remove} aria-label="Delete quote"><Trash2Icon className="size-4 text-muted-foreground hover:text-fail" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("Source", <NativeSelect className="h-8 w-full" value={d.source} onChange={(e) => set({ source: e.target.value as Quote["source"] })}>{QUOTE_SOURCES.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}</NativeSelect>)}
        {field("Status", <NativeSelect className="h-8 w-full" value={d.status} onChange={(e) => set({ status: e.target.value as Quote["status"] })}>{QUOTE_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}</NativeSelect>)}
        <div className="col-span-2">{field("Contact (URL or email)", <Input className="h-8" value={d.contact ?? ""} onChange={(e) => set({ contact: e.target.value })} />, d.contact && /^https?:\/\//.test(d.contact) ? <a className="inline-flex items-center gap-1 text-brand hover:underline" href={d.contact} target="_blank" rel="noreferrer">Open <ExternalLinkIcon className="size-3" /></a> : null)}</div>
        {field("Unit price (ex-works)", <div className="flex gap-1">{<NumIn value={d.unit_price} onChange={(v) => set({ unit_price: v })} step="0.01" />}
          <NativeSelect className="h-8 w-24 shrink-0" value={d.currency} onChange={(e) => set({ currency: e.target.value as Quote["currency"], calc: { fx: DEFAULT_FX[e.target.value as Quote["currency"]] } })}>{CURRENCIES.map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}</NativeSelect></div>)}
        {field("MOQ", <NumIn value={d.moq} onChange={(v) => set({ moq: v })} step="1" />)}
        {field("Lead time (days)", <NumIn value={d.lead_time_days} onChange={(v) => set({ lead_time_days: v })} step="1" />)}
        {field(`Sample cost (${d.currency})`, <NumIn value={d.sample_cost} onChange={(v) => set({ sample_cost: v })} step="0.01" />)}
        {field("Sample lead (days)", <NumIn value={d.sample_lead_days} onChange={(v) => set({ sample_lead_days: v })} step="1" />)}
        <div className="col-span-2">{field("Notes", <Input className="h-8" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />)}</div>
      </div>

      <div className="space-y-2 rounded-md bg-surface-2 p-2.5">
        <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Landed cost</div>
        <div className="grid grid-cols-2 gap-2">
          {field("Units ordered", <NumIn value={d.calc.units ?? null} onChange={(v) => set({ calc: { units: v ?? undefined } })} step="1" />, `Default: the MOQ (${d.moq ?? "—"})`)}
          {field(`FX: ${d.currency} per £1`, <NumIn value={d.calc.fx ?? null} onChange={(v) => set({ calc: { fx: v ?? undefined } })} step="0.01" />, <>Default {DEFAULT_FX[d.currency]}: check today&apos;s rate on <a className="text-brand hover:underline" href={`https://www.xe.com/currencyconverter/convert/?Amount=1&From=GBP&To=${d.currency}`} target="_blank" rel="noreferrer">xe.com</a></>)}
          {field("Freight to the UK (£, total)", <NumIn value={d.calc.freight ?? null} onChange={(v) => set({ calc: { freight: v ?? undefined } })} step="1" />)}
          {field("Duty (%)", <NumIn value={d.calc.dutyPct ?? null} onChange={(v) => set({ calc: { dutyPct: v ?? undefined } })} step="0.1" />, <>On goods + freight. The rate for the commodity code: <a className="text-brand hover:underline" href={TARIFF_URL} target="_blank" rel="noreferrer">UK Trade Tariff</a></>)}
          {field("Inspection (£)", <NumIn value={d.calc.inspection ?? null} onChange={(v) => set({ calc: { inspection: v ?? undefined } })} step="1" />)}
          {field("Other (£)", <NumIn value={d.calc.other ?? null} onChange={(v) => set({ calc: { other: v ?? undefined } })} step="1" />)}
        </div>
        <label className="flex items-start gap-2 text-xs"><Switch checked={i.vat} onCheckedChange={(v) => set({ calc: { vat: v } })} aria-label="Import VAT as a cost" />
          <span>Import VAT 20% on goods + freight + duty, as a cost. Not VAT-registered: it&apos;s a cost. Registered: you reclaim it, so turn this off (or read &quot;ex VAT&quot; below).</span></label>
        {!l ? <p className="text-xs text-muted-foreground">Enter the unit price and units to see the landed cost.</p> : (
          <div className="space-y-1 text-sm">
            <div className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
              <span>Goods</span><span className="num text-right">{gbp(l.goods)}</span>
              <span>Freight</span><span className="num text-right">{gbp(l.freight)}</span>
              <span>Duty</span><span className="num text-right">{gbp(l.duty)}</span>
              <span>Import VAT</span><span className="num text-right">{gbp(l.vat)}</span>
              {l.inspection > 0 && <><span>Inspection</span><span className="num text-right">{gbp(l.inspection)}</span></>}
              {l.other > 0 && <><span>Other</span><span className="num text-right">{gbp(l.other)}</span></>}
            </div>
            <div className="flex items-baseline justify-between border-t pt-1"><span>Total cash required</span><b className="num">{gbp(l.total)}</b></div>
            <div className="flex items-baseline justify-between"><span>Landed cost per unit</span><b className="num text-base">{gbp(l.perUnit)}</b></div>
            {l.vat > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>Per unit ex import VAT (once registered)</span><span className="num">{gbp(l.perUnitExVat)}</span></div>}
            <div className="flex items-center justify-between">
              <span>Price multiple{sell ? ` (sell ${gbp(sell)} ÷ landed)` : ""}</span>
              {m ? <span className={cn("num rounded-full px-2 py-0.5 text-xs font-semibold", MULT_CLS[m.status])}>{m.multiple.toFixed(2)}×</span> : <span className="text-xs text-muted-foreground">needs Gate 0&apos;s sell price</span>}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="outline" disabled={!l} onClick={() => apply("gate0")} title="Writes the landed cost per unit into Gate 0 (a value you typed stays)">Gate 0 landed cost ← this quote</Button>
        <Button size="xs" variant="outline" disabled={!l} onClick={() => apply("gate7")} title="Writes the units ordered (and the landed cost) into Gate 7: its stock line becomes this order's total cash">Gate 7 first order ← this quote</Button>
      </div>
      {!chosen && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <Button size="xs" onClick={choose}><CheckIcon /> Choose this quote</Button>
          {others > 0 && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={rejectOthers} onChange={(e) => setRejectOthers(e.target.checked)} /> mark the others rejected</label>}
        </div>
      )}
    </div>
  );
}

function NumIn({ value, onChange, step = "any" }: { value: number | null | undefined; onChange: (v: number | null) => void; step?: string }) {
  return <Input className="num h-8" type="number" step={step} min={0} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
}
