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
import { AVOID_CATEGORY_NAMES, LIMITS, TOKEN_RESERVE, WEIGHT_FILTER_UNKNOWN, type HuntEstimate, type Niche, type NicheHuntFilters, type Shape } from "@/lib/pl/hunt";
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
interface HuntLeaf { id: number; name: string; products: number | null; matches?: number; finderTokens?: number; cached?: boolean; skipped?: boolean; detail?: boolean; detailed?: boolean; fetched?: number; reused?: number }
type HuntStatus = "listing" | "sizing" | "finding" | "detailing" | "done" | "error" | "cancelled";
interface Plan { estimate: HuntEstimate; balance: number | null; fits: boolean; fittingDetailLeaves: number | null; leavesKnown: boolean; leavesWanted: number; sizingCapped: boolean; cap: number; waitsForRefill: boolean }
interface HuntResult {
  hunt: {
    id: string; name: string; filters: NicheHuntFilters; asins: string[]; finder_total: number | null; fetched: number; reused: number; finder_tokens: number; detail_tokens: number;
    token_cost: number; created_at: string; status: HuntStatus; leaves: HuntLeaf[] | null; note: string | null; finished_at: string | null;
    progress?: { pages?: Record<string, number>; detailIndex?: number; cap?: number; estimate?: HuntEstimate; incumbents?: Record<string, string[]> } | null;
  };
  niches: Niche[];
  qualifying: number;
  near: number;
  incumbents: number;
  funnel: { start: number; steps: { label: string; removed: number; near: number; unknown?: number }[]; incumbents: number; near: number; qualifying: number };
}

const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const running = (s: HuntStatus) => s === "listing" || s === "sizing" || s === "finding" || s === "detailing";
const OE_URL = "https://sellercentral.amazon.co.uk/opportunity-explorer";

/** "Sizing leaves 23/60 → Detailing 4/15": where a hunt has got to. */
function progressLine(h: HuntResult["hunt"]): string {
  if (h.status === "listing") return "Listing the leaf categories…";
  if (!h.leaves) {
    // Direct mode: finder pages per root, then detail.
    const pages = Object.values(h.progress?.pages ?? {});
    const done = pages.reduce((a, p) => a + (p === -1 ? h.filters.pagesPerRoot : p), 0);
    const finding = `Finder pages ${done}/${h.filters.categories.length * h.filters.pagesPerRoot} (${h.asins.length} ASINs)`;
    if (h.status === "finding") return `${finding} → Detailing`;
    return `${finding} → Detailing ${Math.min(h.progress?.detailIndex ?? 0, h.asins.length)}/${h.asins.length}`;
  }
  const leaves = h.leaves ?? [];
  const sized = leaves.filter((l) => l.matches != null || l.skipped).length, picked = leaves.filter((l) => l.detail).length, detailed = leaves.filter((l) => l.detailed).length;
  const size = `Sizing leaves ${sized}/${leaves.length}`;
  if (h.status === "sizing") return `${size} → Detailing`;
  return `${size} → Detailing ${detailed}/${picked}`;
}

