"use client";

import { ExternalLinkIcon, StarIcon, TrophyIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RateCard } from "@/lib/fees/rateCard";
import { econ, type Settings } from "@/lib/pl/gatekeeper";
import {
  EXTRAS, FREIGHT_MODES, arrival, freightGbp, usedFreight, bestOf, exwTotal, landedCost, landedInputs, priceMultiple, sampleAverage, sampleStatusOf,
  type Quote, type QuoteLabels, type SampleScores,
} from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { valuesOf, type FieldMap } from "./types";

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const money = (v: number | null | undefined, cur: string) => (v == null ? "—" : v.toLocaleString("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 2 }));
const n0 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-GB"));
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const MULT_TONE: Record<"pass" | "warn" | "fail", Tone> = { pass: "good", warn: "warn", fail: "bad" };
const STATUS_TONE: Record<string, Tone> = { chosen: "good", rejected: "bad", requested: "neutral", received: "info", "samples ordered": "warn", "samples received": "info" };
/** "Tina - Shenzhen Benliju Bio-Tech Co., Ltd." → "Tina", for the phone's switch. */
const shortName = (s: string) => s.split(/\s[-–—]\s|\s\(/)[0].slice(0, 24);

export interface CompareContext {
  sell: number | null; fields: FieldMap; settings: Settings; card: RateCard; category: string;
  /** The candidate's sample-score criteria and spec labels. */
  labels: QuoteLabels;
}

interface Row {
  label: string;
  /** One cell per quote. */
  cells: ReactNode[];
  /** The columns holding the row's best value. */
  best?: Set<number>;
  /** Why it's best, for screen readers and the tooltip ("lowest", "shortest", "highest"). */
  bestWord?: string;
}
interface Section { title: string; rows: Row[] }

/**
 * Every quote for a candidate side by side: price, extras, freight, landed cost and profit, lead
 * time, samples and their scores, spec. Each row's best value is tinted and marked with a trophy.
 * A table on wider screens; on a phone one supplier at a time with a switch (or a swipe) between them.
 */
export function QuoteCompare({ quotes, chosenQuote, ctx, onChanged, onFieldsChanged }: {
  quotes: Quote[]; chosenQuote: string | null; ctx: CompareContext;
  onChanged: () => void; onFieldsChanged: () => void;
}) {
  const [scores, setScores] = useState<Record<string, SampleScores>>({});
  const [choosing, setChoosing] = useState<Quote | null>(null);
  const [shown, setShown] = useState(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const touch = useRef<number | null>(null);

  const reg = !!ctx.settings.vatRegistered;
  const vals = valuesOf(ctx.fields);
  const today = new Date();
  const scoresOf = (q: Quote): SampleScores => scores[q.id] ?? q.sample_scores ?? {};
  const setScore = (q: Quote, patch: Partial<SampleScores>, delay = 0) => {
    const next = { ...scoresOf(q), ...patch };
    setScores((s) => ({ ...s, [q.id]: next }));
    clearTimeout(timers.current[q.id]);
    timers.current[q.id] = setTimeout(() => {
      api(`/api/pl/quotes/${q.id}`, { method: "PATCH", json: { sample_scores: next } }).then(onChanged, (e: Error) => toast.error(`Not saved: ${e.message}`));
    }, delay);
  };

  const per = quotes.map((q) => {
    const l = landedCost(q);
    const fx = landedInputs(q).fx;
    // Registered: the import VAT is reclaimed, as when a quote is written into Gate 0.
    const unit = l ? (reg ? l.perUnitExVat : l.perUnit) : null;
    const m = priceMultiple(ctx.sell, unit);
    const e = unit == null ? null : econ({ ...vals, landed: unit.toFixed(2), adsSteady: "0" }, ctx.settings, ctx.category || "Everything else", ctx.card);
    const exw = exwTotal(q);
    return { q, l, fx, unit, m, profit: e?.pS ?? null, exw, arrive: arrival(q, today), avg: sampleAverage(scoresOf(q), ctx.labels.criteria) };
  });
  const row = (label: string, cells: ReactNode[], values?: (number | null | undefined)[], better?: "low" | "high", bestWord?: string): Row =>
    ({ label, cells, best: values && better ? bestOf(values, better) : undefined, bestWord });
  const inCur = (v: number | null | undefined, p: (typeof per)[number]) =>
    v == null ? "—" : p.q.currency === "GBP" ? gbp(v) : <>{money(v, p.q.currency)} <span className="text-muted-foreground">· {gbp(v / p.fx)}</span></>;
  const gbpOf = (v: number | null | undefined, p: (typeof per)[number]) => (v == null ? null : v / p.fx);

  const sections: Section[] = [
    {
      title: "Price", rows: [
        row("Unit price (ex-works)", per.map((p) => inCur(p.q.unit_price, p)), per.map((p) => gbpOf(p.q.unit_price, p)), "low", "lowest"),
        row("MOQ", per.map((p) => n0(p.q.moq)), per.map((p) => p.q.moq), "low", "lowest"),
        row("Next tier", per.map((p) => (p.q.next_tier_price == null ? "—" : <>{inCur(p.q.next_tier_price, p)}{p.q.next_tier_qty ? <span className="text-muted-foreground"> at {n0(p.q.next_tier_qty)}</span> : null}</>)),
          per.map((p) => gbpOf(p.q.next_tier_price, p)), "low", "lowest"),
      ],
    },
    {
      title: "Extras", rows: [
        ...EXTRAS.map(({ k, label }) => row(label, per.map((p) => inCur(p.q.extras?.[k], p)), per.map((p) => gbpOf(p.q.extras?.[k], p)), "low", "lowest")),
        row("EXW total", per.map((p) => <b key="x">{inCur(p.exw, p)}</b>), per.map((p) => gbpOf(p.exw, p)), "low", "lowest"),
      ],
    },
    {
      title: "Freight", rows: [
        row("Used for landed cost", per.map((p) => { const u = usedFreight(p.q); return u.mode ? `${cap(u.mode)}${u.ddp ? ", DDP" : u.ddp === false ? ", not DDP" : ""}` : "—"; })),
        row("Freight cost (used)", per.map((p) => gbp(usedFreight(p.q).costGbp)), per.map((p) => usedFreight(p.q).costGbp), "low", "lowest"),
        // One row a mode any quote offers: its cost, transit and DDP, the used one starred.
        ...FREIGHT_MODES.filter((m) => per.some((p) => p.q.freight_options?.some((o) => o.mode === m))).map((m) => {
          const optOf = (p: (typeof per)[number]) => p.q.freight_options?.find((o) => o.mode === m) ?? null;
          return row(`${cap(m)} option`, per.map((p) => {
            const o = optOf(p);
            if (!o) return "—";
            const g = freightGbp(o, p.q);
            return (
              <span key={m} className="inline-flex flex-wrap items-center gap-x-1.5">
                {o.used && <StarIcon className="size-3.5 fill-highlight text-highlight" aria-label="Used for landed cost" />}
                <span>{o.currency === "GBP" ? gbp(o.cost) : <>{money(o.cost, o.currency)} <span className="text-muted-foreground">· {gbp(g)}</span></>}</span>
                <span className="text-muted-foreground">· {o.transit_days == null ? "transit not said" : `${o.transit_days} days`} · {o.ddp == null ? "DDP not said" : o.ddp ? "DDP" : "not DDP"}</span>
              </span>
            );
          }), per.map((p) => { const o = optOf(p); return o ? freightGbp(o, p.q) : null; }), "low", "lowest");
        }),
      ],
    },
    {
      title: "Cost and profit", rows: [
        row(reg ? "Landed per unit (ex import VAT)" : "Landed per unit", per.map((p) => <b key="u" className="text-base">{gbp(p.unit)}</b>), per.map((p) => p.unit), "low", "lowest"),
        row("Total cash required", per.map((p) => gbp(p.l?.total)), per.map((p) => p.l?.total), "low", "lowest"),
        row(ctx.sell ? `Price multiple (sell ${gbp(ctx.sell)})` : "Price multiple", per.map((p) => (p.m ? <StatusChip key="m" tone={MULT_TONE[p.m.status]} className="num">{p.m.multiple.toFixed(2)}×</StatusChip> : <span key="m" className="text-xs text-muted-foreground">{ctx.sell ? "needs a landed cost" : "needs Gate 0's sell price"}</span>)),
          per.map((p) => p.m?.multiple), "high", "highest"),
        row("Profit per unit after fees", per.map((p) => (p.profit == null ? <span key="p" className="text-xs text-muted-foreground">{ctx.sell ? "needs the size and weight" : "needs the sell price"}</span> : gbp(p.profit))), per.map((p) => p.profit), "high", "highest"),
      ],
    },
    {
      title: "Lead time", rows: [
        row("Production", per.map((p) => (p.q.lead_time_days == null ? "—" : `${p.q.lead_time_days} days`)), per.map((p) => p.q.lead_time_days), "low", "shortest"),
        row("Transit (used freight)", per.map((p) => { const t = usedFreight(p.q).transit_days; return t == null ? "—" : `${t} days`; }), per.map((p) => usedFreight(p.q).transit_days), "low", "shortest"),
        row("Arrives at FBA if ordered today", per.map((p) => (p.arrive ? <>{day(p.arrive.date)} <span className="text-muted-foreground">({p.arrive.days} days)</span></> : <span key="a" className="text-xs text-muted-foreground">needs production and transit days</span>)),
          per.map((p) => p.arrive?.days), "low", "soonest"),
      ],
    },
    {
      title: "Samples", rows: [
        row("Status", per.map((p) => { const s = sampleStatusOf(p.q); return <StatusChip key="s" tone={s === "received" ? "good" : s === "ordered" ? "warn" : "neutral"} icon={false}>{s}</StatusChip>; })),
        row("Cost", per.map((p) => inCur(p.q.sample_cost, p)), per.map((p) => gbpOf(p.q.sample_cost, p)), "low", "lowest"),
        row("Received", per.map((p) => day(p.q.sample_received_on))),
      ],
    },
    {
      title: "Sample scores (1–5)", rows: [
        ...ctx.labels.criteria.map(({ k, label }) => row(label, per.map((p) => (
          <NativeSelect key={k} className="h-8 w-20" aria-label={`${label}: ${p.q.supplier_name}`} value={(scoresOf(p.q)[k] as number | undefined) ?? ""}
            onChange={(e) => setScore(p.q, { [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <NativeSelectOption value="">—</NativeSelectOption>
            {[1, 2, 3, 4, 5].map((n) => <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}
          </NativeSelect>
        )), per.map((p) => scoresOf(p.q)[k] as number | undefined), "high", "highest")),
        row("Average", per.map((p) => <b key="a">{p.avg == null ? "—" : p.avg.toFixed(1)}</b>), per.map((p) => p.avg), "high", "highest"),
        row("Note", per.map((p) => (
          <Textarea key="n" className="min-h-16 text-sm" aria-label={`Sample note: ${p.q.supplier_name}`} value={scoresOf(p.q).note ?? ""}
            onChange={(e) => setScore(p.q, { note: e.target.value }, 600)} placeholder="What stood out" />
        ))),
      ],
    },
    { title: "Spec", rows: ctx.labels.spec.map(({ k, label }) => row(label, per.map((p) => p.q.spec?.[k] || "—"))) },
  ];

  const header = (p: (typeof per)[number]) => {
    const chosen = chosenQuote === p.q.id;
    return (
      <div className="space-y-1.5">
        <div className="flex items-start gap-1.5">
          {chosen && <StarIcon className="mt-0.5 size-4 flex-none fill-highlight text-highlight" aria-label="Chosen" />}
          <span className="font-semibold">{p.q.supplier_name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip tone={STATUS_TONE[p.q.status] ?? "neutral"} icon={false}>{p.q.status}</StatusChip>
          {p.q.contact && /^https?:\/\//.test(p.q.contact) && <a className="link inline-flex items-center gap-1 text-xs" href={p.q.contact} target="_blank" rel="noreferrer">Open <ExternalLinkIcon className="size-3" /><span className="sr-only"> {p.q.supplier_name} (opens a new tab)</span></a>}
        </div>
        {chosen
          ? <p className="text-xs text-muted-foreground">The chosen supplier</p>
          : <Button size="sm" variant="secondary" onClick={() => setChoosing(p.q)}>Make this the chosen supplier</Button>}
      </div>
    );
  };
  const cell = (r: Row, i: number) => (
    <>
      {r.cells[i]}
      {r.best?.has(i) && <span className="ml-1.5 inline-flex items-center align-middle text-success" title={`Best: ${r.bestWord}`}><TrophyIcon className="size-3.5" aria-hidden /><span className="sr-only"> (best: {r.bestWord})</span></span>}
    </>
  );

  const i = Math.min(shown, per.length - 1);
  const go = (n: number) => setShown(Math.max(0, Math.min(per.length - 1, n)));
  return (
    <>
      {/* Wider screens: every quote a column. */}
      <div className="hidden overflow-x-auto rounded-[10px] border border-border sm:block">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">Supplier quotes compared; the best value in each row is marked</caption>
          <thead>
            <tr className="border-b border-border bg-subtle align-top">
              <td className="sticky left-0 z-10 w-52 bg-subtle px-3 py-2.5 text-xs text-muted-foreground"><TrophyIcon className="mr-1 inline size-3.5 text-success" aria-hidden />Best in the row</td>
              {per.map((p) => <th key={p.q.id} scope="col" className={cn("min-w-56 px-3 py-2.5 text-left font-normal", chosenQuote === p.q.id && "border-t-4 border-t-highlight")}>{header(p)}</th>)}
            </tr>
          </thead>
          {sections.map((s) => (
            <tbody key={s.title}>
              <tr><th colSpan={per.length + 1} scope="colgroup" className="sticky left-0 bg-card px-3 pt-4 pb-1 text-left section-label">{s.title}</th></tr>
              {s.rows.map((r) => (
                <tr key={r.label} className="border-t border-divider align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal text-muted-foreground">{r.label}</th>
                  {per.map((p, n) => <td key={p.q.id} className={cn("num max-w-80 px-3 py-2", r.best?.has(n) && "bg-success-soft")}>{cell(r, n)}</td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* A phone: one supplier at a time. */}
      <div className="space-y-3 sm:hidden">
        <ToggleGroup type="single" variant="outline" spacing={0} value={String(i)} onValueChange={(v) => v && go(Number(v))} aria-label="Supplier" className="w-full overflow-x-auto">
          {per.map((p, n) => <ToggleGroupItem key={p.q.id} value={String(n)} className="flex-1 gap-1">{chosenQuote === p.q.id && <StarIcon className="size-3.5 fill-highlight text-highlight" aria-label="Chosen" />}{shortName(p.q.supplier_name)}</ToggleGroupItem>)}
        </ToggleGroup>
        <p className="text-center text-xs text-muted-foreground">{i + 1} of {per.length} · swipe the card to switch</p>
        {per[i] && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3"
            onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1)); }}>
            {header(per[i])}
            {sections.map((s) => (
              <section key={s.title} className="space-y-1">
                <h3 className="section-label pt-1">{s.title}</h3>
                <dl className="divide-y divide-divider">
                  {s.rows.map((r) => (
                    <div key={r.label} className={cn("flex items-start justify-between gap-3 px-1 py-1.5", r.best?.has(i) && "rounded-md bg-success-soft")}>
                      <dt className="text-muted-foreground">{r.label}</dt>
                      <dd className="num text-right">{cell(r, i)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </div>

      {choosing && <ChooseDialog q={choosing} current={quotes.find((q) => q.id === chosenQuote) ?? null} reg={reg} fields={ctx.fields}
        onClose={() => setChoosing(null)} onDone={() => { setChoosing(null); onChanged(); onFieldsChanged(); }} />}
    </>
  );
}

/**
 * "Make this the chosen supplier": what changes (the old choice goes back to received; Gate 0's
 * landed cost and Gate 7's first order follow the quote), asking before replacing a value you typed.
 */
function ChooseDialog({ q, current, reg, fields, onClose, onDone }: {
  q: Quote; current: Quote | null; reg: boolean; fields: FieldMap; onClose: () => void; onDone: () => void;
}) {
  const l = landedCost(q);
  const unit = l ? (reg ? l.perUnitExVat : l.perUnit) : null;
  const [replace, setReplace] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const lines = l && unit != null ? [
    { k: "landed", label: "Gate 0 landed cost", now: fields.landed, next: gbp(unit), fmt: (v: string) => gbp(Number(v)) },
    { k: "units", label: "Gate 7 first order", now: fields.units, next: `${n0(l.units)} units`, fmt: (v: string) => `${n0(Number(v))} units` },
  ] : [];
  const go = async () => {
    setBusy(true);
    try {
      await api(`/api/pl/quotes/${q.id}/choose`, { method: "POST", json: { rejectOthers: false } });
      let msg = `${q.supplier_name} is the chosen supplier`;
      if (l) {
        const r = await api<{ written: string[]; kept: string[] }>(`/api/pl/quotes/${q.id}/apply`, { method: "POST", json: { to: "gate7", overwrite: Object.keys(replace).filter((k) => replace[k]) } });
        if (r.written.length) msg += `: Gate 0 ${gbp(unit)}${r.written.includes("units") ? `, Gate 7 ${n0(l.units)} units` : ""}`;
        if (r.kept.length) toast.message(`Kept your own ${r.kept.map((k) => (k === "landed" ? "landed cost" : "first order units")).join(" and ")}`);
      }
      toast.success(msg);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-6">Make {q.supplier_name} the chosen supplier?</DialogTitle>
          <DialogDescription>
            {current && current.id !== q.id ? <>{current.supplier_name} goes back to &ldquo;received&rdquo;. </> : null}
            {l ? "The gates follow this quote:" : "This quote has no landed cost yet (it needs a unit price and units), so the gates stay as they are."}
          </DialogDescription>
        </DialogHeader>
        {lines.length > 0 && (
          <ul className="space-y-3 text-sm">
            {lines.map((x) => {
              const mine = x.now?.source === "manual";
              return (
                <li key={x.k} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>{x.label}</span>
                    <span className="num">{x.now?.value ? <span className="text-muted-foreground">{x.fmt(x.now.value)} → </span> : null}<b>{x.next}</b></span>
                  </div>
                  {mine && (
                    <label className="flex items-start gap-2 rounded-lg bg-warn-soft px-2.5 py-2 text-warn-ink">
                      <Checkbox className="mt-0.5" checked={!!replace[x.k]} onCheckedChange={(v) => setReplace((r) => ({ ...r, [x.k]: v === true }))} />
                      <span>You typed {x.fmt(x.now!.value)} yourself. Replace it with this quote&apos;s {x.next}? Left unticked, yours stays.</span>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} loading={busy}>Make chosen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
