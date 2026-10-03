"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { costTxt, type AiModel } from "@/lib/ads/ai";
import { api } from "@/lib/ui/client";

/** The Ads workspace's settings: the target ACoS, with what break-even means. */
export function AdsSettingsTab() {
  const [acos, setAcos] = useState<string | null>(null);
  const [cpc, setCpc] = useState("");
  const [cpcAuto, setCpcAuto] = useState(true);
  const [smoothK, setSmoothK] = useState("20");
  const [ctrB, setCtrB] = useState("0.4");
  const [error, setError] = useState<string | null>(null);
  const take = (st: { targetAcos: number; cpc: number; cpcAuto: boolean; smoothingK: number; ctrBenchmark: number }) => {
    setAcos(String(st.targetAcos));
    setCpc(st.cpc.toFixed(2));
    setCpcAuto(st.cpcAuto);
    setSmoothK(String(st.smoothingK));
    setCtrB(String(st.ctrBenchmark));
  };
  useEffect(() => {
    api<{ settings: { targetAcos: number; cpc: number; cpcAuto: boolean; smoothingK: number; ctrBenchmark: number } }>("/api/ads/settings").then((r) => take(r.settings)).catch((e: Error) => setError(e.message));
  }, []);
  if (error) return <ErrorState title="Couldn't load the Ads settings" message={error} />;
  if (acos == null) return <Skeleton className="h-40 rounded-lg" />;
  const save = async () => {
    try {
      const r = await api<{ settings: { targetAcos: number; cpc: number; cpcAuto: boolean; smoothingK: number; ctrBenchmark: number } }>("/api/ads/settings", { method: "PUT", json: { targetAcos: Number(acos), cpc: Number(cpc), cpcAuto, smoothingK: Number(smoothK), ctrBenchmark: Number(ctrB) } });
      take(r.settings);
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="section-label">Ads</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">The default target ACoS for the Ads dashboard&apos;s products and search-term chips (a product can have its own), and the CPC behind Private label&apos;s ads-per-unit estimate.</p>
        </div>
        <Button variant="outline" onClick={save}>Save</Button>
      </div>
      <label className="block max-w-xs space-y-1.5">
        <span className="field-label">Target ACoS (%)</span>
        <Input className="num" type="number" step="any" min={1} max={99} value={acos} onChange={(e) => setAcos(e.target.value)} />
        <span className="block text-2xs text-muted-foreground">Default 30%. A product&apos;s own target (launch or steady) is set on the dashboard</span>
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="field-label">CPC (£)</span>
          <Input className="num" type="number" step="0.01" min={0.01} value={cpc} disabled={cpcAuto} onChange={(e) => setCpc(e.target.value)} />
          <span className="block text-2xs text-muted-foreground">Private label&apos;s launch ads per unit = CPC ÷ conversion. Default £0.60</span>
        </label>
        <label className="flex items-center gap-2 pb-6 text-sm"><Switch checked={cpcAuto} onCheckedChange={setCpcAuto} /> Follow the account&apos;s trailing CPC after each import</label>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <label className="block w-56 space-y-1.5">
          <span className="field-label">Conversion smoothing (clicks)</span>
          <Input className="num" type="number" step={1} min={0} value={smoothK} onChange={(e) => setSmoothK(e.target.value)} />
          <span className="block text-2xs text-muted-foreground">Bids use (orders + k × the product&apos;s conversion) ÷ (clicks + k), so 3 orders from 12 clicks doesn&apos;t read as 25%. Default 20; 0 turns it off</span>
        </label>
        <label className="block w-56 space-y-1.5">
          <span className="field-label">CTR benchmark (%)</span>
          <Input className="num" type="number" step="0.05" min={0.05} value={ctrB} onChange={(e) => setCtrB(e.target.value)} />
          <span className="block text-2xs text-muted-foreground">Listing health: an ad CTR under 60% of this is likely a listing problem. Default 0.4%</span>
        </label>
      </div>
      <KeywordListsEditor />
      <p className="max-w-3xl text-sm text-muted-foreground">
        The rules&apos; thresholds (harvest, negatives, bid changes, pause, placements, budgets, revive) are set on <Link className="underline" href="/ads/rules">Ads → Rules</Link>, with on/off, mode and a dry run per rule.
      </p>
      <p className="max-w-3xl rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
        <b className="text-foreground">Break-even ACoS</b> is a product&apos;s margin before ads: profit before advertising ÷ sale price. Spend more than that on ads per sale and each ad sale loses money. A product with a 35% margin breaks even at 35% ACoS; a 30% target leaves 5 points of profit on ad sales. Keep the target below each product&apos;s break-even, and lower for products with thin margins.
      </p>
      <AiSettings />
    </section>
  );
}

interface AiSet { model: string; inUsd: number; outUsd: number; gbpPerUsd: number; reviewSchedule: boolean; keySet: boolean }
interface AiSpend { calls: number; totalGbp: number; last30Gbp: number; last30Calls: number }

/** The research layer (Claude): model, prices for the cost line, the monthly schedule (off by default), and what it has cost. */
function AiSettings() {
  const [data, setData] = useState<{ settings: AiSet; models: AiModel[]; spend: AiSpend } | null>(null);
  const [draft, setDraft] = useState<{ model: string; inUsd: string; outUsd: string; gbpPerUsd: string; reviewSchedule: boolean } | null>(null);
  const take = (r: { settings: AiSet; models: AiModel[]; spend: AiSpend }) => {
    setData(r);
    setDraft({ model: r.settings.model, inUsd: String(r.settings.inUsd), outUsd: String(r.settings.outUsd), gbpPerUsd: String(r.settings.gbpPerUsd), reviewSchedule: r.settings.reviewSchedule });
  };
  useEffect(() => {
    api<{ settings: AiSet; models: AiModel[]; spend: AiSpend }>("/api/ads/ai/settings").then(take).catch((e: Error) => toast.error(e.message));
  }, []);
  if (!data || !draft) return <Skeleton className="h-32 rounded-lg" />;
  const pickModel = (id: string) => {
    const m = data.models.find((x) => x.id === id);
    setDraft({ ...draft, model: id, inUsd: String(m?.inUsd ?? draft.inUsd), outUsd: String(m?.outUsd ?? draft.outUsd) });
  };
  const save = async () => {
    try {
      await api("/api/ads/ai/settings", { method: "PUT", json: { model: draft.model, inUsd: Number(draft.inUsd), outUsd: Number(draft.outUsd), gbpPerUsd: Number(draft.gbpPerUsd), reviewSchedule: draft.reviewSchedule } });
      take(await api("/api/ads/ai/settings"));
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">AI review (Claude)</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Explain this product, Recommend targets and the <Link className="underline" href="/ads/review">monthly review</Link>. The API is called only when you click, or by the monthly schedule if you turn it on. {data.settings.keySet ? <span className="text-pass">ANTHROPIC_API_KEY is set.</span> : <span className="text-warn">ANTHROPIC_API_KEY isn&apos;t set.</span>}
          </p>
          <p className="text-sm">Spent: <b>{costTxt(data.spend.last30Gbp)}</b> over {data.spend.last30Calls} call{data.spend.last30Calls === 1 ? "" : "s"} in the last 30 days · {costTxt(data.spend.totalGbp)} in all ({data.spend.calls})</p>
        </div>
        <Button variant="outline" onClick={save}>Save</Button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-1.5">
          <span className="field-label">Model</span>
          <NativeSelect value={draft.model} onChange={(e) => pickModel(e.target.value)}>
            {data.models.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.label}</NativeSelectOption>)}
            {!data.models.some((m) => m.id === draft.model) && <NativeSelectOption value={draft.model}>{draft.model}</NativeSelectOption>}
          </NativeSelect>
        </label>
        <label className="block w-32 space-y-1.5">
          <span className="field-label">$ per M tokens in</span>
          <Input className="num" type="number" step="any" min={0} value={draft.inUsd} onChange={(e) => setDraft({ ...draft, inUsd: e.target.value })} />
        </label>
        <label className="block w-32 space-y-1.5">
          <span className="field-label">$ per M tokens out</span>
          <Input className="num" type="number" step="any" min={0} value={draft.outUsd} onChange={(e) => setDraft({ ...draft, outUsd: e.target.value })} />
        </label>
        <label className="block w-28 space-y-1.5">
          <span className="field-label">£ per $</span>
          <Input className="num" type="number" step="any" min={0.1} value={draft.gbpPerUsd} onChange={(e) => setDraft({ ...draft, gbpPerUsd: e.target.value })} />
        </label>
      </div>
      <p className="text-2xs text-muted-foreground">Prices are the cost line&apos;s defaults per model; check them against Anthropic&apos;s pricing page and edit if they differ.</p>
      <label className="flex items-center gap-2 text-sm"><Switch checked={draft.reviewSchedule} onCheckedChange={(v) => setDraft({ ...draft, reviewSchedule: v })} /> Run the monthly review on the 1st at 06:00 (last month; off by default)</label>
    </div>
  );
}

