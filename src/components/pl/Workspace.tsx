"use client";

import { ChevronRightIcon, ExternalLinkIcon, LoaderIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ProductThumb } from "@/components/ProductThumb";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { RateCard } from "@/lib/fees/rateCard";
import { monthlySales, priceOf } from "@/lib/pl/fill";
import { budget, econ, evaluate, money, pct, referralOptions, type Evaluation, type FieldDef, type GateDef, type Settings, type Status } from "@/lib/pl/gatekeeper";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";
import { Readout, SourceChip, StatusPill } from "./bits";
import { STATUSES, TONE, valuesOf, type CandidateDetail, type FieldMap } from "./types";

const CHECK_BG: Record<Status, string> = { pass: "bg-pass", warn: "bg-warn", fail: "bg-fail", empty: "bg-empty" };
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));

/** One candidate: its header, the eight gates, the scorecard and the verdict. */
export function Workspace({ id, settings, card, onChanged, onDeleted }: {
  id: string; settings: Settings; card: RateCard;
  /** The list re-scores as you type. */
  onChanged: (id: string, patch: { fields?: FieldMap; name?: string; status?: string; refreshed_at?: string | null; category?: string }) => void;
  onDeleted: (id: string) => void;
}) {
  const [data, setData] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldMap>({});
  const [open, setOpen] = useState<Set<string>>(new Set(["g0", "g1", "g2"]));
  const [busy, setBusy] = useState(false);
  const { confirm } = useDialogs();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useMemo(() => async () => {
    try {
      const d = await api<CandidateDetail>(`/api/pl/candidates/${id}`);
      setData(d);
      setFields(d.fields);
      setError(null);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);
  // The page remounts this per candidate, so there's nothing stale to clear first.
  useEffect(() => {
    api<CandidateDetail>(`/api/pl/candidates/${id}`).then((d) => { setData(d); setFields(d.fields); }).catch((e: Error) => setError(e.message));
  }, [id]);

  const category = data?.candidate.category ?? "Everything else";
  const ev: Evaluation | null = useMemo(() => (data ? evaluate(valuesOf(fields), category, settings, card) : null), [data, fields, category, settings, card]);

  if (error) return <ErrorState title="Couldn't load the candidate" message={error} onRetry={load} />;
  if (!data || !ev) return <div className="space-y-3"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  const c = data.candidate;

  const setLocal = (next: FieldMap) => {
    setFields(next);
    onChanged(id, { fields: next });
  };
  /** Your own value: shown at once, saved shortly after you stop typing. */
  const saveField = (k: string, value: string, delay = 500) => {
    const next = { ...fields };
    if (value === "") delete next[k];
    else next[k] = { value, source: "manual" };
    setLocal(next);
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => {
      api(`/api/pl/candidates/${id}/fields`, { method: "PUT", json: { key: k, value } }).catch((e) => toast.error(`Not saved: ${(e as Error).message}`));
    }, delay);
  };
  const patch = async (p: Record<string, unknown>, msg?: string) => {
    try {
      await api(`/api/pl/candidates/${id}`, { method: "PATCH", json: p });
      setData((d) => d && { ...d, candidate: { ...d.candidate, ...(p as object) } });
      onChanged(id, p as { name?: string });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api<{ tokensUsed: number; fetched: string[]; reused: string[]; missing: string[]; filled: string[]; skippedManual: string[]; keepa: boolean; exhausted: boolean }>(`/api/pl/candidates/${id}/refresh`, { method: "POST" });
      const d = await load();
      if (d) onChanged(id, { fields: d.fields, refreshed_at: d.candidate.refreshed_at });
      if (!r.keepa) toast.error("Keepa isn't configured: set KEEPA_API_KEY.");
      else toast.success(`Keepa: ${r.fetched.length} fetched, ${r.reused.length} reused (under 7 days old), ${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"}.${r.skippedManual.length ? ` ${r.skippedManual.length} manual field${r.skippedManual.length === 1 ? "" : "s"} kept.` : ""}${r.missing.length ? ` Not found: ${r.missing.join(", ")}.` : ""}${r.exhausted ? " Keepa ran out of tokens." : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete “${c.name}”?`, description: "Its fields, ASINs and Opportunity Explorer captures go with it.", confirmLabel: "Delete", destructive: true }))) return;
    await api(`/api/pl/candidates/${id}`, { method: "DELETE" });
    onDeleted(id);
  };
  const toggle = (g: string) => setOpen((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <Header data={data} ev={ev} card={card} busy={busy} onRefresh={refresh} onPatch={patch} />
      {ev.gates.map(({ g, rows, status }) => (
        <section key={g.id} className={cn("panel overflow-hidden")}>
          <button type="button" aria-expanded={open.has(g.id)} onClick={() => toggle(g.id)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left">
            <span className={cn("flex size-8 flex-none items-center justify-center rounded-lg font-heading text-sm font-bold", TONE[status].solid)}>{g.n}</span>
            <h2 className="min-w-0 flex-1 font-heading text-base font-bold">{g.title}</h2>
            <span className="hidden text-xs text-muted-foreground sm:inline">{g.tool}</span>
            <StatusPill status={status} />
            <ChevronRightIcon className={cn("size-4 flex-none text-muted-foreground transition-transform", open.has(g.id) && "rotate-90")} />
          </button>
          {open.has(g.id) && (
            <div className={cn("flex flex-col gap-3.5 border-l-[3px] px-4 pt-3.5 pb-4", TONE[status].border)}>
              <p className="max-w-[70ch] text-sm text-ink-2">{g.blurb}</p>
              <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.fields.map((fd) => (
                  <FieldRow key={fd.k} def={fd} field={fields[fd.k]} why={data.why[fd.k]} onSave={saveField}
                    manualOnly={g.id === "g5" && ["headBid", "ltBid", "sponsored"].includes(fd.k)} />
                ))}
              </div>
              <GateExtras g={g} data={data} fields={fields} settings={settings} card={card} />
              <div className="overflow-hidden rounded-lg border">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-t px-3 py-2 text-sm first:border-t-0">
                    <span className={cn("flex size-[18px] items-center justify-center rounded-full text-[11px] font-bold text-white", CHECK_BG[r.status])}>{r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : r.status === "warn" ? "!" : "·"}</span>
                    <span>{r.label}</span>
                    <span className="num text-xs whitespace-nowrap text-muted-foreground">{r.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
      <ScorecardPanel ev={ev} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="text-fail hover:text-fail" onClick={remove}><Trash2Icon /> Delete candidate</Button>
        <span className="ml-auto text-xs text-muted-foreground">24–30 order samples · 18–23 only if weak lines are movable · under 18 drop</span>
      </div>
    </div>
  );
}

function Header({ data, ev, card, busy, onRefresh, onPatch }: {
  data: CandidateDetail; ev: Evaluation; card: RateCard; busy: boolean; onRefresh: () => void; onPatch: (p: Record<string, unknown>, msg?: string) => Promise<void>;
}) {
  const c = data.candidate;
  const [name, setName] = useState(c.name);
  const [niche, setNiche] = useState(c.niche_keyword ?? "");
  const [asinText, setAsinText] = useState(data.asins.map((a) => a.asin).join("\n"));
  const [editAsins, setEditAsins] = useState(false);
  const cats = referralOptions(card);
  const sc = ev.sc;
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-4">
          <div className="flex flex-col items-end leading-tight"><span className="num font-heading text-2xl font-bold">{ev.passed}<small className="text-sm font-medium text-muted-foreground">/8</small></span><span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">gates clear</span></div>
          <div className="flex flex-col items-end leading-tight"><span className="num font-heading text-2xl font-bold">{sc.answered === 10 ? sc.total : "–"}<small className="text-sm font-medium text-muted-foreground">/30</small></span><span className="text-[10.5px] tracking-wide text-muted-foreground uppercase">score</span></div>
        </div>
        <StatusPill status={ev.v.cls} label={ev.v.title} big />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{c.refreshed_at ? `Keepa ${ago(c.refreshed_at)}` : "Not fetched"} · {c.token_cost} token{c.token_cost === 1 ? "" : "s"} so far</span>
          <Button size="sm" onClick={onRefresh} disabled={busy || !data.asins.length}>{busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Refresh from Keepa</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5"><span className="field-label">Product</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && onPatch({ name: name.trim() })} /></label>
        <label className="space-y-1.5"><span className="field-label">Niche keyword</span>
          <Input value={niche} placeholder="As Opportunity Explorer names it" onChange={(e) => setNiche(e.target.value)} onBlur={() => niche !== (c.niche_keyword ?? "") && onPatch({ niche_keyword: niche })} /></label>
        <label className="space-y-1.5"><span className="field-label">Referral category</span>
          <NativeSelect className="w-full" value={c.category} onChange={(e) => onPatch({ category: e.target.value })}>
            {cats.map((o) => <NativeSelectOption key={o.name} value={o.name}>{o.name} — {o.rates}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1.5"><span className="field-label">Status</span>
          <NativeSelect className="w-full" value={c.status} onChange={(e) => onPatch({ status: e.target.value })}>
            {STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</NativeSelectOption>)}
          </NativeSelect></label>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="field-label">Page-one ASINs ({data.asins.length}/10, the first is the reference)</span>
          <Button variant="ghost" size="xs" onClick={() => setEditAsins((v) => !v)}><PencilIcon /> {editAsins ? "Cancel" : "Edit"}</Button>
        </div>
        {editAsins ? (
          <div className="flex flex-col gap-2">
            <Textarea className="num h-28 text-xs" value={asinText} onChange={(e) => setAsinText(e.target.value)} placeholder="One per line or comma-separated, up to 10" />
            <div><Button size="sm" variant="outline" onClick={async () => { await onPatch({ asins: asinText }); setEditAsins(false); onRefresh(); }}>Save and refresh</Button></div>
          </div>
        ) : <AsinTable data={data} />}
      </div>
    </div>
  );
}

function AsinTable({ data }: { data: CandidateDetail }) {
  if (!data.asins.length) return <p className="text-sm text-muted-foreground">No ASINs yet: Edit to add up to ten from page one of the niche.</p>;
  return (
    <div className="table-wrap overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
          <th className="px-2 py-1.5">Listing</th><th className="px-2 py-1.5 text-right">Price</th><th className="px-2 py-1.5 text-right">Rating</th><th className="px-2 py-1.5 text-right">Reviews</th>
          <th className="px-2 py-1.5 text-right">Rank</th><th className="px-2 py-1.5 text-right">Sales / mo</th><th className="px-2 py-1.5">Flags</th></tr></thead>
        <tbody>
          {data.asins.map((a) => {
            const s = monthlySales(a);
            return (
              <tr key={a.asin} className="border-b last:border-b-0">
                <td className="px-2 py-1.5">
                  <div className="flex w-[min(24rem,45vw)] min-w-[200px] items-center gap-2">
                    <ProductThumb url={a.image} asin={a.asin} title={a.title} brand={a.brand} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium" title={a.title ?? ""}>{a.title ?? (a.snapshot_at ? "—" : "Not fetched yet")}</div>
                      <div className="num text-[11px] text-muted-foreground">
                        <a className="hover:underline" href={`https://www.amazon.co.uk/dp/${a.asin}`} target="_blank" rel="noreferrer">{a.asin}</a>
                        {a.brand ? ` · ${a.brand}` : ""}{a.is_reference ? " · reference" : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num px-2 py-1.5 text-right">{money(priceOf(a))}</td>
                <td className="num px-2 py-1.5 text-right">{a.rating?.toFixed(1) ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{n0(a.review_count)}</td>
                <td className="num px-2 py-1.5 text-right">{n0(a.rank)}</td>
                <td className="num px-2 py-1.5 text-right" title={s.why}>{n0(s.value)}</td>
                <td className="px-2 py-1.5 text-xs">
                  {a.amazon_brand && <span className="mr-1 rounded bg-fail-soft px-1.5 py-px text-fail">Amazon brand</span>}
                  {a.amazon_ever_seller && <span className="rounded bg-warn-soft px-1.5 py-px text-warn">Amazon has sold</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One Gatekeeper field. Filled automatically: read-only with its source until you click edit. */
function FieldRow({ def, field, why, onSave, manualOnly }: { def: FieldDef; field?: { value: string; source: string }; why?: string; onSave: (k: string, v: string, delay?: number) => void; manualOnly?: boolean }) {
  const value = field?.value ?? "";
  const auto = field && field.source !== "manual";
  const id = `f_${def.k}`;
  const shown = def.type === "yn" ? (value === "yes" ? "Yes" : value === "no" ? "No" : value)
    : def.type === "sel" ? def.opts?.find((o) => o[0] === value)?.[1] ?? value
    : `${def.unit === "£" ? "£" : ""}${value}${def.unit && def.unit !== "£" ? ` ${def.unit}` : ""}`;
  let control: ReactNode;
  if (auto) {
    control = (
      <div className="flex min-h-9 items-center gap-2 rounded-lg border border-dashed bg-surface-2 px-2.5 py-1.5">
        <span className="num flex-1 text-sm">{shown}</span>
        <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => onSave(def.k, value, 0)}>edit</button>
      </div>
    );
  } else if (def.type === "num") {
    control = (
      <div className="flex items-center overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring/40">
        {def.unit === "£" && <span className="num self-stretch border-r bg-surface-2 px-2 py-1.5 text-xs text-muted-foreground">£</span>}
        <input id={id} type="number" inputMode="decimal" step={def.step ?? "any"} className="num min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm outline-none" value={value}
          onChange={(e) => onSave(def.k, e.target.value)} />
        {def.unit && def.unit !== "£" && <span className="num self-stretch border-l bg-surface-2 px-2 py-1.5 text-xs text-muted-foreground">{def.unit}</span>}
      </div>
    );
  } else if (def.type === "sel") {
    control = (
      <NativeSelect id={id} className="w-full" value={value} onChange={(e) => onSave(def.k, e.target.value, 0)}>
        {def.opts!.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
      </NativeSelect>
    );
  } else {
    control = (
      <div className="flex overflow-hidden rounded-lg border border-input" role="group" aria-label={def.label}>
        {(["yes", "no"] as const).map((v) => (
          <button key={v} type="button" onClick={() => onSave(def.k, value === v ? "" : v, 0)}
            className={cn("flex-1 px-2 py-1.5 text-sm font-medium text-muted-foreground not-first:border-l", value === v && (v === "yes" ? "bg-pass text-white" : "bg-ink-2 text-white"))}>{v === "yes" ? "Yes" : "No"}</button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-ink-2">{def.label}</label>
        {field && <SourceChip source={field.source as "keepa"} />}
      </div>
      {control}
      {auto && why ? <span className="text-[11.5px] text-muted-foreground">{why}</span>
        : manualOnly && !field ? <span className="text-[11.5px] text-muted-foreground">Type it: Opportunity Explorer has no bids or sponsored slots</span>
        : def.hint ? <span className="text-[11.5px] text-muted-foreground">{def.hint}</span> : null}
    </div>
  );
}

function GateExtras({ g, data, fields, settings, card }: { g: GateDef; data: CandidateDetail; fields: FieldMap; settings: Settings; card: RateCard }) {
  const f = valuesOf(fields);
  if (g.id === "g3" || g.id === "g5") {
    const p = data.poe;
    if (!p) return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">No Opportunity Explorer capture yet. Open the niche in Seller Central → Growth → Product Opportunity Explorer with the extension loaded, then click <b>Send to Gatekeeper</b> in its panel. A niche whose title matches this candidate&apos;s niche keyword attaches by itself.</p>;
    if (g.id === "g3") return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">From Opportunity Explorer{p.niche_title ? `: “${p.niche_title}”` : ""}, captured {ago(p.captured_at)}. Send the niche again to update.</p>;
    const terms = p.search_terms.slice(0, 12);
    return terms.length ? (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1.5">Search term</th><th className="px-2 py-1.5 text-right">Searches / mo</th><th className="px-2 py-1.5 text-right">Click share</th><th className="px-2 py-1.5 text-right">Conversion</th></tr></thead>
          <tbody>{terms.map((t) => (
            <tr key={t.term} className={cn("border-b last:border-b-0", t.volume >= 300 && t.volume <= 2000 && "bg-brand-soft/40")}>
              <td className="px-2 py-1.5">{t.term}</td><td className="num px-2 py-1.5 text-right">{n0(t.volume)}</td>
              <td className="num px-2 py-1.5 text-right">{t.click_share == null ? "—" : `${t.click_share}%`}</td><td className="num px-2 py-1.5 text-right">{t.conversion == null ? "—" : `${t.conversion}%`}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">{p.search_terms.length} terms captured; highlighted rows are long-tail (300–2,000 a month).</p>
      </div>
    ) : null;
  }
  if (g.id === "g4") {
    const top = data.asins.slice(0, 5);
    if (!top.length) return null;
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1.5">Listing</th><th className="px-2 py-1.5 text-right">Rating</th><th className="px-2 py-1.5 text-right">Reviews</th><th className="px-2 py-1.5">1–3★ reviews</th></tr></thead>
          <tbody>{top.map((a) => (
            <tr key={a.asin} className="border-b last:border-b-0">
              <td className="px-2 py-1.5"><span className="num text-xs">{a.asin}</span> <span className="text-xs text-muted-foreground">{a.brand ?? ""}</span></td>
              <td className="num px-2 py-1.5 text-right">{a.rating?.toFixed(1) ?? "—"}</td>
              <td className="num px-2 py-1.5 text-right">{n0(a.review_count)}</td>
              <td className="px-2 py-1.5">
                <a className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.amazon.co.uk/product-reviews/${a.asin}/?filterByStar=critical&sortBy=recent&reviewerType=all_reviews`}>Read the critical reviews <ExternalLinkIcon className="size-3" /></a>
              </td>
            </tr>
          ))}</tbody>
        </table>
        <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">Keepa carries the rating and review count but not the star breakdown: Amazon&apos;s critical filter shows the 1–3★ reviews.</p>
      </div>
    );
  }
  if (g.id === "g6") {
    const e = econ(f, settings, data.candidate.category, card);
    if (!e) return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">Enter a sell price in Gate 0 to see the economics.</p>;
    const S = settings, t = e.tier;
    const cls = (v: number | null, ok: number, w: number): Status | null => (v == null ? null : v >= ok ? "pass" : v >= w ? "warn" : "fail");
    const tierLine = e.fbaSource === "override" ? "Your override" : !t ? "Enter dimensions and weight in Gate 0" : t.fee == null ? "Too large for standard FBA tiers" : `${t.name}${t.bandMaxG ? ` · ≤${t.bandMaxG >= 1000 ? `${t.bandMaxG / 1000} kg` : `${t.bandMaxG} g`}` : ""}`;
    const dimNote = t && t.useDim ? `ships as ${(t.shipG / 1000).toFixed(2)} kg${t.dimG > Number(f.weight) ? " (dimensional)" : ""}` : "";
    const srcNote = e.fbaSource === "low-price" ? ` · low-price rate (≤ £${e.lowThreshold})` : e.fbaSource === "peak" ? " · peak rate" : "";
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <SourceChip source="fees" /> {card.name}: size tier, weight band, dimensional weight, low-price rate and storage applied from Gate 0.
          {e.peak && <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn" title="Amazon's peak season (October to December): the peak storage rate and the small-parcel peak surcharge apply. Set automatically from today's date.">Peak rates in effect (Oct–Dec)</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Readout label="FBA size tier" value={<span className="font-sans text-sm font-semibold">{tierLine}</span>} sub={`${dimNote}${srcNote}`} />
          <Readout label="FBA fee" value={e.fbaV == null ? "—" : money(e.fbaV)} sub={e.fbaBase == null ? "enter dimensions and weight in Gate 0" : `${money(e.fbaBase)} + VAT + DSF${e.fbaSource === "peak" ? " (peak)" : ""}`} />
          <Readout label="Referral fee" value={money(e.referral)} sub={`${e.pct}% of ${money(e.sell)} + VAT + DSF`} />
          <Readout label="Storage" value={money(e.storage)} sub={e.storage == null ? "enter dimensions in Gate 0" : `${money(e.storageBase)} (${S.storageMonths} mo × £${e.peak ? card.storage.peakPerCuFt : card.storage.standardPerCuFt}/cu ft${e.peak ? ", peak" : ""}) + VAT + DSF`} />
          <Readout label="Inbound, prep, returns" value={money(e.inbound + e.prep + e.returns)} sub={`${money(e.inbound)} + ${money(e.prep)} + ${S.returnsPct}% returns`} />
          <Readout label="Amazon's total take" value={money(e.amazonTake)} sub={e.amazonTake == null ? "" : `${((e.amazonTake / e.sell) * 100).toFixed(1)}% of price`} />
          <Readout label="Multiple" value={e.multiple == null ? "—" : `${e.multiple.toFixed(2)}×`} sub="sell ÷ landed" tone={cls(e.multiple, S.minMultiple, 3)} />
          <Readout label="Profit, launch" value={money(e.pL)} sub={`${pct(e.mL)} margin, ads in`} tone={cls(e.mL, S.minLaunchMargin, S.minLaunchMargin - 5)} />
          <Readout label="Profit, steady" value={money(e.pS)} sub={`${pct(e.mS)} margin`} tone={cls(e.mS, S.minSteadyMargin, S.minSteadyMargin - 5)} />
        </div>
      </div>
    );
  }
  if (g.id === "g7") {
    const b = budget(f, settings);
    if (!b) return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">Enter the launch lines to total the launch.</p>;
    const tone: Status = b.total <= settings.budget ? "pass" : b.total <= settings.budget * 1.15 ? "warn" : "fail";
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Readout label="Stock" value={money(b.stock)} sub="units × landed" />
        <Readout label="Subtotal" value={money(b.sub)} />
        <Readout label="10% buffer" value={money(b.buffer)} />
        <Readout label="Whole launch" value={money(b.total)} sub={`${(b.ratio * 100).toFixed(0)}% of ${money(settings.budget)}`} tone={tone} />
      </div>
    );
  }
  return null;
}

function ScorecardPanel({ ev }: { ev: Evaluation }) {
  const sc = ev.sc;
  const PTS = ["bg-fail-soft text-fail", "bg-warn-soft text-warn", "bg-brand-soft text-brand", "bg-pass-soft text-pass"];
  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3.5">
        <h2 className="font-heading text-lg font-bold">Scorecard</h2>
        <StatusPill status={sc.answered === 10 ? "pass" : "empty"} label={`${sc.answered}/10 lines scored`} />
        <div className="ml-auto flex items-baseline gap-1.5 font-heading"><b className="num text-3xl font-bold">{sc.answered === 10 ? sc.total : "–"}</b><span className="text-sm text-muted-foreground">/ 30</span></div>
      </div>
      <div className="relative mb-3.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <i className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${(sc.total / 30) * 100}%` }} />
        <span className="absolute top-0 h-full w-0.5 bg-line-strong" style={{ left: "60%" }} /><span className="absolute top-0 h-full w-0.5 bg-line-strong" style={{ left: "80%" }} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Criterion</th><th className="px-2 py-1.5 text-center">Pts</th><th className="px-2 py-1.5">Reads as</th><th /></tr></thead>
          <tbody>{sc.rows.map((r) => (
            <tr key={r.n} className="border-b">
              <td className="num px-2 py-2 text-muted-foreground">{r.n}</td>
              <td className="px-2 py-2">{r.label}</td>
              <td className="px-2 py-2 text-center"><b className={cn("num inline-flex size-7 items-center justify-center rounded-md font-semibold", r.pts == null ? "bg-empty-soft text-empty" : PTS[r.pts])}>{r.pts ?? "–"}</b></td>
              <td className="px-2 py-2 text-xs text-muted-foreground">{r.pts == null ? "Not scored" : r.why[r.pts]}</td>
              <td className="px-2 py-2 text-[11px] whitespace-nowrap text-muted-foreground">{r.structural ? "structural" : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={cn("mt-3.5 rounded-xl border px-4 py-3.5", ev.v.cls === "empty" ? "bg-surface-2" : cn(TONE[ev.v.cls].soft, TONE[ev.v.cls].border))}>
        <b className="mb-0.5 block font-heading text-base">{ev.v.title}</b>
        <p className="text-sm text-ink-2">{ev.v.text}</p>
      </div>
    </section>
  );
}
