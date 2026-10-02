"use client";

import { DownloadIcon, LoaderIcon, RocketIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { LaunchCampaign, PlanStep } from "@/lib/ads/launch";
import { api } from "@/lib/ui/client";

interface Defaults { asin: string | null; title: string | null; sku: string; price: number | null; headTerms: string[]; competitorAsins: string[]; dailyBudget: number; targetAcos: number; steadyTargetAcos: number | null; startingBid: number; startDate: string; notes: string[] }
interface Picker { defaults: Defaults; products: { asin: string; title: string | null }[]; candidates: { id: string; name: string }[] }
interface Preview { campaigns: LaunchCampaign[]; plan: PlanStep[]; warnings: string[]; describe: string[]; rows: number }

interface Form { asin: string; sku: string; price: string; headTerms: string; competitorAsins: string; dailyBudget: string; targetAcos: string; steadyTargetAcos: string; startingBid: string; startDate: string }
const toForm = (d: Defaults): Form => ({
  asin: d.asin ?? "", sku: d.sku, price: d.price != null ? String(d.price) : "", headTerms: d.headTerms.join("\n"), competitorAsins: d.competitorAsins.join("\n"),
  dailyBudget: String(d.dailyBudget), targetAcos: String(Math.round(d.targetAcos * 100)), steadyTargetAcos: d.steadyTargetAcos != null ? String(Math.round(d.steadyTargetAcos * 100)) : "",
  startingBid: d.startingBid.toFixed(2), startDate: d.startDate,
});
const toInput = (f: Form) => ({
  asin: f.asin.trim().toUpperCase(), sku: f.sku.trim(), price: Number(f.price), headTerms: f.headTerms.split(/\n|,/), competitorAsins: f.competitorAsins.split(/[\s,]+/),
  dailyBudget: Number(f.dailyBudget), targetAcos: Number(f.targetAcos) / 100, steadyTargetAcos: f.steadyTargetAcos ? Number(f.steadyTargetAcos) / 100 : null,
  startingBid: Number(f.startingBid), startDate: f.startDate,
});
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Ads → Launch: a product's four launch campaigns as a bulk Create sheet, with the 60-day plan. */
export default function AdsLaunchPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Launch" }]);
  const [pick, setPick] = useState<Picker | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ id: string; label: string } | null>(null);

  const loadDefaults = useCallback((q: string) => api<Picker>(`/api/ads/launch${q}`).then((r) => { setPick(r); setForm(toForm(r.defaults)); setPreview(null); setMade(null); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { loadDefaults(""); }, [loadDefaults]);
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
    <label className="block space-y-1"><span className="field-label">{label}</span><Input className="h-8" value={form[k]} onChange={set(k)} {...props} />{hint && <span className="block text-2xs text-muted-foreground">{hint}</span>}</label>
  );

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h1 className="page-title">Launch</h1>
        <p className="text-sm text-muted-foreground">Four campaigns for a new product, as one bulk sheet to upload in Amazon Ads: <b>Auto</b> (close match and substitutes on, loose match and complements off), <b>Broad</b> research on the head terms (bid × 0.8), <b>Exact</b> on the head terms (bid × 1.0) and <b>product targeting</b> on competitors (bid × 0.9). Budget split 30 / 20 / 40 / 10; top-of-search adjustment 0% to start.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1"><span className="field-label">Start from</span>
          <NativeSelect value={source} onChange={(e) => { setSource(e.target.value); const [k, v] = e.target.value.split(":"); loadDefaults(k === "asin" ? `?asin=${v}` : k === "cand" ? `?candidateId=${v}` : ""); }}>
            <NativeSelectOption value="">— pick a product —</NativeSelectOption>
            <optgroup label="Ads products">{pick.products.map((p) => <NativeSelectOption key={p.asin} value={`asin:${p.asin}`}>{p.asin}{p.title ? ` · ${p.title.slice(0, 40)}` : ""}</NativeSelectOption>)}</optgroup>
            <optgroup label="Private-label candidates">{pick.candidates.map((c) => <NativeSelectOption key={c.id} value={`cand:${c.id}`}>{c.name}</NativeSelectOption>)}</optgroup>
          </NativeSelect></label>
        {pick.defaults.notes.map((n) => <p key={n} className="pb-2 text-xs text-warn">{n}</p>)}
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
            {field("startingBid", "Starting bid (£)", "Settings → Ads CPC × 0.8", { type: "number", step: "0.01" })}
            {field("startDate", "Start date", undefined, { type: "date" })}
          </div>
          <label className="block space-y-1"><span className="field-label">Head terms, one a line</span>
            <textarea className="min-h-28 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm" value={form.headTerms} onChange={set("headTerms")} placeholder="From a candidate: Gate 5's top 8 search terms by volume" /></label>
          <label className="block space-y-1"><span className="field-label">Competitor ASINs</span>
            <textarea className="min-h-16 w-full rounded-md border bg-transparent px-2 py-1.5 font-mono text-xs" value={form.competitorAsins} onChange={set("competitorAsins")} placeholder="From a candidate: its page-one list" /></label>
        </section>
        <section className="space-y-3">
          {!preview ? <p className="panel p-4 text-sm text-muted-foreground">Fill in the ASIN, price, budget, target and bid to see the campaigns.</p> : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase"><th className="px-2 py-1.5">Campaign</th><th className="px-2 py-1.5 text-right">Budget</th><th className="px-2 py-1.5 text-right">Bid</th><th className="px-2 py-1.5">Targets</th></tr></thead>
                  <tbody>{preview.campaigns.map((c) => (
                    <tr key={c.name} className="border-b last:border-b-0"><td className="px-2 py-1.5 font-medium">{c.name}</td><td className="num px-2 py-1.5 text-right">£{c.budget.toFixed(2)}/day <span className="text-xs text-muted-foreground">{Math.round(c.share * 100)}%</span></td><td className="num px-2 py-1.5 text-right">£{c.bid.toFixed(2)}</td><td className="px-2 py-1.5 text-xs text-muted-foreground">{c.targets.join(", ")}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {preview.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
              <div className="panel space-y-2 p-4">
                <h2 className="font-semibold">60-day plan</h2>
                <ol className="space-y-1.5 text-sm">{preview.plan.map((p) => <li key={p.from}><b>{day(p.from)}</b>: {p.title}. <span className="text-muted-foreground">{p.detail}</span></li>)}</ol>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={create} disabled={busy}>{busy ? <LoaderIcon className="animate-spin" /> : <RocketIcon />} Create launch sheet ({preview.rows} rows)</Button>
                {made && <Button variant="outline" asChild><a href={`/api/ads/exports/${made.id}`}><DownloadIcon /> Download {made.label}</a></Button>}
                {made && <Link href="/ads/proposals/exports" className="text-sm text-brand hover:underline">All bulk exports →</Link>}
              </div>
              <p className="text-xs text-muted-foreground">Creating it saves the sheet under Bulk exports, puts the product in its launch phase (weeks 1–2: the rules propose harvests and negatives only) and shows the plan on the dashboard.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
