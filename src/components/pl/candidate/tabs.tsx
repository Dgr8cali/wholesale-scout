"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { day, LaunchExport, LaunchForm, LaunchPlan, useLaunchBuilder } from "@/components/ads/LaunchBuilder";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, StockLevel } from "@/components/ui/status-chip";
import { capitalFor } from "@/lib/pl/gatekeeper";
import { LAUNCH_STEPS, type LaunchStep, type PlStatus } from "@/lib/pl/launch";
import { BUCKET_LABEL, BUCKETS } from "@/lib/stock/levels";
import type { Quote } from "@/lib/pl/quotes";
import { api } from "@/lib/ui/client";
import { LaunchSection, type AdsSummary } from "../Launch";
import { ListingSection } from "../ListingSection";
import { QuotesSection } from "../Quotes";
import { ReviewMiner } from "../ReviewMiner";
import { SuppliersSection } from "../Suppliers";
import { valuesOf } from "../types";
import { CriticalReviewsTable } from "./parts";
import type { CandidateState } from "./useCandidate";
import { StepButton } from "@/components/ui/step-button";

export interface Extras { quotes: Quote[]; steps: LaunchStep[]; listingAsin: string | null; chosenQuote: string | null; chosenLanded: number | null; ads: AdsSummary | null }

/** The candidate's quotes, launch checklist, listing ASIN and ads figures (`/extras`), for the tabs that show them. */
export function useExtras(id: string) {
  const [x, setX] = useState<Extras | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Extras>(`/api/pl/candidates/${id}/extras`).then((r) => { setX(r); setError(null); }, (e: Error) => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);
  return { x, error, load };
}

const wait = <div className="space-y-3"><Skeleton className="h-40 rounded-[14px]" /><Skeleton className="h-64 rounded-[14px]" /></div>;

/** Reviews: Gate 4's review miner (pasted and extension-captured reviews, themes, the AI summary) and each listing's critical reviews. */
export function ReviewsTab({ s }: { s: CandidateState }) {
  const { data, fields, saveField, reload } = s;
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={s.load} />;
  if (!data) return wait;
  return (
    <div className="space-y-4">
      <ReviewMiner candidateId={data.candidate.id} asins={data.asins} product={data.candidate.niche_keyword || data.candidate.name} fields={fields} onSave={saveField} onAsinsChanged={async () => { await reload(); }} />
      {data.asins.length > 0 && (
        <section className="panel space-y-2 p-4">
          <h2 className="text-base font-semibold">Critical reviews by listing</h2>
          <CriticalReviewsTable asins={data.asins} />
        </section>
      )}
    </div>
  );
}

/** Suppliers & quotes: the shared Alibaba supplier table for this candidate, then its quotes. */
export function SuppliersTab({ id, s, onChanged }: { id: string; s: CandidateState; onChanged: () => void }) {
  const { data, fields, reload } = s;
  const e = useExtras(id);
  const asked = useSearchParams().get("quotes");
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={s.load} />;
  if (!data || !e.x) return wait;
  const c = data.candidate;
  const refresh = () => { void e.load(); onChanged(); };
  return (
    <div className="space-y-4">
      <SuppliersSection candidateId={c.id} onQuoted={refresh} />
      <QuotesSection c={{ id: c.id, name: c.name, niche_keyword: c.niche_keyword, category: c.category, sell: fields.sell?.value ? Number(fields.sell.value) : null, fields }}
        quotes={e.x.quotes} chosenQuote={e.x.chosenQuote} compare={{ settings: data.settings, card: data.card, category: c.category }}
        view={asked === "compare" || asked === "list" ? asked : null} onChanged={refresh} onFieldsChanged={() => { void reload(); refresh(); }} />
    </div>
  );
}

/** Listing: the Listing Writer, unchanged. */
export function ListingTab({ id }: { id: string }) {
  return <ListingSection candidateId={id} />;
}

