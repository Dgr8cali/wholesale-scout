"use client";

import { ChevronRightIcon, FileUpIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePageCrumbs } from "@/components/Crumbs";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { TERM_STATUS_LABEL, type Ratios, type TermStatus, type Totals } from "@/lib/ads/metrics";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Economics {
  price: number; fees: number | null; landed: number | null; priceSource: "manual" | "keepa" | "ads" | null; referralCategory: string;
  referral: number | null; fba: number | null; storage: number | null; returns: number | null; sizeKnown: boolean; margin: number | null; breakEvenAcos: number | null; needs: string[];
}
interface AsinRow { asin: string; title: string | null; campaigns: number; totals: Totals; ratios: Ratios; economics: Economics; phase: "launch" | "steady"; targetAcos: number; profitAfterAds: number | null; from: string | null; to: string | null }
interface CampaignRow {
  id: string; name: string; state: string | null; targeting: string | null; asin: string | null; asin_source: string | null;
  totals: Totals | null; ratios: Ratios | null; source: string | null; from: string | null; to: string | null; breakEvenAcos: number | null; targetAcos: number; profitAfterAds: number | null;
}
interface TermRow { campaign: string; campaignName: string; term: string; asin: string | null; totals: Totals; ratios: Ratios; status: TermStatus; why: string; from: string; to: string; breakEvenAcos: number | null; targetAcos: number }
interface Dash { settings: { targetAcos: number; cpc: number; cpcAuto: boolean }; asins: AsinRow[]; campaigns: CampaignRow[]; terms: TermRow[]; imports: number }

const gbp = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}£${Math.abs(v).toFixed(2)}`);
const pct = (v: number | null | undefined, dp = 1) => (v == null ? "—" : `${(v * 100).toFixed(dp)}%`);
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("en-GB"));
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** ACoS against the target and break-even: green at or under the target, amber up to break-even, red over it. */
function acosTone(acos: number | null, target: number, breakEven: number | null) {
  if (acos == null) return "";
  if (acos <= target) return "text-pass";
  if (breakEven != null && acos > breakEven) return "text-fail";
  return "text-warn";
}

const STATUS_CLS: Record<TermStatus, string> = {
  converting: "bg-pass-soft text-pass", over_target: "bg-warn-soft text-warn", watch: "bg-empty-soft text-ink-2", waste: "bg-fail-soft text-fail",
};

const SOURCE_LABEL: Record<string, string> = {
  campaign: "campaign report", campaign_daily: "daily report", grid: "Campaign Manager export (range unknown)", search_term: "search terms summed",
};

/** Ads → Dashboard: per ASIN, per campaign and per search term, with break-even ACoS beside the actual. */
export default function AdsDashboardPage() {
  usePageCrumbs([{ label: "Ads", href: "/ads/dashboard" }, { label: "Dashboard" }]);
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Dash>("/api/ads/dashboard").then(setD).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState title="Couldn't load Ads" message={error} onRetry={load} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!d.campaigns.length) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Dashboard</h1>
        <EmptyState icon={<FileUpIcon />} title="No ad data yet — import a report" action={<Button asChild><Link href="/ads/imports">Import reports</Link></Button>}>
          Export a Search term report, a Campaign report or the Campaign Manager grid from Amazon Ads, and import it. Connect Amazon Ads once API access is approved.
        </EmptyState>
      </div>
    );
  }
  const unmapped = d.campaigns.filter((c) => !c.asin && c.totals);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Sponsored Products from {d.imports} import{d.imports === 1 ? "" : "s"}. Default target ACoS {d.settings.targetAcos}% (Settings → Ads, or per product below).
            ACoS is green at or under the target, amber up to break-even, red past it.
          </p>
        </div>
        <Button asChild variant="outline"><Link href="/ads/imports"><FileUpIcon /> Import reports</Link></Button>
      </div>

      {unmapped.length > 0 && (
        <section className="panel space-y-2 p-4">
          <h2 className="section-label">Campaigns without a product</h2>
          <p className="text-sm text-muted-foreground">A campaign whose name has no ASIN needs one to count towards a product. Set it in the campaign table below (the ASIN column).</p>
          <p className="text-sm">{unmapped.map((c) => c.name).join(" · ")}</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="section-label">Products</h2>
        {d.asins.length ? d.asins.map((a) => <AsinTile key={a.asin} a={a} onSaved={load} />) : <p className="text-sm text-muted-foreground">No campaign is linked to an ASIN yet.</p>}
      </section>

      <CampaignTable rows={d.campaigns} onSaved={load} />
      <TermTable rows={d.terms} campaigns={d.campaigns} />
    </div>
  );
}

function Metric({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn("num text-base font-medium", cls)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function AsinTile({ a, onSaved }: { a: AsinRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const e = a.economics;
  const t = a.totals, r = a.ratios;
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-heading text-base font-bold">{a.title ?? a.asin}</span>
        <a className="num text-xs text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${a.asin}`} target="_blank" rel="noreferrer">{a.asin}</a>
        <span className="text-xs text-muted-foreground">· {a.campaigns} campaign{a.campaigns === 1 ? "" : "s"} · {day(a.from)} – {day(a.to)} · {a.phase} · target ACoS {pct(a.targetAcos, 0)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Spend" value={gbp(t.cost)} />
        <Metric label="Sales" value={gbp(t.sales)} sub={`${n0(t.orders)} orders${t.units != null ? `, ${n0(t.units)} units` : ""}`} />
        <Metric label="ACoS" value={pct(r.acos)} cls={acosTone(r.acos, a.targetAcos, e.breakEvenAcos)} sub={`break-even ${pct(e.breakEvenAcos)}`} />
        <Metric label="Break-even ACoS" value={pct(e.breakEvenAcos)} sub={e.breakEvenAcos == null ? `needs ${e.needs.join(", ")}` : `margin ${gbp(e.margin)} of ${gbp(e.price)}`} />
        <Metric label="Profit after ads" value={gbp(a.profitAfterAds)} cls={a.profitAfterAds == null ? "" : a.profitAfterAds >= 0 ? "text-pass" : "text-fail"} sub="sales − fees − landed − spend" />
        <Metric label="Cost per order" value={gbp(r.costPerOrder)} />
        <Metric label="CPC" value={gbp(r.cpc)} />
        <Metric label="Conversion" value={pct(r.conversion)} sub="orders ÷ clicks" />
        <Metric label="CTR" value={pct(r.ctr, 2)} sub={`${n0(t.clicks)} clicks of ${n0(t.impressions)}`} />
        <Metric label="Fees a unit" value={gbp(e.fees)} sub={e.fees == null ? "needs the size" : `referral ${gbp(e.referral)}, FBA ${gbp(e.fba)}, storage ${gbp(e.storage)}, returns ${gbp(e.returns)}`} />
      </div>
      <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setOpen((v) => !v)}>
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} /> Price, costs and target
      </button>
      {open && <EconEditor a={a} onSaved={onSaved} />}
    </div>
  );
}

