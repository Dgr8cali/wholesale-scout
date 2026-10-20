"use client";

/** The candidate page's building blocks: fields, gate extras, checks, the scorecard and waivers (from the old one-page Workspace). */

import { ExternalLinkIcon, LoaderIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ProductThumb } from "@/components/ProductThumb";
import { SortTh, useSortable } from "@/components/SortableTable";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { VatTag } from "@/components/VatTag";
import type { RateCard } from "@/lib/fees/rateCard";
import { defaultReference, listingAge, monthlySales, priceOf } from "@/lib/pl/fill";
import { budget, econ, money, pct, type Evaluation, type FieldDef, type GateDef, type GateResult, type Settings, type Status, type Waiver } from "@/lib/pl/gatekeeper";
import { TERM_SIGNAL_LABEL } from "@/lib/pl/termConversion";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";
import { Readout, SourceChip, StatusPill } from "../bits";
import { ReviewMiner } from "../ReviewMiner";
import { TONE, valuesOf, type CandidateDetail, type FieldMap } from "../types";
import { WaivePopover } from "../WaivePopover";
import { TextButton } from "@/components/ui/text-button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const CHECK_BG: Record<Status, string> = { pass: "bg-success-soft text-success", warn: "bg-warn-soft text-warn-ink", fail: "bg-danger-soft text-danger", empty: "bg-neutral-soft text-neutral" };
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));

/** Free-text notes at the top of the candidate: saved a moment after you stop typing, and on leaving the box. */
export function NotesBox({ initial, onSave }: { initial: string; onSave: (notes: string | null) => Promise<void> }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"saved" | "typing" | "saving">("saved");
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = async (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (v === saved.current) { setState("saved"); return; }
    setState("saving");
    await onSave(v.trim() ? v : null);
    saved.current = v;
    setState("saved");
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-2"><span className="field-label">Notes</span>
        <span className="text-xs text-muted-foreground">{state === "saving" ? "Saving…" : state === "typing" ? "Editing" : text ? "Saved" : ""}</span></span>
      <Textarea rows={2} className="text-sm" value={text} placeholder="Anything worth remembering about this candidate: supplier leads, doubts, what to check next"
        onChange={(e) => { const v = e.target.value; setText(v); setState("typing"); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(v); }, 1000); }}
        onBlur={() => { void flush(text); }} />
    </label>
  );
}