const STEPS = [
  { key: "checklist", label: "Checklist" },
  { key: "stock", label: "Inbound / stock check" },
  { key: "ads", label: "Ads launch plan" },
  { key: "export", label: "Export bulk file" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/**
 * Launch, one flow in four steps (?step=): the checklist from samples to the first review (with the
 * listing ASIN and the budget against Gate 7), the listing's stock and what's inbound, the Ads launch
 * builder for this candidate (unchanged: the same as Ads → Launch), then the bulk file.
 */
export function LaunchTab({ id, s, onChanged }: { id: string; s: CandidateState; onChanged: () => void }) {
  const { data, fields } = s;
  const e = useExtras(id);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const asked = params.get("step") as StepKey | null;
  const step: StepKey = asked && STEPS.some((x) => x.key === asked) ? asked : "checklist";
  // The builder stays mounted across steps 3 and 4 (the form you filled is the sheet you export).
  const b = useLaunchBuilder(id, e.x?.listingAsin ?? null);
  if (s.error && !data) return <ErrorState title="Couldn't load the candidate" message={s.error} onRetry={s.load} />;
  if (!data || !e.x) return wait;
  const go = (k: StepKey) => { const q = new URLSearchParams(params.toString()); q.set("tab", "launch"); q.set("step", k); router.replace(`${path}?${q}`, { scroll: false }); };
  const num = (k: string) => (fields[k]?.value ? Number(fields[k]!.value) : null);
  const units = num("units"), landed = num("landed");
  const plan = { stock: units != null && landed != null ? units * landed : null, samples: num("samples"), inspection: num("inspection"), photography: num("photography"), trademark: num("trademark"), launchAds: num("launchAds") };
  const i = STEPS.findIndex((x) => x.key === step);
  return (
    <div className="space-y-4">
      <nav aria-label="Launch steps" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max gap-1.5 sm:min-w-0 sm:flex-wrap">
          {STEPS.map((x, n) => (
            <li key={x.key}>
              <StepButton current={step === x.key} onClick={() => go(x.key)} className="gap-2 px-2.5 py-1.5 text-sm">
                <span className="num flex size-6 flex-none items-center justify-center rounded-md bg-muted text-xs font-semibold">{n + 1}</span>{x.label}
              </StepButton>
            </li>
          ))}
        </ol>
      </nav>
      {step === "checklist" && (
        <LaunchSection candidateId={data.candidate.id} status={data.candidate.status as PlStatus} steps={e.x.steps} listingAsin={e.x.listingAsin} ads={e.x.ads}
          plan={plan} budget={capitalFor(valuesOf(fields), data.settings).amount} onChanged={() => { void e.load(); onChanged(); }} />
      )}
      {step === "stock" && <StockCheck id={id} steps={e.x.steps} />}
      {step === "ads" && (b.error ? <ErrorState title="Couldn't load the launcher" message={b.error} /> : !b.pick || !b.form ? wait : (
        <div className="space-y-3">
          {b.pick.defaults.notes.map((n) => <p key={n} className="text-xs text-warn-ink">{n}</p>)}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
            <LaunchForm b={b} />
            <LaunchPlan b={b} />
          </div>
        </div>
      ))}
      {step === "export" && (
        <section className="panel space-y-3 p-4">
          <h2 className="text-base font-semibold">Export the bulk file</h2>
          {!b.preview ? <p className="text-sm text-muted-foreground">Fill in the Ads launch plan first (step 3): the ASIN, price, budget, target and bid.</p> : (
            <>
              <p className="text-sm text-muted-foreground">{b.preview.campaigns.length} campaigns for {b.form?.asin}, {b.preview.rows} rows, starting {day(b.form!.startDate)}. Upload it in Amazon Ads → Bulk operations, then tick Ads launched in the checklist.</p>
              <LaunchExport b={b} />
            </>
          )}
        </section>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" disabled={i <= 0} onClick={() => go(STEPS[i - 1].key)}><ChevronLeftIcon /> {i > 0 ? STEPS[i - 1].label : "Back"}</Button>
        <Button variant="secondary" size="sm" disabled={i >= STEPS.length - 1} onClick={() => go(STEPS[i + 1].key)}>{i < STEPS.length - 1 ? STEPS[i + 1].label : "Next"} <ChevronRightIcon /></Button>
      </div>
    </div>
  );
}

interface StockData {
  asin: string | null; fbaSynced: string | null;
  item: { id: string; name: string; levels: Record<string, number>; total: number; status: string; cover: number | null; perDay: number; fbaMatched: boolean } | null;
  purchases: { id: string; units: number; status: string; orderedOn: string; expected: string | null; supplier: string | null; landed: number; tracking: string | null }[];
}
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Step 2: the listing's stock per bucket and its purchases, with the checklist's shipping steps. */
function StockCheck({ id, steps }: { id: string; steps: LaunchStep[] }) {
  const [d, setD] = useState<StockData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<StockData>(`/api/pl/candidates/${id}/stock`).then(setD, (e: Error) => setError(e.message)); }, [id]);
  if (error) return <ErrorState title="Couldn't load the stock" message={error} />;
  if (!d) return wait;
  const done = new Set(steps.filter((x) => x.done).map((x) => x.step));
  const ship = ["po_placed", "inspection_passed", "shipped", "at_fba"].map((k) => ({ k, label: LAUNCH_STEPS.find((x) => x.key === k)!.label, done: done.has(k) }));
  const inbound = d.purchases.filter((p) => p.status === "ordered");
  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">Inbound and stock</h2>
        {ship.map((x) => <StatusChip key={x.k} tone={x.done ? "good" : "neutral"} icon={x.done}>{x.label}</StatusChip>)}
      </div>
      {!d.asin ? (
        <p className="text-sm text-muted-foreground">No listing ASIN yet. Set it in step 1 (Checklist → Listing ASIN) once the listing exists: it gets a stock item, and its purchases and FBA stock show here.</p>
      ) : (
        <>
          {d.item ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BUCKETS.map((k) => <Fig key={k} label={BUCKET_LABEL[k]} value={(d.item!.levels[k] ?? 0).toLocaleString("en-GB")} sub={k === "fba" && !d.item!.fbaMatched ? "not matched in SP-API" : undefined} />)}
              <Fig label="In all" value={d.item.total.toLocaleString("en-GB")} sub={<StockLevel status={d.item.status} />} />
              <Fig label="Cover" value={d.item.cover == null ? "—" : `${Math.round(d.item.cover)} days`} sub={`${d.item.perDay.toFixed(1)} a day over 30 days`} />
            </div>
          ) : <p className="text-sm text-muted-foreground">{d.asin} has no stock item yet.</p>}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Purchases of {d.asin} {inbound.length > 0 && <span className="font-normal text-muted-foreground">· {inbound.reduce((a, p) => a + p.units, 0).toLocaleString("en-GB")} units inbound</span>}</h3>
            {d.purchases.length ? (
              <ul className="divide-y divide-divider rounded-[10px] border border-border text-sm">
                {d.purchases.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="num font-medium">{p.units.toLocaleString("en-GB")} units</span>
                    <span className="text-muted-foreground">{p.supplier ?? "—"} · ordered {date(p.orderedOn)}{p.expected ? ` · expected ${date(p.expected)}` : ""}{p.tracking ? ` · ${p.tracking}` : ""}</span>
                    <StatusChip tone={p.status === "ordered" ? "warn" : "good"} icon={false} className="ml-auto">{p.status}</StatusChip>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No purchases recorded for {d.asin}.</p>}
          </div>
          <p className="flex flex-wrap gap-4 text-sm">
            {d.item && <Link className="link" href={`/stock/levels?item=${d.item.id}`}>Stock → Levels →</Link>}
            <Link className="link" href="/stock/purchases">Stock → Purchases →</Link>
          </p>
        </>
      )}
    </section>
  );
}

function Fig({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num text-base font-medium">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
