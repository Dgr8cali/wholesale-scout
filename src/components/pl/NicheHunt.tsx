"use client";

import { ChevronRightIcon, CrosshairIcon, ExternalLinkIcon, LoaderIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { ProductThumb } from "@/components/ProductThumb";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/pl/gatekeeper";
import { AVOID_CATEGORY_NAMES, CAP_MAX, huntEstimate, opportunityExplorerUrl, type Niche, type NicheHuntFilters, type Shape } from "@/lib/pl/hunt";
import { priceOf } from "@/lib/pl/fill";
import { api } from "@/lib/ui/client";
import { ago } from "@/lib/ui/when";
import { cn } from "@/lib/utils";

interface Start {
  categories: { id: number; name: string; products: number | null }[];
  defaults: NicheHuntFilters;
  presets: { id: string; name: string; filters: NicheHuntFilters }[];
  dismissals: { key: string; name: string | null; reason: string | null; created_at: string }[];
  lastHuntId: string | null;
  tokensLeft: number | null;
  keepa: boolean;
  hunts: { id: string; name: string; finder_total: number | null; fetched: number; reused: number; token_cost: number; created_at: string }[];
}
interface HuntResult {
  hunt: { id: string; name: string; filters: NicheHuntFilters; asins: string[]; finder_total: number | null; fetched: number; reused: number; finder_tokens: number; detail_tokens: number; token_cost: number; created_at: string };
  niches: Niche[];
  qualifying: number;
  incumbents: number;
}

const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const SHAPE: Record<Shape, { label: string; cls: string; title: string }> = {
  open: { label: "Open", cls: "bg-pass-soft text-pass", title: "No ASIN over 1,000 reviews" },
  contested: { label: "Contested", cls: "bg-warn-soft text-warn", title: "One ASIN over 1,000 reviews" },
  dominated: { label: "Dominated", cls: "bg-fail-soft text-fail", title: "Two or more ASINs over 1,000 reviews, or one over 5,000" },
};

/** Niche Hunt: Product Finder hunts for products that pass Gates 0 and 1, grouped into niches. */
export function NicheHunt({ onCandidate }: { onCandidate: (id: string) => void }) {
  const [start, setStart] = useState<Start | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<NicheHuntFilters | null>(null);
  const [result, setResult] = useState<HuntResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>("");
  const { prompt, confirm } = useDialogs();

  const loadHunt = async (id: string) => {
    try {
      setResult(await api<HuntResult>(`/api/pl/hunt/${id}?minAsins=1`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  useEffect(() => {
    api<Start>("/api/pl/hunt").then((s) => {
      setStart(s);
      setF(s.defaults);
      if (s.lastHuntId) api<HuntResult>(`/api/pl/hunt/${s.lastHuntId}?minAsins=1`).then(setResult).catch(() => {});
    }).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorState title="Couldn't load Niche Hunt" message={error} />;
  if (!start || !f) return <Skeleton className="h-96 rounded-xl" />;
  const set = (p: Partial<NicheHuntFilters>) => setF({ ...f, ...p });
  const est = huntEstimate(f.cap);
  const short = start.tokensLeft != null && start.tokensLeft < est.total;

  const run = async () => {
    setBusy("run");
    try {
      const r = await api<HuntResult & { exhausted: boolean }>("/api/pl/hunt", { method: "POST", json: { filters: f } });
      await loadHunt(r.hunt.id);
      const s = await api<Start>("/api/pl/hunt");
      setStart(s);
      toast.success(`Hunt done: ${r.hunt.finder_total?.toLocaleString("en-GB") ?? "?"} found, ${r.hunt.asins.length} taken, ${r.hunt.fetched} fetched, ${r.hunt.reused} reused, ${r.hunt.token_cost} tokens.${r.exhausted ? " Keepa ran out of tokens: some weren't fetched." : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const savePreset = async () => {
    const name = await prompt({ title: "Save filters as a preset", label: "Preset name", confirmLabel: "Save" });
    if (!name) return;
    try {
      await api("/api/pl/hunt/presets", { method: "POST", json: { name, filters: f } });
      setStart(await api<Start>("/api/pl/hunt"));
      toast.success(`Saved “${name}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const deletePreset = async (id: string, name: string) => {
    if (!(await confirm({ title: `Delete the preset “${name}”?`, confirmLabel: "Delete", destructive: true }))) return;
    await api(`/api/pl/hunt/presets?id=${id}`, { method: "DELETE" });
    setStart(await api<Start>("/api/pl/hunt"));
  };

  return (
    <div className="space-y-4">
      <section className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="section-label">Hunt filters</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">Defaults from Gatekeeper&apos;s Gate 0 and Gate 1. The finder checks price, rating, rank, Amazon now, package size, listing age, category and Amazon brands. Rank drops, Amazon in the last 90 days, the exact parcel fit and reviews are checked on each product&apos;s detail. Products over the review cap stay in their niche as the incumbents to beat.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {start.presets.length > 0 && (
              <NativeSelect className="w-48" value={preset} onChange={(e) => { const p = start.presets.find((x) => x.id === e.target.value); setPreset(p?.id ?? ""); if (p) { setF({ ...start.defaults, ...p.filters }); toast.success(`Loaded “${p.name}”`); } }}>
                <NativeSelectOption value="">Load a preset…</NativeSelectOption>
                {start.presets.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
              </NativeSelect>
            )}
            {preset && <Button variant="ghost" size="sm" className="text-fail hover:text-fail" onClick={() => { const p = start.presets.find((x) => x.id === preset); if (p) deletePreset(p.id, p.name).then(() => setPreset("")); }}><Trash2Icon /> Delete preset</Button>}
            <Button variant="outline" size="sm" onClick={savePreset}><SaveIcon /> Save as preset</Button>
            <Button variant="ghost" size="sm" onClick={() => setF(start.defaults)}>Reset to defaults</Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Num label="Min price (£)" value={f.priceMin} onChange={(v) => set({ priceMin: v })} step={0.5} />
          <Num label="Max price (£)" value={f.priceMax} onChange={(v) => set({ priceMax: v })} step={0.5} />
          <Num label="Max reviews (qualifying)" value={f.maxReviews} onChange={(v) => set({ maxReviews: v })} step={50} />
          <Num label="Min rating" value={f.ratingMin} onChange={(v) => set({ ratingMin: v })} step={0.1} />
          <Num label="Max rating" value={f.ratingMax} onChange={(v) => set({ ratingMax: v })} step={0.1} />
          <Num label="Min rank drops, 90 days" value={f.minRankDrops90} onChange={(v) => set({ minRankDrops90: v })} step={10} hint="≈ sales a month × 3" />
          <Num label="Max 90-day rank" value={f.maxRank90} onChange={(v) => set({ maxRank90: v })} step={5000} hint="The finder's pre-filter" />
          <Num label="Max package weight (g)" value={f.maxWeightG} onChange={(v) => set({ maxWeightG: v })} step={50} />
          <Num label="Listed at least (months)" value={f.minListedMonths} onChange={(v) => set({ minListedMonths: v })} />
          <Num label={`ASINs to fetch (50–${CAP_MAX})`} value={f.cap} onChange={(v) => set({ cap: v })} step={50} hint="The real cost" />
          <Num label="Min qualifying ASINs a niche" value={f.minAsins} onChange={(v) => set({ minAsins: v })} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Toggle label="No Amazon offer, now or in the last 90 days" checked={f.noAmazon} onChange={(v) => set({ noAmazon: v })} />
          <Toggle label="Small parcel (35 × 25 × 12 cm) when Keepa has the size" checked={f.smallParcel} onChange={(v) => set({ smallParcel: v })} />
          <Toggle label="Leave out Amazon's own brands" checked={f.excludeAmazonBrands} onChange={(v) => set({ excludeAmazonBrands: v })} />
        </div>
        <div className="space-y-1.5">
          <span className="field-label">Categories (the category a product ranks in)</span>
          <div className="flex flex-wrap gap-1.5">
            {start.categories.map((c) => {
              const on = f.categories.includes(c.id);
              const avoid = AVOID_CATEGORY_NAMES.includes(c.name);
              return (
                <button key={c.id} type="button" onClick={() => set({ categories: on ? f.categories.filter((x) => x !== c.id) : [...f.categories, c.id] })}
                  title={avoid ? "A Gate 0 avoid category: off by default" : undefined}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-brand bg-brand-soft font-medium text-brand" : "text-muted-foreground hover:bg-surface-2", avoid && !on && "border-dashed")}>
                  {c.name}{avoid ? " · avoid" : ""}
                </button>
              );
            })}
            {!start.categories.length && <span className="text-xs text-muted-foreground">No categories yet: the wholesale Hunt page&apos;s “Load categories” fetches them (1 token).</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button onClick={run} disabled={!!busy || !start.keepa || !f.categories.length || short}>
            {busy === "run" ? <LoaderIcon className="animate-spin" /> : <CrosshairIcon />} Hunt niches
          </Button>
          <span className="text-sm text-muted-foreground">
            Up to <b className="num text-foreground">{est.total}</b> tokens: finder {est.finder}, detail up to {est.detail} ({f.cap} ASINs × ~2; any fetched in the last 7 days are reused free).
            {start.tokensLeft != null && <> Balance <span className="num">{start.tokensLeft.toLocaleString("en-GB")}</span>.</>}
            {short && <span className="text-fail"> Not enough tokens: lower the cap or wait for the refill.</span>}
          </span>
        </div>
      </section>

      {result ? <Results result={result} start={start} onReload={() => loadHunt(result.hunt.id)} onPick={loadHunt} onCandidate={onCandidate}
        onStart={async () => setStart(await api<Start>("/api/pl/hunt"))} /> : (
        <EmptyState icon={<CrosshairIcon />} title="No hunt yet">Set the filters and click Hunt niches. Niches with enough qualifying products appear here, best-selling first.</EmptyState>
      )}
    </div>
  );
}

function Num({ label, value, onChange, step, hint }: { label: string; value: number; onChange: (n: number) => void; step?: number; hint?: string }) {
  return (
    <label className="space-y-1">
      <span className="field-label">{label}</span>
      <Input className="num" type="number" step={step ?? 1} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
      {hint && <span className="block text-2xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2"><Switch checked={checked} onCheckedChange={onChange} /> {label}</label>;
}

function Results({ result, start, onReload, onPick, onCandidate, onStart }: {
  result: HuntResult; start: Start; onReload: () => void; onPick: (id: string) => void; onCandidate: (id: string) => void; onStart: () => void;
}) {
  const [shape, setShape] = useState<"" | Shape>("");
  const [minCount, setMinCount] = useState(result.hunt.filters.minAsins ?? 3);
  const [sort, setSort] = useState<"sales" | "count" | "price">("sales");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const { prompt } = useDialogs();
  const h = result.hunt;

  const rows = useMemo(() => result.niches
    .filter((n) => n.count >= minCount && (!shape || n.shape === shape))
    .sort((a, b) => (sort === "count" ? b.count - a.count : sort === "price" ? (a.medianPrice ?? 0) - (b.medianPrice ?? 0) : b.salesSum - a.salesSum)), [result, minCount, shape, sort]);
  const smaller = result.niches.filter((n) => n.count < minCount).length;

  const create = async (n: Niche) => {
    setBusy(n.key);
    try {
      const r = await api<{ candidate: { id: string; name: string }; refresh: { tokensUsed: number; reused: string[]; fetched: string[] } }>(`/api/pl/hunt/${h.id}/candidate`, { method: "POST", json: { key: n.key } });
      toast.success(`Candidate “${r.candidate.name}” created: ${r.refresh.reused.length} ASIN${r.refresh.reused.length === 1 ? "" : "s"} from the hunt, ${r.refresh.fetched.length} fetched, ${r.refresh.tokensUsed} token${r.refresh.tokensUsed === 1 ? "" : "s"}.`);
      onCandidate(r.candidate.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const dismiss = async (n: Niche) => {
    const reason = await prompt({ title: `Dismiss “${n.name}”?`, label: "Reason", description: "It won't show in this or any later hunt. Undo it under Dismissed niches.", confirmLabel: "Dismiss" });
    if (reason === null) return; // cancelled (or no reason given)
    try {
      await api("/api/pl/hunt/dismissals", { method: "POST", json: { key: n.key, name: n.name, reason } });
      onReload();
      onStart();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const undismiss = async (key: string) => {
    await api(`/api/pl/hunt/dismissals?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    onReload();
    onStart();
  };
  const toggle = (k: string) => setOpen((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });

  return (
    <section className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-label">Niches</h2>
          <p className="text-sm text-muted-foreground">
            {h.name} · {ago(h.created_at)} · {h.finder_total?.toLocaleString("en-GB") ?? "?"} found, {h.asins.length} taken ({h.fetched} fetched, {h.reused} reused) · <b className="text-foreground">{h.token_cost} tokens</b> · {result.qualifying} qualifying ASINs, {result.incumbents} incumbents
          </p>
        </div>
        {start.hunts.length > 1 && (
          <NativeSelect className="w-72" value={h.id} onChange={(e) => onPick(e.target.value)}>
            {start.hunts.map((x) => <NativeSelectOption key={x.id} value={x.id}>{new Date(x.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {x.token_cost} tokens · {x.name.replace(/^Niche Hunt · /, "")}</NativeSelectOption>)}
          </NativeSelect>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Shape</span>
          <NativeSelect value={shape} onChange={(e) => setShape(e.target.value as "" | Shape)}>
            <NativeSelectOption value="">Any</NativeSelectOption><NativeSelectOption value="open">Open</NativeSelectOption><NativeSelectOption value="contested">Contested</NativeSelectOption><NativeSelectOption value="dominated">Dominated</NativeSelectOption>
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">At least … qualifying ASINs</span>
          <Input className="num w-28" type="number" min={1} value={minCount} onChange={(e) => setMinCount(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="space-y-1"><span className="field-label">Sort</span>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <NativeSelectOption value="sales">Sales a month, most first</NativeSelectOption><NativeSelectOption value="count">Qualifying ASINs</NativeSelectOption><NativeSelectOption value="price">Median price</NativeSelectOption>
          </NativeSelect></label>
      </div>

      {!rows.length ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted-foreground">
          No niche has {minCount}+ qualifying ASINs{shape ? ` and is ${shape}` : ""}.{smaller ? ` ${smaller} smaller niche${smaller === 1 ? "" : "s"}: lower "At least" to see ${smaller === 1 ? "it" : "them"}.` : ""} A hunt over a whole category spreads across many niches: a larger ASIN cap or fewer categories gives clusters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-1.5">Niche</th><th className="px-2 py-1.5 text-right">ASINs</th><th className="px-2 py-1.5 text-right">Median price</th><th className="px-2 py-1.5 text-right">Median reviews</th>
              <th className="px-2 py-1.5 text-right">Median rating</th><th className="px-2 py-1.5 text-right">Sales / mo</th><th className="px-2 py-1.5 text-right">Max reviews</th><th className="px-2 py-1.5">Shape</th><th />
            </tr></thead>
            <tbody>
              {rows.map((n) => (
                <Fragment key={n.key}>
                  <tr className="border-b align-middle">
                    <td className="px-2 py-2">
                      <button type="button" className="flex items-center gap-1.5 text-left font-medium" onClick={() => toggle(n.key)}>
                        <ChevronRightIcon className={cn("size-4 flex-none text-muted-foreground transition-transform", open.has(n.key) && "rotate-90")} />{n.name}
                      </button>
                      <span className="pl-6 text-xs text-muted-foreground">{n.rootCategory ?? ""}</span>
                    </td>
                    <td className="num px-2 py-2 text-right">{n.count}{n.asins.length > n.count ? <span className="text-muted-foreground"> +{n.asins.length - n.count}</span> : null}</td>
                    <td className="num px-2 py-2 text-right">{money(n.medianPrice)}</td>
                    <td className="num px-2 py-2 text-right">{n0(n.medianReviews)}</td>
                    <td className="num px-2 py-2 text-right">{n.medianRating?.toFixed(1) ?? "—"}</td>
                    <td className="num px-2 py-2 text-right" title={n.salesFloorCount ? `${n.salesFloorCount} fast seller${n.salesFloorCount === 1 ? "" : "s"} without Amazon's bought-past-month: rank drops undercount them, so this is a floor` : undefined}>
                      {n.salesFloorCount ? "≥ " : ""}{n0(n.salesSum)}
                    </td>
                    <td className="num px-2 py-2 text-right">{n0(n.maxReviews)}</td>
                    <td className="px-2 py-2"><span title={SHAPE[n.shape].title} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", SHAPE[n.shape].cls)}>{SHAPE[n.shape].label}</span></td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <Button size="xs" onClick={() => create(n)} disabled={!!busy}>{busy === n.key ? <LoaderIcon className="animate-spin" /> : <PlusIcon />} Create candidate</Button>
                        <a className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" href={opportunityExplorerUrl(n.name)} target="_blank" rel="noreferrer">Opportunity Explorer <ExternalLinkIcon className="size-3" /></a>
                        <button type="button" className="text-xs text-muted-foreground hover:text-fail" onClick={() => dismiss(n)} title="Dismiss niche"><Trash2Icon className="size-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                  {open.has(n.key) && (
                    <tr className="border-b bg-surface-2/50"><td colSpan={9} className="px-2 py-2">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-[10.5px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1">Listing</th><th className="px-2 py-1 text-right">Price</th><th className="px-2 py-1 text-right">Reviews</th><th className="px-2 py-1 text-right">Rating</th><th className="px-2 py-1 text-right">Rank</th><th className="px-2 py-1 text-right">Sales / mo</th><th className="px-2 py-1">Status</th></tr></thead>
                        <tbody>{n.asins.map((a) => (
                          <tr key={a.asin} className="border-t">
                            <td className="px-2 py-1.5">
                              <div className="flex w-[min(30rem,50vw)] items-center gap-2">
                                <ProductThumb url={a.snap.image} asin={a.asin} title={a.snap.title} brand={a.snap.brand} size={32} />
                                <div className="min-w-0"><div className="truncate font-medium" title={a.snap.title ?? ""}>{a.snap.title}</div>
                                  <div className="num text-muted-foreground"><a className="hover:underline" href={`https://www.amazon.co.uk/dp/${a.asin}`} target="_blank" rel="noreferrer">{a.asin}</a>{a.snap.brand ? ` · ${a.snap.brand}` : ""}</div></div>
                              </div>
                            </td>
                            <td className="num px-2 py-1.5 text-right">{money(priceOf(a.snap))}</td>
                            <td className="num px-2 py-1.5 text-right">{n0(a.snap.review_count)}</td>
                            <td className="num px-2 py-1.5 text-right">{a.snap.rating?.toFixed(1) ?? "—"}</td>
                            <td className="num px-2 py-1.5 text-right">{n0(a.snap.avg_rank_90d)}</td>
                            <td className="num px-2 py-1.5 text-right">{a.salesFloor ? "≥ " : ""}{n0(a.sales)}</td>
                            <td className="px-2 py-1.5">{a.qualifies ? <span className="text-pass">qualifies</span> : a.incumbent ? <span className="text-warn">incumbent (over the review cap)</span> : <span className="text-muted-foreground">{a.reasons.join(", ")}</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {start.dismissals.length > 0 && (
        <div className="text-sm">
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setShowDismissed((v) => !v)}>{showDismissed ? "Hide" : "Show"} dismissed niches ({start.dismissals.length})</button>
          {showDismissed && (
            <ul className="mt-2 space-y-1">{start.dismissals.map((d) => (
              <li key={d.key} className="flex items-center gap-2 text-xs">
                <span className="font-medium">{d.name ?? d.key}</span><span className="text-muted-foreground">{d.reason ?? ""} · {ago(d.created_at)}</span>
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => undismiss(d.key)}>Show again</button>
              </li>
            ))}</ul>
          )}
        </div>
      )}
    </section>
  );
}