interface Lists { whitelist: string[]; blacklist: string[] }
interface ListsData { account: Lists; products: Record<string, Lists & { useAccount: boolean }> }

/** Settings → Ads → Keyword lists: the account's whitelist and blacklist, and a product's own. */
function KeywordListsEditor() {
  const [data, setData] = useState<ListsData | null>(null);
  const [products, setProducts] = useState<{ asin: string; title: string | null }[]>([]);
  const [scope, setScope] = useState("account");
  const [draft, setDraft] = useState<{ whitelist: string; blacklist: string; useAccount: boolean } | null>(null);
  const fill = (d: ListsData, sc: string) => {
    const l = sc === "account" ? { ...d.account, useAccount: true } : d.products[sc] ?? { whitelist: [], blacklist: [], useAccount: true };
    setDraft({ whitelist: l.whitelist.join("\n"), blacklist: l.blacklist.join("\n"), useAccount: l.useAccount });
  };
  useEffect(() => {
    api<ListsData>("/api/ads/keyword-lists").then((d) => { setData(d); fill(d, "account"); }).catch((e: Error) => toast.error(e.message));
    api<{ asins: { asin: string; title: string | null }[] }>("/api/ads/dashboard").then((r) => setProducts(r.asins.map((a) => ({ asin: a.asin, title: a.title })))).catch(() => {});
  }, []);
  if (!data || !draft) return null;
  const save = async () => {
    try {
      const d = await api<ListsData>("/api/ads/keyword-lists", { method: "PUT", json: { scope, whitelist: draft.whitelist, blacklist: draft.blacklist, useAccount: draft.useAccount } });
      setData(d);
      fill(d, scope);
      toast.success("Keyword lists saved: the rules use them from the next run");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-3 border-t pt-4" id="keyword-lists">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Keyword lists</h3>
          <p className="max-w-3xl text-sm text-muted-foreground"><b>Whitelist</b>: terms never negatived or paused (your brand name, the product&apos;s exact head terms); the rules skip them and say so. <b>Blacklist</b>: words or phrases always added as negative phrase to a product&apos;s new campaigns (the launcher and harvest&apos;s new Exact campaign), and proposed for its broad and auto campaigns. One term a line.</p>
        </div>
        <Button variant="outline" onClick={save}>Save lists</Button>
      </div>
      <label className="flex items-center gap-2 text-sm"><span className="field-label">Lists for</span>
        <NativeSelect value={scope} onChange={(e) => { setScope(e.target.value); fill(data, e.target.value); }}>
          <NativeSelectOption value="account">The whole account</NativeSelectOption>
          {products.map((p) => <NativeSelectOption key={p.asin} value={p.asin}>{p.asin}{p.title ? ` · ${p.title.slice(0, 40)}` : ""}</NativeSelectOption>)}
        </NativeSelect></label>
      {scope !== "account" && (
        <label className="flex items-center gap-2 text-sm"><Switch checked={draft.useAccount} onCheckedChange={(v) => setDraft({ ...draft, useAccount: v })} /> Also use the account&apos;s lists (these add to them){!draft.useAccount ? ": off, so only this product's own apply" : ""}</label>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1"><span className="field-label">Whitelist{scope !== "account" ? " (this product's own)" : ""}</span>
          <textarea className="min-h-24 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm" value={draft.whitelist} onChange={(e) => setDraft({ ...draft, whitelist: e.target.value })} placeholder="your brand\npill organiser 7 day" /></label>
        <label className="space-y-1"><span className="field-label">Blacklist{scope !== "account" ? " (this product's own)" : ""}</span>
          <textarea className="min-h-24 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm" value={draft.blacklist} onChange={(e) => setDraft({ ...draft, blacklist: e.target.value })} placeholder="free\nused\nreplacement" /></label>
      </div>
      {scope !== "account" && draft.useAccount && (data.account.whitelist.length > 0 || data.account.blacklist.length > 0) && (
        <p className="text-xs text-muted-foreground">Plus the account&apos;s: whitelist {data.account.whitelist.join(", ") || "—"}; blacklist {data.account.blacklist.join(", ") || "—"}.</p>
      )}
    </div>
  );
}
