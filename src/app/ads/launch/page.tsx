"use client";

import { DownloadIcon, RocketIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { asinOf } from "@/components/ads/ProductPicker";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { LaunchCampaign, PlanStep } from "@/lib/ads/launch";
import { api } from "@/lib/ui/client";

interface Defaults { asin: string | null; title: string | null; sku: string; price: number | null; headTerms: string[]; competitorAsins: string[]; dailyBudget: number; targetAcos: number; steadyTargetAcos: number | null; startingBid: number; startDate: string; notes: string[]; negatives?: string[];
  bidBasis?: { conversion: number; conversionSource: "product" | "account" | "default"; cpc: number } }
interface Picker { defaults: Defaults; products: { asin: string; title: string | null }[]; candidates: { id: string; name: string }[] }
interface Preview { campaigns: LaunchCampaign[]; plan: PlanStep[]; warnings: string[]; describe: string[]; rows: number }

interface Form { asin: string; sku: string; price: string; headTerms: string; competitorAsins: string; dailyBudget: string; targetAcos: string; steadyTargetAcos: string; startingBid: string; startDate: string; negatives: string }
const toForm = (d: Defaults): Form => ({
  asin: d.asin ?? "", sku: d.sku, price: d.price != null ? String(d.price) : "", headTerms: d.headTerms.join("\n"), competitorAsins: d.competitorAsins.join("\n"),
  dailyBudget: String(d.dailyBudget), targetAcos: String(Math.round(d.targetAcos * 100)), steadyTargetAcos: d.steadyTargetAcos != null ? String(Math.round(d.steadyTargetAcos * 100)) : "",
  startingBid: d.startingBid.toFixed(2), startDate: d.startDate, negatives: (d.negatives ?? []).join("\n"),
});
const toInput = (f: Form) => ({
  asin: f.asin.trim().toUpperCase(), sku: f.sku.trim(), price: Number(f.price), headTerms: f.headTerms.split(/\n|,/), competitorAsins: f.competitorAsins.split(/[\s,]+/),
  dailyBudget: Number(f.dailyBudget), targetAcos: Number(f.targetAcos) / 100, steadyTargetAcos: f.steadyTargetAcos ? Number(f.steadyTargetAcos) / 100 : null,
  startingBid: Number(f.startingBid), startDate: f.startDate, negatives: f.negatives.split(/\n|,/),
});
/**
 * The starting bid is the higher of the launch target ACoS × price × smoothed conversion and the
 * account's CPC × 0.8: both figures, and which one won, from the form's current price and target.
 */
function bidHint(f: Form, b: Defaults["bidBasis"]): string | undefined {
  if (!b) return undefined;
  const price = Number(f.price), target = Number(f.targetAcos) / 100;
  const conv = `${(b.conversion * 100).toFixed(1)}% ${b.conversionSource === "product" ? "product" : b.conversionSource === "account" ? "account" : "default"} conversion`;
  const smoothed = price > 0 && target > 0 ? Math.max(0.1, Math.round(target * price * b.conversion * 100) / 100) : null;
  const cpc = Math.round(b.cpc * 0.8 * 100) / 100;
  const won = smoothed != null && smoothed > cpc ? "smoothed" : "cpc";
  const a = smoothed != null ? `£${smoothed.toFixed(2)} = ${Math.round(target * 100)}% × £${price.toFixed(2)} × ${conv}` : "target × price × conversion: needs the price";
  const c = `£${cpc.toFixed(2)} = £${b.cpc.toFixed(2)} account CPC × 0.8`;
  return `Higher of ${a}${won === "smoothed" ? " (used)" : ""} and ${c}${won === "cpc" ? " (used)" : ""}`;
}
/** The launcher's campaign preview: the four campaigns with their budget, bid and targets. */
const CAMPAIGN_COLUMNS: DataColumn<LaunchCampaign>[] = [
  { id: "name", header: "Campaign", mobile: "title", sortValue: (c) => c.name, cell: (c) => <span className="font-medium">{c.name}</span> },
  { id: "budget", header: "Budget", numeric: true, mobile: 1, sortValue: (c) => c.budget, cell: (c) => <span className="whitespace-nowrap">£{c.budget.toFixed(2)}/day <span className="text-xs text-muted-foreground">{Math.round(c.share * 100)}%</span></span> },
  { id: "bid", header: "Bid", numeric: true, mobile: 2, sortValue: (c) => c.bid, cell: (c) => `£${c.bid.toFixed(2)}` },
  { id: "targets", header: "Targets", mobile: 3, sortValue: (c) => c.targets.length, cell: (c) => <span className="text-meta text-muted-foreground">{c.targets.join(", ")}</span> },
];
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Ads → Launch: a product's four launch campaigns as a bulk Create sheet, with the 60-day plan. */
export default function AdsLaunchPage() {
  return <Suspense><AdsLaunch /></Suspense>;
}

function AdsLaunch() {
  const [pick, setPick] = useState<Picker | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  // The URL is the source of truth: ?candidateId=… (from a private-label candidate's launch checklist, with
  // its ?asin=) or ?asin=…; "Start from" shows it and rewrites it.
  const params = useSearchParams();
  const router = useRouter();
  const candidateId = params.get("candidateId") ?? "";
  const urlAsin = asinOf(params.get("asin"));
  const source = candidateId ? `cand:${candidateId}` : urlAsin ? `asin:${urlAsin}` : "";
  const pickSource = (v: string) => {
    const [k, id] = v.split(":");
    router.replace(k === "asin" ? `/ads/launch?asin=${id}` : k === "cand" ? `/ads/launch?candidateId=${encodeURIComponent(id)}` : "/ads/launch", { scroll: false });
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ id: string; label: string } | null>(null);

  const loadDefaults = useCallback((q: string) => api<Picker>(`/api/ads/launch${q}`).then((r) => { setPick(r); setForm(toForm(r.defaults)); setPreview(null); setMade(null); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => {
    // ?candidateId=…&asin=… prefill the head terms, competitors and listing.
    const q = [candidateId ? `candidateId=${encodeURIComponent(candidateId)}` : null, urlAsin ? `asin=${urlAsin}` : null].filter(Boolean);
    loadDefaults(q.length ? `?${q.join("&")}` : "");
  }, [loadDefaults, candidateId, urlAsin]);
  useEffect(() => {
    if (!form) return;
    const t = setTimeout(() => {
      const i = toInput(form);
      if (!(i.price > 0 && i.dailyBudget > 0 && i.startingBid > 0 && i.targetAcos > 0 && /^[A-Z0-9]{10}$/.test(i.asin))) { setPreview(null); return; }
      api<Preview>("/api/ads/launch", { method: "POST", json: { input: i, preview: true } }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form]);

  if (error) return <ErrorState title="Couldn't load the launcher" message={error} />;
  if (!pick || !form) return <Skeleton className="h-96 rounded-lg" />;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ batch: { id: string; label: string; rows: number } }>("/api/ads/launch", { method: "POST", json: { input: toInput(form) } });
      setMade(r.batch);
      toast.success(`Launch sheet ${r.batch.label}: ${r.batch.rows} rows. The product is in its launch phase, with the plan on the dashboard.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof Form, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block space-y-1"><span className="field-label">{label}</span><Input value={form[k]} onChange={set(k)} {...props} />{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch"
        crumbs={[{ label: "Ads", href: "/ads/dashboard" }, { label: "Launch" }]}
        subtitle="Four launch campaigns for a new product, as one bulk sheet to upload in Amazon Ads."
        info={<>
          <p><b>Auto</b> (close match and substitutes on, loose match and complements off), <b>Broad</b> research on the head terms (bid × 0.8), <b>Exact</b> on the head terms (bid × 1.0) and <b>product targeting</b> on competitors (bid × 0.9). Budget split 30 / 20 / 40 / 10; top-of-search adjustment 0% to start.</p>
          <p>Creating the sheet saves it under Bulk exports, puts the product in its launch phase (weeks 1–2: the rules propose harvests and negatives only) and shows the 60-day plan on the dashboard.</p>
        </>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Start from</span>
          <NativeSelect value={source} onChange={(e) => pickSource(e.target.value)} aria-label="Start from">
            <NativeSelectOption value="">— pick a product —</NativeSelectOption>
            {urlAsin && !candidateId && !pick.products.some((p) => p.asin === urlAsin) && <NativeSelectOption value={`asin:${urlAsin}`}>{urlAsin} · not an Ads product yet</NativeSelectOption>}
            {candidateId && !pick.candidates.some((c) => c.id === candidateId) && <NativeSelectOption value={`cand:${candidateId}`}>A candidate that isn&apos;t listed</NativeSelectOption>}
            <optgroup label="Ads products">{pick.products.map((p) => <NativeSelectOption key={p.asin} value={`asin:${p.asin}`}>{p.asin}{p.title ? ` · ${p.title.slice(0, 40)}` : ""}</NativeSelectOption>)}</optgroup>
            <optgroup label="Private-label candidates">{pick.candidates.map((c) => <NativeSelectOption key={c.id} value={`cand:${c.id}`}>{c.name}</NativeSelectOption>)}</optgroup>
          </NativeSelect></label>
        {pick.defaults.notes.map((n) => <p key={n} className="pb-2 text-xs text-warn-ink">{n}</p>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="panel space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            {field("asin", "ASIN", "The listing the ads advertise")}
            {field("sku", "SKU", "Its seller SKU (a new pack size has its own)")}
            {field("price", "Sale price (£)", undefined, { type: "number", step: "0.01" })}
            {field("dailyBudget", "Daily budget, all four (£)", "From a candidate: Gate 7 launch ads ÷ 60", { type: "number", step: "0.5" })}
            {field("targetAcos", "Launch target ACoS (%)", undefined, { type: "number" })}
            {field("steadyTargetAcos", "Steady target ACoS (%)", "For week 8 (optional)", { type: "number" })}
            {field("startingBid", "Starting bid (£)", bidHint(form, pick.defaults.bidBasis), { type: "number", step: "0.01" })}
            {field("startDate", "Start date", undefined, { type: "date" })}
          </div>
          <label className="block space-y-1"><span className="field-label">Head terms, one a line</span>
            <Textarea className="min-h-28" value={form.headTerms} onChange={set("headTerms")} placeholder="From a candidate: Gate 5's top 8 search terms by volume" /></label>
          <label className="block space-y-1"><span className="field-label">Competitor ASINs</span>
            <Textarea className="num min-h-16 md:text-xs" value={form.competitorAsins} onChange={set("competitorAsins")} placeholder="From a candidate: its page-one list" /></label>
          <label className="block space-y-1"><span className="field-label">Negative phrases in every campaign (the blacklist)</span>
            <Textarea className="min-h-16" value={form.negatives} onChange={set("negatives")} placeholder="From Ads → Rules → Ad settings → Keyword lists and the product's own" /></label>
        </section>
        <section className="space-y-3">
          {!preview ? <p className="panel p-4 text-sm text-muted-foreground">Fill in the ASIN, price, budget, target and bid to see the campaigns.</p> : (
            <>
              <DataTable rows={preview.campaigns} columns={CAMPAIGN_COLUMNS} getRowId={(c) => c.name} caption="Launch campaigns" />
              {preview.warnings.map((w) => <p key={w} className="text-xs text-warn-ink">{w}</p>)}
              <div className="panel space-y-2 p-4">
                <h2 className="section-label">60-day plan</h2>
                <ol className="space-y-1.5 text-sm">{preview.plan.map((p) => <li key={p.from}><b>{day(p.from)}</b>: {p.title}. <span className="text-muted-foreground">{p.detail}</span></li>)}</ol>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={create} loading={busy}><RocketIcon /> Create launch sheet ({preview.rows} rows)</Button>
                {made && <Button variant="secondary" asChild><a href={`/api/ads/exports/${made.id}`}><DownloadIcon /> Download {made.label}</a></Button>}
                {made && <Link href="/ads/proposals?tab=exports" className="text-sm text-primary hover:underline">All bulk exports →</Link>}
              </div>
              <p className="text-xs text-muted-foreground">Creating it saves the sheet under Bulk exports and puts the product in its launch phase.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
