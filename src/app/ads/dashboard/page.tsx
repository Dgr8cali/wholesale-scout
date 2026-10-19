"use client";

import { ChevronRightIcon, FileUpIcon, HistoryIcon, LayoutDashboardIcon, LoaderIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ImportFlow, ImportsHistory } from "@/components/ads/ImportFlow";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTab } from "@/lib/ui/useTab";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sparkline } from "@/components/results/Sparkline";
import { ProductPicker, useAdsProduct } from "@/components/ads/ProductPicker";
import { SortTh, useSortable } from "@/components/SortableTable";
import { ProductThumb } from "@/components/ProductThumb";
import { ExplainPanel, TargetsPanel } from "@/components/ads/AiPanels";
import { Skeleton } from "@/components/ui/skeleton";
import type { Ratios, TermStatus, Totals } from "@/lib/ads/metrics";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { KeywordBankPanel } from "@/components/ads/KeywordBank";

interface Economics {
  price: number; fees: number | null; landed: number | null; priceSource: "manual" | "keepa" | "ads" | null; referralCategory: string;
  referral: number | null; fba: number | null; storage: number | null; returns: number | null; sizeKnown: boolean; margin: number | null; breakEvenAcos: number | null; needs: string[];
}
interface Insights {
  period: string; tacos: number | null; organicShare: number | null; share30: { value: number; period: string } | null; reviews: number | null; suggestTacos: boolean;
  split: { adUnits: number; totalUnits: number | null; adSales: number; totalSales: number | null };
  breakEvenTacos: number | null; optimise: "acos" | "tacos"; targetTacos: number | null; acosForTacos: { acos: number; adShare: number | null; capped: boolean } | null;
  health: { status: "ok" | "problem" | "not enough data"; message: string; problems: string[] };
}
interface AsinRow { asin: string; title: string | null; campaigns: number; totals: Totals; ratios: Ratios; economics: Economics; phase: "launch" | "steady"; targetAcos: number; profitAfterAds: number | null; from: string | null; to: string | null; insights?: Insights }
interface CampaignRow {
  id: string; name: string; state: string | null; targeting: string | null; asin: string | null; asin_source: string | null;
  totals: Totals | null; ratios: Ratios | null; source: string | null; from: string | null; to: string | null; breakEvenAcos: number | null; targetAcos: number; profitAfterAds: number | null;
  bidding_strategy: string | null; budget: number | null; keywords: number; negatives: number; advertised: string[];
  placements: { placement: string; percentage: number | null; totals: Totals; ratios: Ratios; from: string | null; to: string | null }[];
}
interface Matched { text: string; matchType: string | null; clicks: number; cost: number; orders: number }
interface TermRow { campaign: string; campaignName: string; term: string; asin: string | null; totals: Totals; ratios: Ratios; status: TermStatus; why: string; from: string; to: string; breakEvenAcos: number | null; targetAcos: number; matched: Matched[] }
interface Stock { fulfillable: number; inbound: number; home?: number; tiktok_fbt?: number; total?: number; unitsPerDay: number | null; daysOfCover: number | null; source: string; updatedAt: string | null }
interface Plan { asin: string; start_date: string; input: { price: number; headTerms: string[] }; plan: { from: string; to: string | null; title: string; detail: string }[]; batch_id: string | null }
interface KeywordRow { keywordId: string; campaign: string; campaignName: string; asin: string | null; text: string; matchType: string; bid: number | null; state: string | null; clicks: number; cost: number; orders: number; sales: number; ranks: { position: number | null; page: number | null; checkedAt: string }[] }
interface Dash { settings: { targetAcos: number; cpc: number; cpcAuto: boolean }; asins: AsinRow[]; campaigns: CampaignRow[]; terms: TermRow[]; imports: number; stock: Record<string, Stock>; plans: Plan[]; keywords: KeywordRow[];
  looks: Record<string, { title: string | null; image: string | null; candidate?: string | null }>; archived: { id: string; name: string; campaign_id: string | null; state: string | null }[] }

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

const SOURCE_LABEL: Record<string, string> = {
  campaign: "bulk export or campaign report", campaign_daily: "daily report", grid: "Campaign Manager export (range unknown)", search_term: "search terms summed",
};

/** Ads → Dashboard: per ASIN, per campaign and per search term, with break-even ACoS beside the actual. */
export default function AdsDashboardPage() {
  return <Suspense><AdsDashboard /></Suspense>;
}

const TABS = ["overview", "imports"] as const;
type Tab = (typeof TABS)[number];

function AdsDashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<Dash>("/api/ads/dashboard").then(setD).catch((e: Error) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // ?asin= (the product picker) belongs to the Overview tab but survives a trip to the history.
  const [tab, setTab] = useTab(TABS, ["asin"]);
  // ?import=1 (⌘K's Import ads bulk file, the empty states) opens the import sheet; closing it drops the flag.
  const params = useSearchParams();
  const router = useRouter();
  const [importing, setImportingState] = useState(() => params.get("import") === "1");
  const setImporting = (open: boolean) => {
    setImportingState(open);
    if (!open && params.has("import")) {
      const q = new URLSearchParams(params.toString());
      q.delete("import");
      router.replace(q.size ? `/ads/dashboard?${q}` : "/ads/dashboard", { scroll: false });
    }
  };
  const [imported, setImported] = useState(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        crumbs={[{ label: "Ads", href: "/ads/dashboard" }, { label: "Dashboard" }]}
        subtitle={d ? `Sponsored Products from ${d.imports} import${d.imports === 1 ? "" : "s"}, product by product.` : "Sponsored Products, product by product."}
        info={<>
          <p>ACoS is green at or under the target, amber up to break-even, red past it.{d ? ` Default target ACoS ${d.settings.targetAcos}% (Ads → Rules → Ad settings, or per product).` : ""}</p>
          <p><b>Import</b> takes the bulk export from Amazon Ads (Campaign manager → Bulk operations, with the search term data): campaigns, placements, ad groups, keywords with their IDs and bids, negatives, product ads (which map campaigns to ASINs) and search terms. CSV reports still work: Search term, Campaign, the Campaign Manager grid, and the daily Campaign and Placement reports, which the Bid up, Budget and Revive rules need. Importing the same data again doesn&apos;t double it.</p>
        </>}
        actions={<Button onClick={() => setImporting(true)}><FileUpIcon /> Import</Button>}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList aria-label="Dashboard">
          <TabsTrigger value="overview" className="px-3"><LayoutDashboardIcon /> Overview</TabsTrigger>
          <TabsTrigger value="imports" className="px-3"><HistoryIcon /> Imports history</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          {error ? <ErrorState title="Couldn't load Ads" message={error} onRetry={load} />
            : !d ? <div className="space-y-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
            : !d.campaigns.length ? (
              <EmptyState icon={<FileUpIcon />} title="No ad data yet — import a report" action={<Button onClick={() => setImporting(true)}><FileUpIcon /> Import</Button>}>
                Export the bulk export from Amazon Ads and import it. New to running ads here? <Link className="text-primary underline" href="/help/ads-playbook">Ads: the playbook</Link> goes from setting a product up to the weekly loop.
              </EmptyState>
            ) : <Dashboard d={d} load={load} />}
        </TabsContent>
        <TabsContent value="imports"><ImportsHistory refresh={imported} /></TabsContent>
      </Tabs>
      <Sheet open={importing} onOpenChange={setImporting}>
        <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Import Amazon Ads data</SheetTitle>
            <SheetDescription>The bulk export (.xlsx) or CSV reports. Nothing is imported until you confirm.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6"><ImportFlow onImported={() => { load(); setImported((n) => n + 1); }} /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** One section per product (picked, or all), then the campaigns no product owns, then the archived ones. */
function Dashboard({ d, load }: { d: Dash; load: () => void }) {
  const unmapped = d.campaigns.filter((c) => !c.asin);
  const launchOnly = d.plans.filter((p) => !d.asins.some((a) => a.asin === p.asin));
  const products = [...d.asins.map((a) => ({ asin: a.asin, title: d.looks?.[a.asin]?.title ?? a.title })), ...launchOnly.map((p) => ({ asin: p.asin, title: d.looks?.[p.asin]?.title ?? null }))];
  const [pick, setPick] = useAdsProduct(products.map((p) => p.asin));
  const shown = (asin: string) => !pick || pick === asin;
  const unlisted = !!pick && !products.some((p) => p.asin === pick);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        {(products.length > 1 || unlisted) && <ProductPicker products={products} value={pick} onChange={setPick} />}
        <FetchStock onDone={load} />
      </div>

      {unlisted && <p className="panel p-4 text-sm text-muted-foreground"><span className="num">{pick}</span> has no ads data yet: no imported campaign and no launch plan. <button type="button" className="text-brand underline" onClick={() => setPick("")}>Show all products</button></p>}
      {!products.length && <p className="panel p-4 text-sm text-muted-foreground">No campaign is linked to a product yet: assign one below. Then see <Link className="text-brand underline" href="/help/ads-playbook">Ads: the playbook</Link> for the weekly loop.</p>}
      {d.asins.filter((a) => shown(a.asin)).map((a) => (
        <ProductSection key={a.asin} asin={a.asin} look={d.looks?.[a.asin]} stock={d.stock[a.asin]} plan={d.plans.find((p) => p.asin === a.asin)} onSaved={load}
          sub={`${a.campaigns} campaign${a.campaigns === 1 ? "" : "s"} · ${day(a.from)} – ${day(a.to)} · ${a.phase} · target ACoS ${pct(a.targetAcos, 0)}`}>
          <AsinTile a={a} onSaved={load} />
          {a.insights && <ListingHealth h={a.insights.health} />}
          <ExplainPanel asin={a.asin} />
          <KeywordBankPanel asin={a.asin} />
          <CampaignTable rows={d.campaigns.filter((c) => c.asin === a.asin)} onSaved={load} />
          <KeywordTable rows={d.keywords.filter((k) => k.asin === a.asin)} />
          <p className="text-sm"><Link className="font-medium text-primary hover:underline" href={`/ads/search-terms?tab=all&asin=${a.asin}`}>Search terms ({d.terms.filter((t) => t.asin === a.asin).length}) →</Link> <span className="text-muted-foreground">with their status, the n-grams and the keyword bank</span></p>
        </ProductSection>
      ))}
      {launchOnly.filter((p) => shown(p.asin)).map((p) => (
        <ProductSection key={p.asin} asin={p.asin} look={d.looks?.[p.asin]} stock={d.stock[p.asin]} plan={p} onSaved={load} sub={`launching at ${gbp(p.input.price)} · no campaign data imported yet`} />
      ))}

      <UnassignedSection campaigns={unmapped} onSaved={load} />
      {d.archived.length > 0 && (
        <details className="panel px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Archived campaigns ({d.archived.length})</summary>
          <p className="mt-1 text-xs text-muted-foreground">Left out of the dashboard and the rules. Their data stays.</p>
          <ul className="mt-2 space-y-1">{d.archived.map((c) => (
            <li key={c.id} className="flex items-center gap-2">{c.name} <span className="text-xs text-muted-foreground">{c.state}</span>
              <Button size="xs" variant="ghost" onClick={async () => { await api(`/api/ads/campaigns/${c.id}`, { method: "PATCH", json: { archived: false } }); load(); }}>Unarchive</Button></li>
          ))}</ul>
        </details>
      )}
    </div>
  );
}

/** A product: title, ASIN and image, stock, launch plan; open, its figures, campaigns, keywords and search terms. */
function ProductSection({ asin, look, sub, stock, plan, onSaved, children }: { asin: string; look?: { title: string | null; image: string | null; candidate?: string | null }; sub: string; stock: Stock | undefined; plan: Plan | undefined; onSaved: () => void; children?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const fetchLook = async () => {
    setBusy(true);
    try {
      const r = await api<{ tokensUsed: number; found: boolean }>(`/api/ads/products/${asin}/keepa`, { method: "POST" });
      toast[r.found ? "success" : "error"](r.found ? `Title and image from Keepa (${r.tokensUsed} token${r.tokensUsed === 1 ? "" : "s"})` : "Keepa doesn't have this ASIN");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"}>
          <ChevronRightIcon className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
        <ProductThumb url={look?.image} asin={asin} title={look?.title ?? null} brand={null} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-heading text-base font-bold">{look?.title ?? asin}</span>
            <a className="num text-xs text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${asin}`} target="_blank" rel="noreferrer">{asin}</a>
            <StockChip s={stock} />
          </div>
          <div className="text-xs text-muted-foreground">{sub}{look?.candidate && <> · <Link href={`/pl/candidates?c=${look.candidate}`} className="text-brand hover:underline">Private label candidate →</Link></>}</div>
        </div>
        {(!look?.image || !look?.title) && <Button size="xs" variant="outline" disabled={busy} onClick={fetchLook} title="Keepa: title, image, size and weight">{busy ? <LoaderIcon className="animate-spin" /> : null} Title and image (1 token)</Button>}
      </div>
      {open && (
        <>
          {plan && <PlanLine plan={plan} />}
          {children}
        </>
      )}
    </section>
  );
}

interface Match { asin: string; title: string | null; image: string | null; source: string }

/** Campaigns no product owns: find the product by ASIN or name (free), check it, assign; or archive. */
function UnassignedSection({ campaigns, onSaved }: { campaigns: CampaignRow[]; onSaved: () => void }) {
  if (!campaigns.length) return null;
  return (
    <section className="panel space-y-3 p-4">
      <div>
        <h2 className="section-label">Campaigns without a product</h2>
        <p className="text-sm text-muted-foreground">They don&apos;t count towards any product until you assign one. Search by ASIN or by words of the title (Ads products, your wholesale products, Niche Hunt and Keepa&apos;s cache: free). Archive the ones you don&apos;t care about: they leave the dashboard and the rules.</p>
      </div>
      <div className="divide-y rounded-lg border">
        {campaigns.map((c) => <UnassignedRow key={c.id} c={c} onSaved={onSaved} />)}
      </div>
    </section>
  );
}

function UnassignedRow({ c, onSaved }: { c: CampaignRow; onSaved: () => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [chosen, setChosen] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => api<{ matches: Match[] }>(`/api/ads/products/search?q=${encodeURIComponent(q.trim())}`).then((r) => setMatches(r.matches)).catch(() => setMatches([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const searching = q.trim().length >= 2;
  const isAsin = /^[A-Z0-9]{10}$/i.test(q.trim());
  const keepa = async () => {
    setBusy(true);
    try {
      const asin = q.trim().toUpperCase();
      const r = await api<{ found: boolean; tokensUsed: number }>(`/api/ads/products/${asin}/keepa`, { method: "POST" });
      if (!r.found) { toast.error("Keepa doesn't have that ASIN"); return; }
      const s = await api<{ matches: Match[] }>(`/api/ads/products/search?q=${asin}`);
      setMatches(s.matches);
      setChosen(s.matches.find((m) => m.asin === asin) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const assign = async () => {
    if (!chosen) return;
    try {
      await api(`/api/ads/campaigns/${c.id}`, { method: "PATCH", json: { asin: chosen.asin } });
      toast.success(`"${c.name}" now counts towards ${chosen.title ?? chosen.asin}`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const archive = async () => {
    await api(`/api/ads/campaigns/${c.id}`, { method: "PATCH", json: { archived: true } });
    toast.success(`"${c.name}" archived`);
    onSaved();
  };
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-muted-foreground">{[c.state, c.targeting, c.totals ? `${n0(c.totals.clicks)} clicks, ${gbp(c.totals.cost)} spent, ${n0(c.totals.orders)} orders` : "no figures", c.advertised.length ? `product ads: ${c.advertised.join(", ")}` : null].filter(Boolean).join(" · ")}</div>
        </div>
        <Input className="h-8 w-64" placeholder="ASIN or product name" value={q} onChange={(e) => { setQ(e.target.value); setChosen(null); }} aria-label={`Find the product for ${c.name}`} />
        <Button size="xs" variant="ghost" onClick={archive}>Archive</Button>
      </div>
      {c.advertised.length > 1 && !q && (
        <div className="flex flex-wrap gap-1 text-xs"><span className="text-muted-foreground">Its product ads:</span>{c.advertised.map((a) => <button key={a} type="button" className="rounded border px-1.5 hover:bg-surface-2" onClick={() => setQ(a)}>{a}</button>)}</div>
      )}
      {searching && matches && !chosen && (
        <div className="space-y-1">
          {matches.map((m) => (
            <button key={m.asin} type="button" onClick={() => setChosen(m)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface-2">
              <ProductThumb url={m.image} asin={m.asin} title={m.title} brand={null} size={28} />
              <span className="min-w-0 flex-1 truncate">{m.title ?? <span className="text-muted-foreground">no title yet</span>}</span>
              <span className="num text-xs">{m.asin}</span><span className="text-xs text-muted-foreground">{m.source}</span>
            </button>
          ))}
          {!matches.length && <p className="px-2 text-xs text-muted-foreground">Nothing in the app matches.{isAsin ? "" : " Try the ASIN."}</p>}
          {isAsin && !matches.some((m) => m.asin === q.trim().toUpperCase() && m.title) && (
            <Button size="xs" variant="outline" disabled={busy} onClick={keepa}>{busy ? <LoaderIcon className="animate-spin" /> : null} Look up {q.trim().toUpperCase()} on Keepa (1 token)</Button>
          )}
        </div>
      )}
      {chosen && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 p-2 text-sm">
          <ProductThumb url={chosen.image} asin={chosen.asin} title={chosen.title} brand={null} size={44} />
          <div className="min-w-0 flex-1"><div className="font-medium">{chosen.title ?? "No title yet"}</div><div className="num text-xs text-muted-foreground">{chosen.asin} · {chosen.source}</div></div>
          <Button size="xs" onClick={assign}>Assign to this product</Button>
          <Button size="xs" variant="ghost" onClick={() => setChosen(null)}>Back</Button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn("num text-base font-medium", cls)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Days of cover: red under 3, amber under 10, plain to 21, green above. */
function StockChip({ s }: { s: Stock | undefined }) {
  if (!s) return <span className="text-xs text-muted-foreground" title="No FBA inventory for this ASIN in the last sync">stock unknown</span>;
  const d = s.daysOfCover;
  const cls = d == null ? "bg-empty-soft text-ink-2" : d < 3 ? "bg-fail-soft text-fail" : d < 10 ? "bg-warn-soft text-warn" : d <= 21 ? "bg-empty-soft text-ink-2" : "bg-pass-soft text-pass";
  const days = d == null ? "—" : d >= 9999 ? "no sales" : `${d < 10 ? d.toFixed(1) : Math.round(d)} days`;
  return (
    <span className={cn("cursor-help rounded-full px-2 py-0.5 text-xs font-semibold", cls)}
      title={`${s.fulfillable} fulfillable at FBA${s.inbound ? `, ${s.inbound} inbound` : ""}${s.home || s.tiktok_fbt ? `; ${s.home ?? 0} self-ship, ${s.tiktok_fbt ?? 0} TikTok FBT (Stock)` : ""}; ${s.unitsPerDay != null ? `${s.unitsPerDay.toFixed(2)} units a day` : "no sales rate"} (${s.source})${s.updatedAt ? `; stock as of ${new Date(s.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`}>
      {s.total ?? s.fulfillable} in stock · {days} of cover
    </span>
  );
}

function FetchStock({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await api<{ ok: boolean; skus: number; error: string | null }>("/api/ads/inventory", { method: "POST" });
        toast.success(`FBA stock fetched: ${r.skus} SKUs`);
        onDone();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    }}>{busy ? <LoaderIcon className="animate-spin" /> : null} Fetch stock</Button>
  );
}

/** Where a launch is in its 60-day plan. */
function PlanLine({ plan }: { plan: Plan }) {
  const today = new Date().toISOString().slice(0, 10);
  const cur = [...plan.plan].reverse().find((p) => p.from <= today);
  const next = plan.plan.find((p) => p.from > today);
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <b>Launch plan</b> from {day(plan.start_date)}: {cur ? <><b>{cur.title}</b> <span className="text-muted-foreground">({cur.detail})</span></> : <>starts {day(plan.start_date)}</>}
      {next && <span className="text-muted-foreground"> Next: {next.title} on {day(next.from)}.</span>}
      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">{plan.plan.map((p) => <span key={p.from}>{day(p.from)}: {p.title}</span>)}</div>
    </div>
  );
}

/** The product's figures and its "Price, costs and target" panel. */
function AsinTile({ a, onSaved }: { a: AsinRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const e = a.economics;
  const t = a.totals, r = a.ratios;
  return (
    <div className="space-y-3">
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
        {a.insights && <Metric label="Organic share" value={pct(a.insights.organicShare, 0)} sub={a.insights.organicShare == null ? "needs Amazon's orders for the period" : `of ${n0(a.insights.split.totalUnits)} units sold · TACoS ${pct(a.insights.tacos)}`} />}
      </div>
      {a.insights?.optimise === "tacos" && a.insights.acosForTacos && (
        <p className="text-xs text-muted-foreground">TACoS mode: target TACoS {pct(a.insights.targetTacos, 0)}{a.insights.acosForTacos.adShare ? ` ÷ ${pct(a.insights.acosForTacos.adShare, 0)} ad share of sales = ${pct(a.insights.acosForTacos.acos, 0)} ACoS allowed${a.insights.acosForTacos.capped ? " (capped at 100%)" : ""}` : " (no sales split yet: used as the ACoS target)"}. The bid rules use it.</p>
      )}
      {a.insights?.suggestTacos && (
        <p className="rounded-md bg-brand-soft/50 px-3 py-1.5 text-xs">Organic sales are {pct(a.insights.share30?.value ?? null, 0)} of units ({a.insights.share30?.period}) with {a.insights.reviews} reviews: consider <b>TACoS mode</b> (Price, costs and target), so the ads are judged on all sales, not only their own.</p>
      )}
      <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setOpen((v) => !v)}>
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} /> Price, costs and target
      </button>
      {open && <EconEditor a={a} onSaved={onSaved} />}
    </div>
  );
}

function EconEditor({ a, onSaved }: { a: AsinRow; onSaved: () => void }) {
  const e = a.economics;
  const ins = a.insights;
  const [f, setF] = useState({
    price: e.priceSource === "manual" ? String(e.price) : "", landed: e.landed != null ? String(e.landed) : "", fba: "",
    weight: "", l: "", w: "", h: "", phase: a.phase, launch: "", steady: "",
    optimise: ins?.optimise ?? "acos", tacos: ins?.optimise === "tacos" && ins.targetTacos != null && ins.targetTacos !== ins.breakEvenTacos ? String(Math.round(ins.targetTacos * 1000) / 10) : "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = async () => {
    setBusy("save");
    try {
      const product: Record<string, unknown> = { price: num(f.price), landed_cost: num(f.landed), phase: f.phase, optimise: f.optimise, target_tacos: num(f.tacos) };
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
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
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
          <span className="block text-xs text-muted-foreground">{e.sizeKnown ? "Blank: as stored" : "Unknown: enter it or fetch it"}</span>
        </div>
        <label className="space-y-1">
          <span className="field-label">Phase</span>
          <NativeSelect className="w-full" value={f.phase} onChange={(ev) => setF({ ...f, phase: ev.target.value as "launch" | "steady" })}>
            <NativeSelectOption value="launch">Launch</NativeSelectOption><NativeSelectOption value="steady">Steady</NativeSelectOption>
          </NativeSelect>
        </label>
        {field("launch", "Target ACoS, launch (%)", undefined, "Blank: Ads → Rules → Ad settings")}
        {field("steady", "Target ACoS, steady (%)", undefined, "Blank: Ads → Rules → Ad settings")}
      </div>
      <div className="grid gap-3 rounded-md bg-surface-2 p-3 sm:grid-cols-[12rem_12rem_1fr]">
        <label className="space-y-1">
          <span className="field-label">Optimise for</span>
          <NativeSelect className="w-full" value={f.optimise} onChange={(ev) => setF({ ...f, optimise: ev.target.value as "acos" | "tacos" })}>
            <NativeSelectOption value="acos">ACoS (default)</NativeSelectOption><NativeSelectOption value="tacos">TACoS</NativeSelectOption>
          </NativeSelect>
        </label>
        {f.optimise === "tacos" ? field("tacos", "Target TACoS (%)", ins?.breakEvenTacos != null ? (ins.breakEvenTacos * 100).toFixed(1) : undefined, `Blank: break-even TACoS ${pct(ins?.breakEvenTacos ?? null)}`) : <span />}
        <p className="text-xs text-muted-foreground">
          <b>TACoS</b> = ad spend ÷ all sales (ads and organic){ins?.tacos != null ? `: ${pct(ins.tacos)} ${ins.period}` : ""}. Break-even TACoS = margin ÷ price{ins?.breakEvenTacos != null ? ` = ${pct(ins.breakEvenTacos)}` : ""}: the ads may take the whole margin of every unit sold, organic + ad{ins?.split.totalUnits != null ? ` (${n0(ins.split.totalUnits)} units, ${n0(ins.split.adUnits)} from ads)` : ""}, not only the ad-attributed ones. In TACoS mode the bid rules compare with the ACoS the target TACoS allows (target TACoS ÷ the ad share of sales), Ranked eases off 25% instead of 20%, and their reasons say &ldquo;TACoS mode&rdquo;. Worth it once organic sales carry the product (over half for 30 days, 30+ reviews).
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={!!busy}>{busy === "save" && <LoaderIcon className="animate-spin" />} Save</Button>
        {!e.sizeKnown && <Button size="sm" variant="outline" onClick={keepa} disabled={!!busy}>{busy === "keepa" && <LoaderIcon className="animate-spin" />} Size and weight from Keepa (1 token)</Button>}
        <span className="text-xs text-muted-foreground">Referral category: {e.referralCategory}. Fees from the active rate card, VAT and the digital services fee included.</span>
      </div>
      <TargetsPanel asin={a.asin} onApplied={onSaved} />
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
      <button type="button" className={cn("num text-xs hover:underline", c.asin ? "" : "font-medium text-brand")} onClick={() => setEditing(true)} title={c.asin_source === "product_ad" ? "From the campaign's product ads" : c.asin_source === "name" ? "From the campaign's name" : c.asin ? "Set by you" : c.advertised.length > 1 ? `Its product ads advertise ${c.advertised.join(", ")}: set which one it counts towards` : "Set the ASIN this campaign advertises"}>
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
  const [open, setOpen] = useState<Set<string>>(new Set());
  const s = useSortable("ads.campaigns", rows, {
    name: { value: (c) => c.name, kind: "text" }, asin: { value: (c) => c.asin, kind: "text" },
    impressions: { value: (c) => c.totals?.impressions, kind: "number" }, clicks: { value: (c) => c.totals?.clicks, kind: "number" },
    ctr: { value: (c) => c.ratios?.ctr, kind: "number" }, cost: { value: (c) => c.totals?.cost, kind: "number" },
    cpc: { value: (c) => c.ratios?.cpc, kind: "number" }, orders: { value: (c) => c.totals?.orders, kind: "number" },
    conversion: { value: (c) => c.ratios?.conversion, kind: "number" }, sales: { value: (c) => c.totals?.sales, kind: "number" },
    acos: { value: (c) => c.ratios?.acos, kind: "number" }, breakEven: { value: (c) => c.breakEvenAcos, kind: "number" },
    perOrder: { value: (c) => c.ratios?.costPerOrder, kind: "number" }, profit: { value: (c) => c.profitAfterAds, kind: "number" },
  });
  const toggle = (id: string) => setOpen((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <section className="space-y-2">
      <h2 className="section-label">Campaigns</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...s.th("name")} className="px-2 py-1.5">Campaign</SortTh><SortTh {...s.th("asin")} className="px-2 py-1.5">ASIN</SortTh>
            <SortTh {...s.th("impressions")} numeric className="px-2 py-1.5 text-right">Impr.</SortTh><SortTh {...s.th("clicks")} numeric className="px-2 py-1.5 text-right">Clicks</SortTh>
            <SortTh {...s.th("ctr")} numeric className="px-2 py-1.5 text-right">CTR</SortTh><SortTh {...s.th("cost")} numeric className="px-2 py-1.5 text-right">Spend</SortTh>
            <SortTh {...s.th("cpc")} numeric className="px-2 py-1.5 text-right">CPC</SortTh><SortTh {...s.th("orders")} numeric className="px-2 py-1.5 text-right">Orders</SortTh>
            <SortTh {...s.th("conversion")} numeric className="px-2 py-1.5 text-right">Conv.</SortTh><SortTh {...s.th("sales")} numeric className="px-2 py-1.5 text-right">Sales</SortTh>
            <SortTh {...s.th("acos")} numeric className="px-2 py-1.5 text-right">ACoS</SortTh><SortTh {...s.th("breakEven")} numeric className="px-2 py-1.5 text-right">Break-even</SortTh>
            <SortTh {...s.th("perOrder")} numeric className="px-2 py-1.5 text-right">Per order</SortTh><SortTh {...s.th("profit")} numeric className="px-2 py-1.5 text-right">Profit after ads</SortTh>
          </tr></thead>
          <tbody>{s.rows.map((c) => (
            <Fragment key={c.id}>
            <tr className="border-b last:border-b-0">
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1 font-medium">
                  {c.placements.length > 0 && (
                    <button type="button" onClick={() => toggle(c.id)} aria-label={open.has(c.id) ? "Hide placements" : "Show placements"} aria-expanded={open.has(c.id)}>
                      <ChevronRightIcon className={cn("size-3.5 text-muted-foreground transition-transform", open.has(c.id) && "rotate-90")} />
                    </button>
                  )}
                  {c.name}
                </div>
                <div className="text-xs text-muted-foreground">{[c.state?.toLowerCase(), c.targeting?.toLowerCase(), c.budget != null ? `${gbp(c.budget)}/day` : null, c.keywords ? `${c.keywords} keywords` : null, c.negatives ? `${c.negatives} negatives` : null, c.source ? SOURCE_LABEL[c.source] : "no figures", c.from ? `${day(c.from)} – ${day(c.to)}` : c.source === "grid" ? `as exported ${day(c.to)}` : null].filter(Boolean).join(" · ")}</div>
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
            {open.has(c.id) && c.placements.map((p) => (
              <tr key={p.placement} className="border-b bg-muted/40 text-xs last:border-b-0">
                <td className="py-1 pr-2 pl-7">{p.placement[0].toUpperCase() + p.placement.slice(1)} <span className="text-muted-foreground">· bid +{p.percentage ?? 0}%{c.bidding_strategy ? ` · ${c.bidding_strategy}` : ""}</span></td>
                <td />
                <td className="num px-2 py-1 text-right">{n0(p.totals.impressions)}</td>
                <td className="num px-2 py-1 text-right">{n0(p.totals.clicks)}</td>
                <td className="num px-2 py-1 text-right">{pct(p.ratios.ctr, 2)}</td>
                <td className="num px-2 py-1 text-right">{gbp(p.totals.cost)}</td>
                <td className="num px-2 py-1 text-right">{gbp(p.ratios.cpc)}</td>
                <td className="num px-2 py-1 text-right">{n0(p.totals.orders)}</td>
                <td className="num px-2 py-1 text-right">{pct(p.ratios.conversion)}</td>
                <td className="num px-2 py-1 text-right">{gbp(p.totals.sales)}</td>
                <td className={cn("num px-2 py-1 text-right", acosTone(p.ratios.acos, c.targetAcos, c.breakEvenAcos))}>{pct(p.ratios.acos)}</td>
                <td /><td className="num px-2 py-1 text-right">{gbp(p.ratios.costPerOrder)}</td><td />
              </tr>
            ))}
            </Fragment>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

/** Organic rank as a sparkline: not in the top 48 is drawn at 49; lower is better, so it's drawn higher. */
function RankCell({ ranks }: { ranks: KeywordRow["ranks"] }) {
  if (!ranks.length) return <span className="text-muted-foreground">—</span>;
  const last = ranks[ranks.length - 1];
  const label = ranks.map((r) => `${new Date(r.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${r.position == null ? "not in top 48" : `#${r.position} (page ${r.page ?? "?"})`}`).join("\n");
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="num font-medium">{last.position == null ? ">48" : `#${last.position}`}</span>
      {ranks.length > 1 && <Sparkline values={ranks.map((r) => r.position ?? 49)} invert width={64} height={18} label={`Organic rank, last ${ranks.length} checks`} />}
    </span>
  );
}

function KeywordTable({ rows }: { rows: KeywordRow[] }) {
  const [all, setAll] = useState(false);
  const s = useSortable("ads.keywords", rows.filter((r) => all || r.clicks > 0 || r.ranks.length > 0), {
    keyword: { value: (k) => k.text, kind: "text" }, campaign: { value: (k) => k.campaignName, kind: "text" },
    bid: { value: (k) => k.bid, kind: "number" }, clicks: { value: (k) => k.clicks, kind: "number" },
    cost: { value: (k) => k.cost, kind: "number" }, orders: { value: (k) => k.orders, kind: "number" },
    // Spend with no sales counts as the highest ACoS.
    acos: { value: (k) => (k.sales ? k.cost / k.sales : k.cost ? 1e9 : null), kind: "number" },
    // The latest check's position; not in the top 48, or never checked, last.
    rank: { value: (k) => k.ranks.at(-1)?.position ?? null, kind: "number" },
  });
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="section-label mr-auto">Keywords</h2>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include keywords with no clicks</label>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <SortTh {...s.th("keyword")} className="px-2 py-1.5">Keyword</SortTh><SortTh {...s.th("campaign")} className="px-2 py-1.5">Campaign</SortTh>
            <SortTh {...s.th("bid")} numeric className="px-2 py-1.5 text-right">Bid</SortTh><SortTh {...s.th("clicks")} numeric className="px-2 py-1.5 text-right">Clicks</SortTh>
            <SortTh {...s.th("cost")} numeric className="px-2 py-1.5 text-right">Spend</SortTh><SortTh {...s.th("orders")} numeric className="px-2 py-1.5 text-right">Orders</SortTh>
            <SortTh {...s.th("acos")} numeric className="px-2 py-1.5 text-right">ACoS</SortTh>
            <SortTh {...s.th("rank")} className="px-2 py-1.5" title="Organic position on the extension's rank checks: the latest, and the last 8">Organic rank</SortTh>
          </tr></thead>
          <tbody>{s.rows.slice(0, 200).map((k) => (
            <tr key={k.keywordId} className={cn("border-b last:border-b-0", /paused|archived/i.test(k.state ?? "") && "text-muted-foreground")}>
              <td className="px-2 py-1.5">{k.text} <span className="text-xs text-muted-foreground">{k.matchType.toLowerCase()}{k.state && k.state !== "enabled" ? ` · ${k.state}` : ""}</span></td>
              <td className="px-2 py-1.5 text-xs text-muted-foreground">{k.campaignName}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(k.bid)}</td>
              <td className="num px-2 py-1.5 text-right">{n0(k.clicks)}</td>
              <td className="num px-2 py-1.5 text-right">{gbp(k.cost)}</td>
              <td className="num px-2 py-1.5 text-right">{n0(k.orders)}</td>
              <td className="num px-2 py-1.5 text-right">{k.sales ? pct(k.cost / k.sales) : k.cost ? "no sales" : "—"}</td>
              <td className="px-2 py-1.5"><RankCell ranks={k.ranks} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Organic rank comes from the extension&apos;s manual rank checks (Help: Ads: rank checks).</p>
    </section>
  );
}

/** Listing health: the ad CTR and CVR against the niche; poor, and the listing (not the bids) needs work. */
function ListingHealth({ h }: { h: Insights["health"] }) {
  return (
    <p className={cn("rounded-md px-3 py-1.5 text-xs", h.status === "problem" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted-foreground")}>
      <b className={h.status === "problem" ? "" : "text-foreground"}>Listing health:</b> {h.message}{h.status === "problem" ? " Bid up proposals are held back for this product meanwhile." : ""}
    </p>
  );
}