/** Amazon doesn't take a search in the address: copy the niche name, open Opportunity Explorer. */
async function openInPoe(name: string) {
  try {
    await navigator.clipboard.writeText(name);
    toast.success(`Niche name copied — paste into the POE search box ("${name}")`);
  } catch {
    toast.message(`Couldn't copy: search for "${name}" in POE`);
  }
  window.open(OE_URL, "_blank", "noopener");
}
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
  const [plan, setPlan] = useState<Plan | null>(null);
  const { prompt, confirm } = useDialogs();

  const loadHunt = async (id: string) => {
    try {
      setResult(await api<HuntResult>(`/api/pl/hunt/${id}?minAsins=1`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  // The estimate follows the filters (free to ask): both stages against the balance less the reserve.
  useEffect(() => {
    if (!f) return;
    const t = setTimeout(() => {
      api<Plan>("/api/pl/hunt/estimate", { method: "POST", json: { filters: f } }).then(setPlan).catch(() => setPlan(null));
    }, 400);
    return () => clearTimeout(t);
  }, [f]);
  // A running hunt: poll its progress until it's done.
  const huntId = result?.hunt.id, huntRunning = result ? running(result.hunt.status) : false;
  useEffect(() => {
    if (!huntId || !huntRunning) return;
    const t = setInterval(() => {
      api<HuntResult>(`/api/pl/hunt/${huntId}?minAsins=1`).then((r) => {
        setResult(r);
        if (!running(r.hunt.status)) api<Start>("/api/pl/hunt").then(setStart).catch(() => {});
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [huntId, huntRunning]);

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
  const busyHunt = result ? running(result.hunt.status) : false;

  const run = async () => {
    setBusy("run");
    try {
      const res = await fetch("/api/pl/hunt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filters: f }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.plan) { setPlan(body.plan); toast.error(body.error); return; }
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      await loadHunt(body.id);
      setStart(await api<Start>("/api/pl/hunt"));
      toast.success("Hunt started: it runs in the background, you can leave the page.");
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
            <p className="max-w-3xl text-sm text-muted-foreground">Defaults from Gate 0 and Gate 1, qualifying on the warn band (£15–40, rating 3.6–4.5); the candidate scorecard judges on the pass band. {f.mode === "direct"
              ? "Direct: one Keepa query per category with every threshold Keepa can check itself (price, rating, reviews, sales a month, no Amazon, listing age, Amazon brands), best rank drops first; then each product's detail is checked (Amazon in 90 days, weight, parcel size) and grouped by its leaf category."
              : "Leaf: each leaf category is sized with wide filters, then the most promising leaves are detailed and qualified. Products over the review cap stay in their niche as the incumbents to beat."}</p>
            <div className="flex gap-1 pt-1" role="radiogroup" aria-label="Hunt mode">
              {(["direct", "leaf"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={f.mode === m} onClick={() => set({ mode: m })}
                  className={cn("rounded-md border px-3 py-1 text-sm", f.mode === m ? "border-brand bg-brand-soft font-medium text-brand" : "text-muted-foreground hover:bg-surface-2")}>
                  {m === "direct" ? "Direct (one query per category)" : "Leaf by leaf"}
                </button>
              ))}
            </div>
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
        <div className="grid gap-4 lg:grid-cols-2">
          {f.mode === "direct" ? (
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">Direct query <span className="font-normal text-muted-foreground">(Keepa applies the qualifying thresholds itself)</span></legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num label={`Pages a category (1–${LIMITS.pagesPerRoot})`} value={f.pagesPerRoot} onChange={(v) => set({ pagesPerRoot: v })} hint="50 ASINs a page, most rank drops first, 11 tokens" />
              <Num label="Listed at least (months)" value={f.minListedMonths} onChange={(v) => set({ minListedMonths: v })} />
              <Num label={`Niches to check for incumbents (0–${LIMITS.incumbentNiches})`} value={f.incumbentNiches} onChange={(v) => set({ incumbentNiches: v })} hint="Those with 3+ qualifying, ~31 tokens each" />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Toggle label="No Amazon offer (now; 90 days when qualifying)" checked={f.noAmazon} onChange={(v) => set({ noAmazon: v })} />
              <Toggle label="Leave out Amazon's own brands" checked={f.excludeAmazonBrands} onChange={(v) => set({ excludeAmazonBrands: v })} />
            </div>
            <p className="text-xs text-muted-foreground">Keepa checks price, rating, reviews (at most the cap), sales a month (Amazon&apos;s &quot;bought in past month&quot;, at least rank drops ÷ 3), package weight up to 700 g, no Amazon offer, listing age and brands. Its weight filter leaves out products whose weight it doesn&apos;t know (about 0.4%). Because reviews are capped in the query, each niche with 3+ qualifying products then gets an <b>incumbent check</b>: its leaf&apos;s 10 best sellers over the review cap, any price, so its shape and max reviews are real.</p>
          </fieldset>
          ) : (
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">Finder filters <span className="font-normal text-muted-foreground">(wide — what Keepa searches)</span></legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num label="Min price (£)" value={f.finderPriceMin} onChange={(v) => set({ finderPriceMin: v })} step={0.5} />
              <Num label="Max price (£)" value={f.finderPriceMax} onChange={(v) => set({ finderPriceMax: v })} step={0.5} />
              <Num label="Max 90-day rank" value={f.maxRank90} onChange={(v) => set({ maxRank90: v })} step={5000} />
              <Num label="Min rating" value={f.finderRatingMin} onChange={(v) => set({ finderRatingMin: v })} step={0.1} />
              <Num label="Max rating" value={f.finderRatingMax} onChange={(v) => set({ finderRatingMax: v })} step={0.1} />
              <Num label="Listed at least (months)" value={f.minListedMonths} onChange={(v) => set({ minListedMonths: v })} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Toggle label="No Amazon offer (now; 90 days when qualifying)" checked={f.noAmazon} onChange={(v) => set({ noAmazon: v })} />
              <Toggle label="Leave out Amazon's own brands" checked={f.excludeAmazonBrands} onChange={(v) => set({ excludeAmazonBrands: v })} />
            </div>
            <p className="text-xs text-muted-foreground">No weight or size filter here: Keepa often lacks them, and the finder would drop those products. They&apos;re checked when qualifying.</p>
          </fieldset>
          )}
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">Qualifying thresholds <span className="font-normal text-muted-foreground">(strict — what counts as page-one material)</span></legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num label="Min price (£)" value={f.priceMin} onChange={(v) => set({ priceMin: v })} step={0.5} />
              <Num label="Max price (£)" value={f.priceMax} onChange={(v) => set({ priceMax: v })} step={0.5} />
              <Num label="Max reviews" value={f.maxReviews} onChange={(v) => set({ maxReviews: v })} step={50} hint="Over it: an incumbent" />
              <Num label="Min rating" value={f.ratingMin} onChange={(v) => set({ ratingMin: v })} step={0.1} />
              <Num label="Max rating" value={f.ratingMax} onChange={(v) => set({ ratingMax: v })} step={0.1} />
              <Num label="Min rank drops, 90 days" value={f.minRankDrops90} onChange={(v) => set({ minRankDrops90: v })} step={10} hint="÷ 3 = sales a month; fast sellers by bought-past-month" />
              <Num label="Max package weight (g)" value={f.maxWeightG} onChange={(v) => set({ maxWeightG: v })} step={50} />
              <Num label="Min ASINs a niche" value={f.minAsins} onChange={(v) => set({ minAsins: v })} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Toggle label="Small parcel (35 × 25 × 12 cm) when Keepa has the size" checked={f.smallParcel} onChange={(v) => set({ smallParcel: v })} />
            </div>
            <p className="text-xs text-muted-foreground">A <b>near miss</b> fails only the gates&apos; warn band (£15–40, rating 3.6–4.5, 700 g) or is missing its size. Unknown weight isn&apos;t a miss: the product qualifies, marked &quot;weight unknown&quot;.</p>
          </fieldset>
        </div>
        {f.mode === "leaf" && <div className="grid gap-3 sm:grid-cols-4">
          <Num label={`Leaves to size (1–${LIMITS.leavesCap})`} value={f.leavesCap} onChange={(v) => set({ leavesCap: v })} step={10} hint="Stage 1: the largest first, ~11 tokens each, capped by the balance" />
          <Num label="Skip leaves under … matches" value={f.minLeafMatches} onChange={(v) => set({ minLeafMatches: v })} />
          <Num label={`Leaves to detail, N (1–${LIMITS.detailLeaves})`} value={f.detailLeaves} onChange={(v) => set({ detailLeaves: v })} hint="Stage 2: most matches first" />
          <Num label={`ASINs per leaf (1–${LIMITS.perLeaf})`} value={f.perLeaf} onChange={(v) => set({ perLeaf: v })} hint="Best-selling first, ~2 tokens each" />
        </div>}
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
        <div className="flex flex-wrap items-start gap-4 border-t pt-3">
          <Button onClick={run} disabled={!!busy || busyHunt || !start.keepa || !f.categories.length || !plan?.fits}>
            {busy === "run" ? <LoaderIcon className="animate-spin" /> : <CrosshairIcon />} Hunt niches
          </Button>
          {plan && f.mode === "direct" ? (
            <div className="space-y-0.5 text-sm text-muted-foreground">
              <div>Finder: <span className="num">{f.categories.length}</span> categor{f.categories.length === 1 ? "y" : "ies"} × {f.pagesPerRoot} page{f.pagesPerRoot === 1 ? "" : "s"} × 11 = <span className="num">{plan.estimate.finder}</span> tokens</div>
              <div>Detail: up to <span className="num">{(plan.estimate.finderPages ?? 0) * 50}</span> ASINs × ~2 = <span className="num">{plan.estimate.detail}</span> tokens (less any fetched in the last 7 days)</div>
              {(plan.estimate.incumbentNiches ?? 0) > 0 && <div>+ incumbents: up to <span className="num">{plan.estimate.incumbentNiches}</span> niches × 31 (a finder page of 11 + 10 details × 2) = <span className="num">{plan.estimate.incumbents}</span> tokens</div>}
              <div className="text-foreground">Total up to <b className="num">{plan.estimate.total}</b>; it stops at <b className="num">{plan.cap}</b> (+10%) · balance <span className="num">{plan.balance?.toLocaleString("en-GB") ?? "—"}</span>, {TOKEN_RESERVE} kept in reserve</div>
              {plan.waitsForRefill && plan.fits && <div className="text-warn">More than the balance: it waits for Keepa&apos;s refill part-way (about 21 tokens a minute).</div>}
              {!plan.fits && <div className="text-fail">The finder pages alone are over the balance less the reserve: fewer pages, or wait for the refill.</div>}
            </div>
          ) : plan ? (
            <div className="space-y-0.5 text-sm text-muted-foreground">
              {plan.estimate.tree > 0 && <div>Category tree: up to <span className="num">{plan.estimate.tree}</span> tokens (listed once, kept a week)</div>}
              <div>Stage 1, size leaves: <span className="num">{plan.estimate.leavesToSize}</span>{plan.sizingCapped ? ` of ${plan.leavesWanted} (capped by the balance; the largest first)` : plan.leavesKnown ? "" : " (up to)"} × 11 = <span className="num">{plan.estimate.sizing}</span> tokens{plan.leavesKnown && plan.leavesWanted < (f.leafIds?.length ?? f.leavesCap) ? " (the rest counted in the last 7 days)" : ""}</div>
              <div>Stage 2, detail: <span className="num">{Math.min(f.detailLeaves, f.leafIds?.length ?? f.detailLeaves)}</span> leaves × {f.perLeaf} ASINs × ~2 = <span className="num">{plan.estimate.detail}</span> tokens (less any fetched in the last 7 days)</div>
              <div className="text-foreground">Total up to <b className="num">{plan.estimate.total}</b>; it stops at <b className="num">{plan.cap}</b> (+10%) · balance <span className="num">{plan.balance?.toLocaleString("en-GB") ?? "—"}</span>, {TOKEN_RESERVE} kept in reserve</div>
              {!plan.fits && (
                <div className="flex flex-wrap items-center gap-2 text-fail">
                  Over the balance less the reserve.
                  {plan.fittingDetailLeaves ? <Button size="xs" variant="outline" onClick={() => set({ detailLeaves: plan.fittingDetailLeaves! })}>Detail {plan.fittingDetailLeaves} leaves instead</Button>
                    : <span>Size fewer leaves, or wait for the refill.</span>}
                </div>
              )}
            </div>
          ) : <span className="text-sm text-muted-foreground">Working out the cost…</span>}
        </div>
      </section>

      {result ? <Results result={result} start={start} onReload={() => loadHunt(result.hunt.id)} onPick={loadHunt} onCandidate={onCandidate}
        onRequalify={async () => {
          try {
            const q = { priceMin: f.priceMin, priceMax: f.priceMax, ratingMin: f.ratingMin, ratingMax: f.ratingMax, maxReviews: f.maxReviews, minRankDrops90: f.minRankDrops90, maxWeightG: f.maxWeightG, smallParcel: f.smallParcel, noAmazon: f.noAmazon, excludeAmazonBrands: f.excludeAmazonBrands, minAsins: f.minAsins };
            const r = await api<HuntResult>(`/api/pl/hunt/${result.hunt.id}/requalify`, { method: "POST", json: { thresholds: q } });
            setResult(await api<HuntResult>(`/api/pl/hunt/${r.hunt.id}?minAsins=1`));
            toast.success(`Re-qualified with the thresholds above: ${r.qualifying} qualifying, ${r.near} near misses, ${r.incumbents} incumbents. 0 tokens.`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
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

function Results({ result, start, onReload, onPick, onCandidate, onStart, onRequalify }: {
  result: HuntResult; start: Start; onReload: () => void; onPick: (id: string) => void; onCandidate: (id: string) => void; onStart: () => void;
  onRequalify: () => Promise<void>;
}) {
  const [shape, setShape] = useState<"" | Shape>("");
  const [strict, setStrict] = useState(false);
  const [minCount, setMinCount] = useState(result.hunt.filters.minAsins ?? 3);
  const [sort, setSort] = useState<"sales" | "count" | "price">("sales");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const { prompt } = useDialogs();
  const h = result.hunt;
  const [showLeaves, setShowLeaves] = useState(false);

  const rows = useMemo(() => result.niches
    .filter((n) => n.count + (strict ? 0 : n.nearCount) >= minCount && (!shape || n.shape === shape))
    .sort((a, b) => (sort === "count" ? b.count - a.count : sort === "price" ? (a.medianPrice ?? 0) - (b.medianPrice ?? 0) : b.salesSum - a.salesSum)), [result, minCount, shape, sort, strict]);
  const smaller = result.niches.filter((n) => n.count + (strict ? 0 : n.nearCount) < minCount && n.count + n.nearCount > 0).length;

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
            {h.name} · {ago(h.created_at)} · {h.leaves ? `${h.leaves.length} leaves` : `${h.finder_total?.toLocaleString("en-GB") ?? "?"} found`}, {h.asins.length} ASINs detailed ({h.fetched} fetched, {h.reused} reused) · <b className="text-foreground">{h.token_cost} tokens</b> · {result.qualifying} qualifying, {result.near} near misses, {result.incumbents} incumbents
          </p>
          {h.leaves && (
            <p className={cn("flex items-center gap-2 text-sm font-medium", running(h.status) ? "text-brand" : h.status === "error" ? "text-fail" : "text-muted-foreground")}>
              {running(h.status) && <LoaderIcon className="size-4 animate-spin" />}
              {progressLine(h)}{h.status === "done" ? " · done" : h.status === "cancelled" ? " · cancelled" : h.status === "error" ? " · stopped" : ""}
              {h.note && <span className="font-normal text-muted-foreground">({h.note})</span>}
              {running(h.status) && <Button size="xs" variant="ghost" onClick={async () => { await api(`/api/pl/hunt/${h.id}/cancel`, { method: "POST" }); onReload(); }}>Cancel</Button>}
              {!running(h.status) && !h.leaves && h.filters.mode === "direct" && (
                <Button size="xs" variant="outline" title="Each niche with 3+ qualifying: its leaf's 10 best sellers over the review cap, ~31 tokens a niche" onClick={async () => {
                  try {
                    const r = await api<{ niches: number; estimate: number }>(`/api/pl/hunt/${h.id}/incumbents`, { method: "POST", json: {} });
                    toast.success(`Checking ${r.niches} niche${r.niches === 1 ? "" : "s"} for incumbents: about ${r.estimate} tokens`);
                    onReload();
                  } catch (e) { toast.error((e as Error).message); }
                }}>{Object.keys(h.progress?.incumbents ?? {}).length ? "Re-check incumbents" : "Check incumbents"}</Button>
              )}
            </p>
          )}
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
        <label className="space-y-1"><span className="field-label">At least … {strict ? "qualifying" : "qualifying + near-miss"} ASINs</span>
          <Input className="num w-28" type="number" min={1} value={minCount} onChange={(e) => setMinCount(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={strict} onCheckedChange={setStrict} /> Strict (qualifying only)</label>
        <Button variant="outline" size="sm" className="mb-0.5" disabled={!!busy || running(h.status)} onClick={async () => { setBusy("requalify"); try { await onRequalify(); } finally { setBusy(null); } }}
          title="Qualify this hunt's fetched products again with the thresholds above: 0 tokens">
          {busy === "requalify" ? <LoaderIcon className="animate-spin" /> : null} Re-qualify this hunt
        </Button>
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
              <th className="px-2 py-1.5">Niche</th><th className="px-2 py-1.5 text-right" title="Qualifying · near misses · incumbents">Q · near · inc</th><th className="px-2 py-1.5 text-right">Median price</th><th className="px-2 py-1.5 text-right">Median reviews</th>
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
                    <td className="num px-2 py-2 text-right whitespace-nowrap"><b>{n.count}</b> · <span className="text-warn">{n.nearCount}</span> · <span className="text-muted-foreground">{n.incumbentCount}</span></td>
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
                        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => openInPoe(n.name)} title="Copies the niche name and opens Opportunity Explorer">Opportunity Explorer <ExternalLinkIcon className="size-3" /></button>
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
                            <td className="px-2 py-1.5">{a.qualifies ? <span><span className="font-medium text-pass">Qualifies</span>{a.unknown?.length ? <span className="text-muted-foreground"> ({a.unknown.join(", ")})</span> : null}</span>
                              : a.near ? <span><span className="font-medium text-warn">Near miss</span> <span className="text-muted-foreground">({a.reasons.join(", ")})</span></span>
                              : a.incumbent ? <span><span className="font-medium text-ink-2">Incumbent</span> <span className="text-muted-foreground">(over the review cap{a.reasons.length ? `; ${a.reasons.join(", ")}` : ""})</span></span>
                              : <span><span className="font-medium text-fail">Fails</span> <span className="text-muted-foreground">({a.reasons.join(", ")})</span></span>}</td>
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

      {result.funnel.start > 0 && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          <b className="text-foreground">Why so few?</b> All {result.funnel.start} detailed (dismissed niches included)
          {result.funnel.steps.filter((x) => x.removed || x.near).map((x) => ` → ${x.label}: −${x.removed}${x.near ? ` (${x.near} near miss${x.near === 1 ? "" : "es"} let through)` : ""}`).join("")}
          {` → over ${h.filters.maxReviews} reviews: ${result.funnel.incumbents} incumbent${result.funnel.incumbents === 1 ? "" : "s"}`}
          {` = ${result.funnel.qualifying} qualifying + ${result.funnel.near} near miss${result.funnel.near === 1 ? "" : "es"}.`}
          {h.filters.mode === "direct" && !h.leaves && <> Before all that, Keepa&apos;s weight filter (700 g) left out products it has no weight for: about {(WEIGHT_FILTER_UNKNOWN.unknown / WEIGHT_FILTER_UNKNOWN.of * 100).toFixed(1)}% of matches ({WEIGHT_FILTER_UNKNOWN.unknown.toLocaleString("en-GB")} of {WEIGHT_FILTER_UNKNOWN.of.toLocaleString("en-GB")} when measured on Pet Supplies; Keepa doesn&apos;t report the count per query).</>}
          {" "}Leaves: {h.leaves ? `${h.leaves.filter((l) => l.matches != null).length} sized, ${h.leaves.reduce((a, l) => a + (l.matches ?? 0), 0).toLocaleString("en-GB")} finder matches, ${h.leaves.filter((l) => l.matches === 0).length} with none` : "—"}.
        </p>
      )}

      {h.leaves && h.leaves.length > 0 && (
        <div className="text-sm">
          <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setShowLeaves((v) => !v)}>{showLeaves ? "Hide" : "Show"} leaves sized ({h.leaves.filter((l) => l.matches != null).length}/{h.leaves.length})</button>
          {showLeaves && (
            <div className="mt-2 overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-[10.5px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1.5">Leaf</th><th className="px-2 py-1.5 text-right">Matches</th><th className="px-2 py-1.5 text-right">Finder cost</th><th className="px-2 py-1.5">Stage 2</th></tr></thead>
                <tbody>{[...h.leaves].sort((a, b) => (b.matches ?? -1) - (a.matches ?? -1)).map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0">
                    <td className="px-2 py-1.5">{l.name} <span className="num text-muted-foreground">{l.id}</span></td>
                    <td className="num px-2 py-1.5 text-right">{l.matches == null ? "…" : l.matches.toLocaleString("en-GB")}</td>
                    <td className="num px-2 py-1.5 text-right">{l.matches == null ? "" : l.cached ? "0 (counted in the last 7 days)" : l.finderTokens}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{l.skipped ? "not sized (balance)" : l.detailed ? `detailed: ${l.fetched ?? 0} fetched, ${l.reused ?? 0} reused` : l.detail ? "to detail" : l.matches != null && l.matches < h.filters.minLeafMatches ? `skipped (under ${h.filters.minLeafMatches})` : l.matches != null ? "not in the top N" : ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
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