function EconEditor({ a, onSaved }: { a: AsinRow; onSaved: () => void }) {
  const e = a.economics;
  const [f, setF] = useState({
    price: e.priceSource === "manual" ? String(e.price) : "", landed: e.landed != null ? String(e.landed) : "", fba: "",
    weight: "", l: "", w: "", h: "", phase: a.phase, launch: "", steady: "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = async () => {
    setBusy("save");
    try {
      const product: Record<string, unknown> = { price: num(f.price), landed_cost: num(f.landed), phase: f.phase };
      if (f.fba.trim()) product.fba_fee = num(f.fba);
      if (f.weight.trim()) product.weight_g = num(f.weight);
      if (f.l && f.w && f.h) product.dims = { l: Number(f.l), w: Number(f.w), h: Number(f.h) };
      const body: Record<string, unknown> = { product };
      if (f.launch || f.steady) body.target = { launch: num(f.launch), steady: num(f.steady) };
      await api(`/api/ads/products/${a.asin}`, { method: "PUT", json: body });
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const keepa = async () => {
    setBusy("keepa");
    try {
      const r = await api<{ tokensUsed: number; found: boolean }>(`/api/ads/products/${a.asin}/keepa`, { method: "POST" });
      toast[r.found ? "success" : "error"](r.found ? `Size and weight from Keepa (${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"})` : "Keepa doesn't know this ASIN");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const field = (k: keyof typeof f, label: string, placeholder?: string, hint?: string) => (
    <label className="space-y-1">
      <span className="field-label">{label}</span>
      <Input className="num" type="number" step="any" value={f[k]} placeholder={placeholder} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />
      {hint && <span className="block text-2xs text-muted-foreground">{hint}</span>}
    </label>
  );
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {field("price", "Sale price (£)", e.priceSource !== "manual" ? String(e.price) : undefined, e.priceSource === "ads" ? "Blank: the ads' average (sales ÷ units)" : e.priceSource === "keepa" ? "Blank: Keepa's Buy Box" : undefined)}
        {field("landed", "Landed cost a unit (£)", undefined, "Needed for break-even")}
        {field("fba", "FBA fee override (£, ex-VAT)", e.fba != null ? (e.fba / 1.224).toFixed(2) : undefined, "Blank: the rate card")}
        {field("weight", "Package weight (g)")}
        <div className="space-y-1">
          <span className="field-label">Package L × W × H (cm)</span>
          <div className="flex gap-1">{(["l", "w", "h"] as const).map((k) => <Input key={k} className="num" type="number" step="any" value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />)}</div>
          <span className="block text-2xs text-muted-foreground">{e.sizeKnown ? "Blank: as stored" : "Unknown: enter it or fetch it"}</span>
        </div>
        <label className="space-y-1">
          <span className="field-label">Phase</span>
          <NativeSelect className="w-full" value={f.phase} onChange={(ev) => setF({ ...f, phase: ev.target.value as "launch" | "steady" })}>
            <NativeSelectOption value="launch">Launch</NativeSelectOption><NativeSelectOption value="steady">Steady</NativeSelectOption>
          </NativeSelect>
        </label>
        {field("launch", "Target ACoS, launch (%)", undefined, "Blank: Settings → Ads")}
        {field("steady", "Target ACoS, steady (%)", undefined, "Blank: Settings → Ads")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={!!busy}>{busy === "save" && <LoaderIcon className="animate-spin" />} Save</Button>
        {!e.sizeKnown && <Button size="sm" variant="outline" onClick={keepa} disabled={!!busy}>{busy === "keepa" && <LoaderIcon className="animate-spin" />} Size and weight from Keepa (1 token)</Button>}
        <span className="text-xs text-muted-foreground">Referral category: {e.referralCategory}. Fees from the active rate card, VAT and the digital services fee included.</span>
      </div>
    </div>
  );
}

function AsinCell({ c, onSaved }: { c: CampaignRow; onSaved: () => void }) {
  const [v, setV] = useState(c.asin ?? "");
  const [editing, setEditing] = useState(false);
  const save = async () => {
    try {
      await api(`/api/ads/campaigns/${c.id}`, { method: "PATCH", json: { asin: v.trim() || null } });
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (!editing) {
    return (
      <button type="button" className={cn("num text-xs hover:underline", c.asin ? "" : "font-medium text-brand")} onClick={() => setEditing(true)} title={c.asin_source === "name" ? "From the campaign's name" : c.asin ? "Set by you" : "Set the ASIN this campaign advertises"}>
        {c.asin ?? "Set ASIN"}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Input autoFocus className="num h-7 w-28 text-xs uppercase" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
      <Button size="xs" onClick={save}>Save</Button>
    </span>
  );
}

function CampaignTable({ rows, onSaved }: { rows: CampaignRow[]; onSaved: () => void }) {
  return (
    <section className="space-y-2">
      <h2 className="section-label">Campaigns</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-1.5">Campaign</th><th className="px-2 py-1.5">ASIN</th><th className="px-2 py-1.5 text-right">Impr.</th><th className="px-2 py-1.5 text-right">Clicks</th>
            <th className="px-2 py-1.5 text-right">CTR</th><th className="px-2 py-1.5 text-right">Spend</th><th className="px-2 py-1.5 text-right">CPC</th><th className="px-2 py-1.5 text-right">Orders</th>
            <th className="px-2 py-1.5 text-right">Conv.</th><th className="px-2 py-1.5 text-right">Sales</th><th className="px-2 py-1.5 text-right">ACoS</th><th className="px-2 py-1.5 text-right">Break-even</th>
            <th className="px-2 py-1.5 text-right">Per order</th><th className="px-2 py-1.5 text-right">Profit after ads</th>
          </tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id} className="border-b last:border-b-0">
              <td className="px-2 py-1.5">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{[c.state?.toLowerCase(), c.targeting?.toLowerCase(), c.source ? SOURCE_LABEL[c.source] : "no figures", c.from ? `${day(c.from)} – ${day(c.to)}` : c.source === "grid" ? `as exported ${day(c.to)}` : null].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="px-2 py-1.5"><AsinCell c={c} onSaved={onSaved} /></td>
              <td className="num px-2 py-1.5 text-right">{n0(c.totals?.impressions)}</td>
              <td className="num px-2 py-1.5 text-right">{n0(c.totals?.clicks)}</td>
              <td className="num px-2 py-1.5 text-right">{pct(c.ratios?.ctr, 2)}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(c.totals?.cost)}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(c.ratios?.cpc)}</td>
              <td className="num px-2 py-1.5 text-right">{n0(c.totals?.orders)}</td>
              <td className="num px-2 py-1.5 text-right">{pct(c.ratios?.conversion)}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(c.totals?.sales)}</td>
              <td className={cn("num px-2 py-1.5 text-right font-medium", acosTone(c.ratios?.acos ?? null, c.targetAcos, c.breakEvenAcos))}>{pct(c.ratios?.acos)}</td>
              <td className="num px-2 py-1.5 text-right text-muted-foreground">{pct(c.breakEvenAcos)}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(c.ratios?.costPerOrder)}</td>
              <td className={cn("num px-2 py-1.5 text-right", c.profitAfterAds == null ? "" : c.profitAfterAds >= 0 ? "text-pass" : "text-fail")}>{gbp(c.profitAfterAds)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

type TermSort = "cost" | "clicks" | "orders" | "acos";

function TermTable({ rows, campaigns }: { rows: TermRow[]; campaigns: CampaignRow[] }) {
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState<"" | TermStatus>("");
  const [sort, setSort] = useState<TermSort>("cost");
  const shown = useMemo(() => rows
    .filter((t) => (!campaign || t.campaign === campaign) && (!status || t.status === status))
    .sort((a, b) => sort === "acos" ? (b.ratios.acos ?? -1) - (a.ratios.acos ?? -1) : (b.totals[sort] as number) - (a.totals[sort] as number)), [rows, campaign, status, sort]);
  const counts = useMemo(() => rows.filter((t) => !campaign || t.campaign === campaign).reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }), {}), [rows, campaign]);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="section-label mr-auto">Search terms</h2>
        <label className="space-y-1"><span className="field-label">Campaign</span>
          <NativeSelect value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <NativeSelectOption value="">All campaigns</NativeSelectOption>
            {campaigns.filter((c) => rows.some((t) => t.campaign === c.id)).map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Status</span>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as "" | TermStatus)}>
            <NativeSelectOption value="">Any ({Object.values(counts).reduce((a, b) => a + b, 0)})</NativeSelectOption>
            {(Object.keys(TERM_STATUS_LABEL) as TermStatus[]).map((s) => <NativeSelectOption key={s} value={s}>{TERM_STATUS_LABEL[s]} ({counts[s] ?? 0})</NativeSelectOption>)}
          </NativeSelect></label>
        <label className="space-y-1"><span className="field-label">Sort</span>
          <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as TermSort)}>
            <NativeSelectOption value="cost">Spend</NativeSelectOption><NativeSelectOption value="clicks">Clicks</NativeSelectOption><NativeSelectOption value="orders">Orders</NativeSelectOption><NativeSelectOption value="acos">ACoS</NativeSelectOption>
          </NativeSelect></label>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-1.5">Search term</th><th className="px-2 py-1.5">Campaign</th><th className="px-2 py-1.5 text-right">Clicks</th><th className="px-2 py-1.5 text-right">Orders</th>
            <th className="px-2 py-1.5 text-right">Spend</th><th className="px-2 py-1.5 text-right">ACoS</th><th className="px-2 py-1.5 text-right">Break-even</th><th className="px-2 py-1.5">Status</th>
          </tr></thead>
          <tbody>{shown.map((t) => (
            <Fragment key={`${t.campaign}|${t.term}`}>
              <tr className="border-b last:border-b-0">
                <td className="px-2 py-1.5">{t.term}</td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{t.campaignName}</td>
                <td className="num px-2 py-1.5 text-right">{n0(t.totals.clicks)}</td>
                <td className="num px-2 py-1.5 text-right">{n0(t.totals.orders)}</td>
                <td className="num px-2 py-1.5 text-right">{gbp(t.totals.cost)}</td>
                <td className={cn("num px-2 py-1.5 text-right", acosTone(t.ratios.acos, t.targetAcos, t.breakEvenAcos))}>{pct(t.ratios.acos)}</td>
                <td className="num px-2 py-1.5 text-right text-muted-foreground">{pct(t.breakEvenAcos)}</td>
                <td className="px-2 py-1.5"><span title={t.why} className={cn("cursor-help rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CLS[t.status])}>{TERM_STATUS_LABEL[t.status]}</span></td>
              </tr>
            </Fragment>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Converting: orders at or under the target ACoS. Over target: orders above it. Watch: no order yet, under 15 clicks. Waste: no order after 15 clicks, or after spending half the product&apos;s price. Phase 2&apos;s proposals will use the same thresholds.</p>
    </section>
  );
}