export function AsinTable({ data }: { data: CandidateDetail }) {
  const t = useSortable("pl.pageOne", data.asins, {
    title: { value: (a) => a.title, kind: "text" },
    price: { value: (a) => priceOf(a), kind: "number" },
    rating: { value: (a) => a.rating, kind: "number" },
    reviews: { value: (a) => a.review_count, kind: "number" },
    rank: { value: (a) => a.rank, kind: "number" },
    sales: { value: (a) => monthlySales(a).value, kind: "number" },
    flags: { value: (a) => (a.amazon_brand ? 2 : 0) + (a.amazon_ever_seller ? 1 : 0), kind: "number" },
  });
  if (!data.asins.length) return <p className="text-sm text-muted-foreground">No ASINs yet: Edit to add up to ten from page one of the niche.</p>;
  return (
    <div className="table-wrap overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
          <SortTh {...t.th("title")} className="px-2 py-1.5">Listing</SortTh><SortTh {...t.th("price")} numeric className="px-2 py-1.5 text-right">Price</SortTh>
          <SortTh {...t.th("rating")} numeric className="px-2 py-1.5 text-right">Rating</SortTh><SortTh {...t.th("reviews")} numeric className="px-2 py-1.5 text-right">Reviews</SortTh>
          <SortTh {...t.th("rank")} numeric className="px-2 py-1.5 text-right">Rank</SortTh><SortTh {...t.th("sales")} numeric className="px-2 py-1.5 text-right">Sales / mo</SortTh>
          <SortTh {...t.th("flags")} className="px-2 py-1.5" title="Amazon brand, then Amazon has sold">Flags</SortTh></tr></thead>
        <tbody>
          {t.rows.map((a) => {
            const s = monthlySales(a);
            return (
              <tr key={a.asin} className="border-b last:border-b-0">
                <td className="px-2 py-1.5">
                  <div className="flex w-[min(24rem,45vw)] min-w-[200px] items-center gap-2">
                    <ProductThumb url={a.image} asin={a.asin} title={a.title} brand={a.brand} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium" title={a.title ?? ""}>{a.title ?? (a.snapshot_at ? "—" : "Not fetched yet")}</div>
                      <div className="num text-xs text-muted-foreground">
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
export function FieldRow({ def, field, why, onSave, manualOnly, derived }: {
  def: FieldDef; field?: { value: string; source: string }; why?: string; onSave: (k: string, v: string, delay?: number) => void; manualOnly?: boolean;
  /** A default worked out from other figures (ads per unit): shown until you type a value. */
  derived?: { value: number; why: string };
}) {
  if (!field && derived) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-ink-2">{def.label}</span>
          <span title="Worked out from other figures (shown below): type a value to use your own" className="rounded bg-brand-soft px-1.5 py-px text-xs font-semibold tracking-wide text-link uppercase">Derived</span>
        </div>
        <div className="flex min-h-9 items-center gap-2 rounded-lg border border-dashed bg-surface-2 px-2.5 py-1.5">
          <span className="num flex-1 text-sm">£{derived.value.toFixed(2)}</span>
          <TextButton className="text-xs font-medium" onClick={() => onSave(def.k, String(derived.value), 0)}>edit</TextButton>
        </div>
        <span className="text-xs text-muted-foreground">{derived.why}</span>
      </div>
    );
  }
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
        <TextButton className="text-xs font-medium" onClick={() => onSave(def.k, value, 0)}>edit</TextButton>
      </div>
    );
  } else if (def.type === "num") {
    control = (
      <div className="flex items-center overflow-hidden rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring/40">
        {def.unit === "£" && <span className="num self-stretch border-r bg-surface-2 px-2 py-1.5 text-xs text-muted-foreground">£</span>}
        <input id={id} type="number" inputMode="decimal" step={def.step ?? "any"} className="num min-h-9 min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm outline-none max-sm:min-h-11" value={value}
          onChange={(e) => onSave(def.k, e.target.value)} />
        {def.unit && def.unit !== "£" && <span className="num self-stretch border-l bg-surface-2 px-2 py-1.5 text-xs text-muted-foreground">{def.unit}</span>}
      </div>
    );
  } else if (def.type === "area") {
    control = <Textarea id={id} rows={4} maxLength={4000} className="text-sm" value={value} onChange={(e) => onSave(def.k, e.target.value)} />;
  } else if (def.type === "text") {
    control = <input id={id} type="text" maxLength={200} className="min-h-9 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 max-sm:min-h-11" value={value} onChange={(e) => onSave(def.k, e.target.value)} />;
  } else if (def.type === "sel") {
    control = (
      <NativeSelect id={id} className="w-full" value={value} onChange={(e) => onSave(def.k, e.target.value, 0)}>
        {def.opts!.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
      </NativeSelect>
    );
  } else {
    control = (
      // Click the chosen answer again to clear it.
      <ToggleGroup type="single" variant="outline" spacing={0} value={value} onValueChange={(v) => onSave(def.k, v, 0)} aria-label={def.label} className="w-full">
        <ToggleGroupItem value="yes" className="flex-1 data-[state=on]:bg-success-soft data-[state=on]:text-success">Yes</ToggleGroupItem>
        <ToggleGroupItem value="no" className="flex-1">No</ToggleGroupItem>
      </ToggleGroup>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-ink-2">{def.label}</label>
        {field && <SourceChip source={field.source as "keepa"} />}
      </div>
      {control}
      {auto && why ? <span className="text-xs text-muted-foreground">{why}</span>
        : manualOnly && !field ? <span className="text-xs text-muted-foreground">Type it: Opportunity Explorer has no bids or sponsored slots</span>
        : def.hint ? <span className="text-xs text-muted-foreground">{def.hint}</span> : null}
    </div>
  );
}

/**
 * Gate 1, listing by listing: who's on page one, how established each is, and what it sells. The two
 * youngest listings and the two with the fewest reviews are marked: the ones proving a newcomer can
 * break in.
 */
export function PageOneTable({ asins }: { asins: CandidateDetail["asins"] }) {
  const live = asins.filter((a) => a.snapshot_at);
  const pickTwo = (xs: typeof live, key: (a: (typeof live)[number]) => number | null, asc: boolean) =>
    new Set(xs.filter((a) => key(a) != null).sort((a, b) => (asc ? key(a)! - key(b)! : key(b)! - key(a)!)).slice(0, 2).map((a) => a.asin));
  const young = pickTwo(live, (a) => (a.first_seen ? Date.parse(a.first_seen) : null), false);
  const fewest = pickTwo(live, (a) => a.review_count, true);
  const t = useSortable("pl.gate1", asins, {
    asin: { value: (a) => a.asin, kind: "text" },
    brand: { value: (a) => a.brand, kind: "text" },
    reviews: { value: (a) => a.review_count, kind: "number" },
    rating: { value: (a) => a.rating, kind: "number" },
    bought: { value: (a) => a.bought_past_month, kind: "number" },
    price: { value: (a) => priceOf(a), kind: "number" },
    seen: { value: (a) => (a.first_seen ? Date.parse(a.first_seen) : null), kind: "number" },
  });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...t.th("asin")} className="px-2 py-1.5">ASIN</SortTh><SortTh {...t.th("brand")} className="px-2 py-1.5">Brand</SortTh>
            <SortTh {...t.th("reviews")} numeric className="px-2 py-1.5 text-right">Reviews</SortTh><SortTh {...t.th("rating")} numeric className="px-2 py-1.5 text-right">Rating</SortTh>
            <SortTh {...t.th("bought")} numeric className="px-2 py-1.5 text-right" title="Amazon's bought in past month">Bought / mo</SortTh><SortTh {...t.th("price")} numeric className="px-2 py-1.5 text-right">Price</SortTh>
            <SortTh {...t.th("seen")} numeric className="px-2 py-1.5 text-right" title="When Keepa first saw the listing">First seen</SortTh>
          </tr></thead>
          <tbody>{t.rows.map((a) => {
            const y = young.has(a.asin), f = fewest.has(a.asin);
            return (
              <tr key={a.asin} className={cn("border-b last:border-0", (y || f) && "bg-brand-soft/40")}>
                <td className="num px-2 py-1.5"><a className="link" href={`https://www.amazon.co.uk/dp/${a.asin}`} target="_blank" rel="noreferrer">{a.asin}</a>{a.is_reference && <span className="ml-1 text-xs text-muted-foreground">ref</span>}</td>
                <td className="max-w-40 truncate px-2 py-1.5" title={a.title ?? ""}>{a.brand ?? "—"}</td>
                <td className={cn("num px-2 py-1.5 text-right", f && "font-semibold text-link")}>{a.review_count?.toLocaleString("en-GB") ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{a.rating ?? "—"}</td>
                <td className="num px-2 py-1.5 text-right">{a.bought_past_month != null ? `${a.bought_past_month.toLocaleString("en-GB")}+` : "—"}</td>
                <td className="num px-2 py-1.5 text-right">{money(priceOf(a))}</td>
                <td className={cn("num px-2 py-1.5 text-right whitespace-nowrap", y && "font-semibold text-link")}>{a.first_seen ? new Date(a.first_seen).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  {y && <span className="ml-1 text-xs font-normal">({listingAge(a.first_seen)?.text})</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Marked: the two youngest listings (first seen) and the two with the fewest reviews. Young or thinly reviewed listings selling well are the proof a newcomer can break in.</p>
    </div>
  );
}

/**
 * Gate 2's reference listing: pick which page-one ASIN its 12-month figures come from (by default
 * the longest Keepa history), its listing age beside the 12-month verdict, and its rank sparkline.
 */
export function ReferencePanel({ data, onChanged }: { data: CandidateDetail; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const { confirm } = useDialogs();
  const ref = data.asins.find((a) => a.is_reference) ?? data.asins[0];
  if (!ref) return null;
  const longest = defaultReference(data.asins.filter((a) => a.snapshot_at));
  const age = listingAge(ref.first_seen);
  const young = age != null && age.months < 12;
  const pick = async (asin: string) => {
    if (asin === ref.asin) return;
    const a = data.asins.find((x) => x.asin === asin);
    const hasBb = !!a?.history?.buyBoxFetched && !!a.snapshot_at && Date.now() - Date.parse(a.snapshot_at) < 7 * 86_400_000;
    if (!hasBb && !(await confirm({ title: `Make ${asin} the reference?`, description: "Gate 2 runs again from it. Its Buy Box history isn't stored from the last 7 days, so Keepa fetches it: about 3 tokens.", confirmLabel: "Switch (≈3 tokens)" }))) return;
    setBusy(true);
    try {
      const r = await api<{ tokensUsed: number; buyBox: string }>(`/api/pl/candidates/${data.candidate.id}`, { method: "PATCH", json: { reference: asin } });
      toast.success(`Gate 2 now reads ${asin}${r.tokensUsed ? ` (${r.tokensUsed} Keepa token${r.tokensUsed === 1 ? "" : "s"})` : " (no Keepa tokens: stored data)"}${r.buyBox === "missing" ? ". No Buy Box history yet: refresh to read it" : ""}`);
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const seen = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "first seen unknown");
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-surface-2/50 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="field-label">Reference listing</span>
        <NativeSelect className="max-w-full min-w-0 flex-1 sm:flex-none" value={ref.asin} disabled={busy} onChange={(e) => pick(e.target.value)}>
          {data.asins.map((a) => (
            <NativeSelectOption key={a.asin} value={a.asin}>
              {a.asin} · {a.review_count != null ? `${a.review_count.toLocaleString("en-GB")} reviews` : "reviews ?"} · since {seen(a.first_seen)}{a.asin === longest ? " · longest history" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {busy && <LoaderIcon className="size-4 animate-spin" />}
        <span className="text-xs text-muted-foreground">{data.candidate.reference_pinned ? "Your pick" : "Default: the longest Keepa history"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs">
          12-month verdict: <b>{RANK_TREND_LABEL[String(ref.history?.rankTrend ?? "")] ?? "—"}</b>
          {age && <> · listing age <b className={cn(young && "text-warn")}>{age.text}</b>{young && <span className="text-warn"> (under a year: the trend may be its launch, not the niche&apos;s demand)</span>}</>}
        </span>
        {data.refRank && data.refRank.asin === ref.asin ? <RankSparkline points={data.refRank.points} /> : <span className="text-xs text-muted-foreground">No stored 12-month rank for {ref.asin}: refresh from Keepa.</span>}
      </div>
    </div>
  );
}

const RANK_TREND_LABEL: Record<string, string> = { "0": "Spike or decline", "1": "Seasonal", "2": "Flat", "3": "Growing" };

/** Sales rank over 12 months, a point a week; higher on the chart is better (a lower rank). */
export function RankSparkline({ points }: { points: [number, number][] }) {
  if (points.length < 2) return null;
  const W = 180, H = 36;
  const t0 = points[0][0], t1 = points[points.length - 1][0];
  const logs = points.map(([, v]) => Math.log10(v));
  const lo = Math.min(...logs), hi = Math.max(...logs);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - 2) + 1;
  const y = (v: number) => (hi === lo ? H / 2 : ((Math.log10(v) - lo) / (hi - lo)) * (H - 4) + 2);
  const d = points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const best = Math.min(...points.map((p) => p[1])), worst = Math.max(...points.map((p) => p[1]));
  const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" title={`Sales rank, ${fmt(t0)}–${fmt(t1)}, weekly (log scale; up is better). Best #${best.toLocaleString("en-GB")}, worst #${worst.toLocaleString("en-GB")}.`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-label="Sales rank, 12 months">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-link" />
      </svg>
      <span className="num">#{points[points.length - 1][1].toLocaleString("en-GB")} now</span>
    </span>
  );
}

export function GateExtras({ g, data, fields, settings, card, onSave, onAsinsChanged }: { g: GateDef; data: CandidateDetail; fields: FieldMap; settings: Settings; card: RateCard; onSave: (k: string, v: string, delay?: number) => void; onAsinsChanged: () => void }) {
  const f = valuesOf(fields);
  if (g.id === "g3" || g.id === "g5") {
    const p = data.poe;
    if (!p) return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">No Opportunity Explorer capture yet. Open the niche in Seller Central → Growth → Product Opportunity Explorer with the extension loaded, then click <b>Send to Private label</b> in its panel. A niche whose title matches this candidate&apos;s niche keyword attaches by itself.</p>;
    if (g.id === "g3") return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">From Opportunity Explorer{p.niche_title ? `: “${p.niche_title}”` : ""}, captured {ago(p.captured_at)}. Send the niche again to update.</p>;
    const terms = p.search_terms.slice(0, 12);
    return terms.length ? <SearchTermsTable terms={terms} captured={p.search_terms.length} /> : null;
  }
  if (g.id === "g1") return data.asins.length ? <PageOneTable asins={data.asins} /> : null;
  if (g.id === "g4") {
    // Every page-one ASIN, in the candidate's order: no cap (Gatekeeper said "the top five").
    const top = data.asins;
    return (
      <div className="flex flex-col gap-3">
        {top.length > 0 && <CriticalReviewsTable asins={top} />}
        <ReviewMiner candidateId={data.candidate.id} asins={top} product={data.candidate.niche_keyword || data.candidate.name} fields={fields} onSave={onSave} onAsinsChanged={onAsinsChanged} />
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
    const srcNote = e.fbaSource === "low-price" ? ` · low-price rate: sell ≤ £${e.lowThreshold}` : e.lowMiss ? ` · not the low-price rate: ${e.lowMiss}` : e.fbaSource === "peak" ? " · peak rate" : "";
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <SourceChip source="fees" /> {card.name}: size tier, weight band, dimensional weight, low-price rate and storage applied from Gate 0.
          {e.peak && <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn" title="Amazon's peak season (October to December): the peak storage rate and the small-parcel peak surcharge apply. Set automatically from today's date.">Peak rates in effect (Oct–Dec)</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Readout label="FBA size tier" value={<span className="flex flex-wrap items-center gap-1.5 font-sans text-sm font-semibold">{tierLine}
            {e.fbaSource === "low-price" && <span className="rounded-full bg-pass-soft px-1.5 py-px text-xs font-semibold text-pass uppercase" title={`Amazon's Low-Price FBA rate: the sell price is £${e.lowThreshold} or less in this category`}>low-price rate</span>}</span>} sub={`${dimNote}${srcNote}`} />
          <Readout label="FBA fee" value={e.fbaV == null ? "—" : money(e.fbaV)} sub={e.fbaBase == null ? "enter dimensions and weight in Gate 0" : `${money(e.fbaBase)} + ${e.vatRegistered ? "" : "VAT + "}DSF${e.fbaSource === "peak" ? " (peak)" : e.fbaSource === "low-price" ? " (low-price rate)" : ""}`} />
          <Readout label="Referral fee" value={money(e.referral)} sub={`${e.pct}% of ${money(e.sell)} + ${e.vatRegistered ? "" : "VAT + "}DSF`} />
          <Readout label="Storage" value={money(e.storage)} sub={e.storage == null ? "enter dimensions in Gate 0" : `${money(e.storageBase)} (${S.storageMonths} mo × £${e.peak ? card.storage.peakPerCuFt : card.storage.standardPerCuFt}/cu ft${e.peak ? ", peak" : ""}) + ${e.vatRegistered ? "" : "VAT + "}DSF`} />
          <Readout label="Inbound, prep, returns" value={money(e.inbound + e.prep + e.returns)} sub={`${money(e.inbound)} + ${money(e.prep)} + ${S.returnsPct}% returns`} />
          <Readout label="Amazon's total take" value={money(e.amazonTake)} sub={e.amazonTake == null ? "" : `${((e.amazonTake / e.sell) * 100).toFixed(1)}% of price`} />
          <Readout label="Multiple" value={e.multiple == null ? "—" : `${e.multiple.toFixed(2)}×`} sub="sell ÷ landed" tone={cls(e.multiple, S.minMultiple, 3)} />
          <Readout label={<>Profit, launch <VatTag registered={e.vatRegistered} /></>} value={money(e.pL)} sub={`${pct(e.mL)} margin, ads in`} tone={cls(e.mL, S.minLaunchMargin, S.minLaunchMargin - 5)} />
          <Readout label={<>Profit, steady <VatTag registered={e.vatRegistered} /></>} value={money(e.pS)} sub={`${pct(e.mS)} margin`} tone={cls(e.mS, S.minSteadyMargin, S.minSteadyMargin - 5)} />
        </div>
        {e.vatRegistered ? (
          <div className="space-y-0.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
            <p>VAT registered: revenue {money(e.revenue)} ({money(e.sell)} less {money(e.outputVat)} output VAT); Amazon&apos;s fees ex-VAT with the DSF; margins on the revenue.</p>
            <p>Import VAT on the goods is reclaimed, so Gate 0&apos;s landed cost should exclude it (a quote written to Gate 0 does). It&apos;s still cash when the order lands.</p>
            <p>VAT payable per unit: <b className="num text-foreground">{money(e.vatPayable)}</b> ({money(e.outputVat)} output less {money(e.inputVat)} input: VAT on the fees and on the landed cost). Information, not a cost.</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">Not VAT registered (Settings → Business): VAT on the fees is a cost, and the sale price is all revenue.</p>}
      </div>
    );
  }
  if (g.id === "g7") {
    const b = budget(f, settings);
    if (!b) return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">Enter the launch lines to total the launch.</p>;
    const tone: Status = b.total <= b.budget ? "pass" : b.total <= b.budget * 1.15 ? "warn" : "fail";
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Readout label="Stock" value={money(b.stock)} sub="units × landed" />
        <Readout label="Subtotal" value={money(b.sub)} />
        <Readout label="10% buffer" value={money(b.buffer)} />
        <Readout label="Whole launch" value={money(b.total)} sub={`${(b.ratio * 100).toFixed(0)}% of ${money(b.budget)}${b.ownCapital ? " (this launch)" : ""}`} tone={tone} />
      </div>
    );
  }
  return null;
}

export function ScorecardPanel({ ev }: { ev: Evaluation }) {
  const sc = ev.sc;
  const t = useSortable("pl.scorecard", sc.rows, {
    n: { value: (r) => r.n, kind: "number" },
    label: { value: (r) => r.label, kind: "text" },
    pts: { value: (r) => r.pts, kind: "number" },
    why: { value: (r) => (r.info ? r.info.text : r.pts == null ? null : r.why[r.pts]), kind: "text" },
    structural: { value: (r) => (r.structural ? "structural" : null), kind: "text" },
  });
  const PTS = ["bg-fail-soft text-fail", "bg-warn-soft text-warn", "bg-brand-soft text-link", "bg-pass-soft text-pass"];
  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3.5">
        <h2 className="font-heading text-lg font-bold">Scorecard</h2>
        <StatusPill status={sc.answered === 10 ? "pass" : "empty"} label={`${sc.answered}/10 lines scored`} />
        <div className="ml-auto flex items-baseline gap-1.5 font-heading"><b className="num text-2xl font-bold">{sc.answered === 10 ? sc.total : "–"}</b><span className="text-sm text-muted-foreground">/ 30</span></div>
      </div>
      <div className="relative mb-3.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
        <i className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${(sc.total / 30) * 100}%` }} />
        <span className="absolute top-0 h-full w-0.5 bg-line-strong" style={{ left: "60%" }} /><span className="absolute top-0 h-full w-0.5 bg-line-strong" style={{ left: "80%" }} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...t.th("n")} numeric className="px-2 py-1.5">#</SortTh><SortTh {...t.th("label")} className="px-2 py-1.5">Criterion</SortTh>
            <SortTh {...t.th("pts")} numeric className="px-2 py-1.5 text-center">Pts</SortTh><SortTh {...t.th("why")} className="px-2 py-1.5">Reads as</SortTh>
            <SortTh {...t.th("structural")} className="px-2 py-1.5">Type</SortTh></tr></thead>
          <tbody>{t.rows.map((r) => (
            <tr key={r.n} className="border-b">
              <td className="num px-2 py-2 text-muted-foreground">{r.n}</td>
              <td className="px-2 py-2">{r.label}</td>
              <td className="px-2 py-2 text-center">{r.info
                ? (r.info.signal ? <span className={cn("rounded-full px-1.5 py-px text-xs font-semibold whitespace-nowrap uppercase", r.info.signal === "BUYING" ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail")}>{TERM_SIGNAL_LABEL[r.info.signal]}</span> : <span className="text-xs text-muted-foreground">–</span>)
                : <b className={cn("num inline-flex size-7 items-center justify-center rounded-md font-semibold", r.pts == null ? "bg-empty-soft text-empty" : PTS[r.pts])}>{r.pts ?? "–"}</b>}</td>
              <td className="px-2 py-2 text-xs text-muted-foreground">{r.info ? (r.info.answered ? r.info.text : "Not captured: send the niche from Opportunity Explorer") : r.pts == null ? "Not scored" : r.why[r.pts]}</td>
              <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground">{r.info ? "reads only" : r.structural ? "structural" : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={cn("mt-3.5 rounded-xl border px-4 py-3.5", ev.v.cls === "empty" ? "bg-surface-2" : cn(TONE[ev.v.cls].soft, TONE[ev.v.cls].border))}>
        <b className="mb-0.5 block font-heading text-base">{ev.v.title}</b>
        <p className="text-sm text-ink-2">{ev.v.text}</p>
        {ev.waivedLine && <p className="mt-1.5 text-sm font-medium text-warn">{ev.waivedLine}.</p>}
      </div>
    </section>
  );
}

export function WaivedChip({ waiver }: { waiver: Waiver }) {
  return <span title={`Waived: ${waiver.reason}`} className="cursor-help rounded bg-warn-soft px-1.5 py-px text-xs font-semibold tracking-wide text-warn uppercase">Waived</span>;
}

/**
 * One check: its own pass / warn / fail, struck through when a waiver counts it as a pass (the
 * reason on hover). Failed and warned checks can be waived; waived ones un-waived.
 */
export function CheckRow({ row: r, gate, gateWaived, onWaive, onUnwaive }: { row: GateResult["rows"][number]; gate: GateDef; gateWaived: boolean; onWaive: (reason: string) => Promise<void>; onUnwaive: (w: Waiver) => void }) {
  const waivable = r.status === "fail" || r.status === "warn";
  // Waived on its own (not only under a whole-gate waiver): it can be removed here.
  const own = r.waiver && r.waiver.check_label != null ? r.waiver : null;
  return (
    <div className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-t px-3 py-2 text-sm first:border-t-0">
      <span className={cn("flex size-[18px] items-center justify-center rounded-full text-xs font-bold", CHECK_BG[r.status], r.waiver && "opacity-60")}>{r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : r.status === "warn" ? "!" : "·"}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className={cn(r.waiver && cn("line-through decoration-2", TONE[r.status].text))} title={r.waiver ? `Waived: ${r.waiver.reason}` : undefined}>{r.label}</span>
        {r.waiver && <WaivedChip waiver={r.waiver} />}
      </span>
      <span className="flex items-center gap-2">
        <span className="num text-xs whitespace-nowrap text-muted-foreground">{r.detail}</span>
        {own ? <TextButton className="text-xs font-medium" onClick={() => onUnwaive(own)}>Remove waiver</TextButton>
          : waivable && !r.waiver && !gateWaived && (
            <WaivePopover title={`Waive “${r.label}” (Gate ${gate.n})`} onWaive={onWaive}
              trigger={<TextButton className="text-xs font-medium">Waive</TextButton>} />
          )}
      </span>
    </div>
  );
}

/** Every waiver on the candidate, with its reason and date; one no longer needed says so. */
export function WaiversPanel({ waivers, ev, onUnwaive }: { waivers: Waiver[]; ev: Evaluation; onUnwaive: (w: Waiver) => void }) {
  const inEffect = (w: Waiver) => (w.check_label == null ? true : ev.waived.some((x) => x.waiver.id === w.id));
  const gateOf = (w: Waiver) => ev.gates.find((x) => x.g.id === w.gate_id)?.g;
  const t = useSortable("pl.waivers", waivers, {
    gate: { value: (w) => { const g = gateOf(w); return g ? `${g.n} · ${g.title}` : w.gate_id; }, kind: "text" },
    check: { value: (w) => w.check_label ?? "Whole gate", kind: "text" },
    reason: { value: (w) => w.reason, kind: "text" },
    waived: { value: (w) => w.created_at, kind: "date" },
  });
  if (!waivers.length) return null;
  return (
    <section className="panel p-4">
      <h2 className="mb-1 font-heading text-base font-bold">Waivers</h2>
      <p className="mb-3 text-xs text-muted-foreground">Each waived check counts as a pass for its gate. The scorecard isn&apos;t affected, and the verdict lists every waived check.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...t.th("gate")} className="px-2 py-1.5">Gate</SortTh><SortTh {...t.th("check")} className="px-2 py-1.5">Check</SortTh>
            <SortTh {...t.th("reason")} className="px-2 py-1.5">Reason</SortTh><SortTh {...t.th("waived")} numeric className="px-2 py-1.5">Waived</SortTh><th /></tr></thead>
          <tbody>{t.rows.map((w) => {
            const g = gateOf(w);
            return (
              <tr key={w.id} className="border-b last:border-b-0 align-top">
                <td className="px-2 py-2 whitespace-nowrap">{g ? `${g.n} · ${g.title}` : w.gate_id}</td>
                <td className="px-2 py-2">{w.check_label ?? <em>Whole gate</em>}{!inEffect(w) && <span className="block text-xs text-muted-foreground">Passes now: the waiver isn&apos;t needed</span>}</td>
                <td className="px-2 py-2 text-muted-foreground">{w.reason}</td>
                <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{new Date(w.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-2 py-2 text-right"><TextButton className="text-xs font-medium" onClick={() => onUnwaive(w)}>Remove waiver</TextButton></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

type PoeTerm = NonNullable<CandidateDetail["poe"]>["search_terms"][number];

/** Gate 5: the niche's top search terms; long-tail rows (300–2,000 a month) highlighted. */
export function SearchTermsTable({ terms, captured }: { terms: PoeTerm[]; captured: number }) {
  const t = useSortable("pl.searchTerms", terms, {
    term: { value: (x) => x.term, kind: "text" },
    volume: { value: (x) => x.volume, kind: "number" },
    clickShare: { value: (x) => x.click_share, kind: "number" },
    conversion: { value: (x) => x.conversion, kind: "number" },
  });
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
          <SortTh {...t.th("term")} className="px-2 py-1.5">Search term</SortTh><SortTh {...t.th("volume")} numeric className="px-2 py-1.5 text-right">Searches / mo</SortTh>
          <SortTh {...t.th("clickShare")} numeric className="px-2 py-1.5 text-right">Click share</SortTh><SortTh {...t.th("conversion")} numeric className="px-2 py-1.5 text-right">Conversion</SortTh></tr></thead>
        <tbody>{t.rows.map((x) => (
          <tr key={x.term} className={cn("border-b last:border-b-0", x.volume >= 300 && x.volume <= 2000 && "bg-brand-soft/40")}>
            <td className="px-2 py-1.5">{x.term}</td><td className="num px-2 py-1.5 text-right">{n0(x.volume)}</td>
            <td className="num px-2 py-1.5 text-right">{x.click_share == null ? "—" : `${x.click_share}%`}</td><td className="num px-2 py-1.5 text-right">{x.conversion == null ? "—" : `${x.conversion}%`}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">{captured} terms captured; highlighted rows are long-tail (300–2,000 a month).</p>
    </div>
  );
}

/** Gate 4: every page-one listing, with a link to each one's critical reviews. */
export function CriticalReviewsTable({ asins }: { asins: CandidateDetail["asins"] }) {
  const t = useSortable("pl.criticalReviews", asins, {
    listing: { value: (a) => a.asin, kind: "text" },
    rating: { value: (a) => a.rating, kind: "number" },
    reviews: { value: (a) => a.review_count, kind: "number" },
  });
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
          <SortTh {...t.th("listing")} className="px-2 py-1.5">Listing</SortTh><SortTh {...t.th("rating")} numeric className="px-2 py-1.5 text-right">Rating</SortTh>
          <SortTh {...t.th("reviews")} numeric className="px-2 py-1.5 text-right">Reviews</SortTh><th className="px-2 py-1.5">1–3★ reviews</th></tr></thead>
        <tbody>{t.rows.map((a) => (
          <tr key={a.asin} className="border-b last:border-b-0">
            <td className="px-2 py-1.5"><span className="num text-xs">{a.asin}</span> <span className="text-xs text-muted-foreground">{a.brand ?? ""}</span></td>
            <td className="num px-2 py-1.5 text-right">{a.rating?.toFixed(1) ?? "—"}</td>
            <td className="num px-2 py-1.5 text-right">{n0(a.review_count)}</td>
            <td className="px-2 py-1.5">
              <a className="link inline-flex items-center gap-1 text-xs font-medium" target="_blank" rel="noreferrer"
                href={`https://www.amazon.co.uk/product-reviews/${a.asin}/?filterByStar=critical&sortBy=recent&reviewerType=all_reviews`}>Read the critical reviews <ExternalLinkIcon className="size-3" /></a>
            </td>
          </tr>
        ))}</tbody>
      </table>
      <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">Keepa carries the rating and review count but not the star breakdown: Amazon&apos;s critical filter shows the 1–3★ reviews.</p>
    </div>
  );
}
