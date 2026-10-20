"use client";

import { VatTag, vatBasisOf } from "@/components/VatTag";
import { StaleBanner } from "@/components/results/StaleBanner";
import { ExternalLinkIcon, HistoryIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Checked } from "@/components/check/Checked";
import { useDialogs } from "@/components/Dialogs";
import { ApplyKit } from "@/components/documents/ApplyKit";
import { DocumentLine } from "@/components/documents/Documents";
import { FavouriteStar } from "@/components/FavouriteStar";
import { HistoryChart } from "@/components/product/HistoryChart";
import { ProductThumb } from "@/components/ProductThumb";
import { Detail } from "@/components/results/Detail";
import { FindOnQogita } from "@/components/results/FindOnQogita";
import type { Fav, Result } from "@/components/results/types";
import { ErrorState } from "@/components/States";
import { DataTable } from "@/components/ui/data-table";
import { SectionTitle } from "@/components/ui/info-tip";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductDecision, StatusChip } from "@/components/ui/status-chip";
import { brandKey } from "@/lib/brands";
import { GATE_LABELS, type GateId } from "@/lib/screening/config";
import type { ProductView } from "@/lib/server/productPage";
import { api, gbp, pct } from "@/lib/ui/client";
import { estSales, share, type StoredMarket } from "@/lib/ui/metrics";
import { amazonLastSeen, ago } from "@/lib/ui/when";
import { applyLinks } from "@/lib/spapi/parse";
import { approvalRequestUrl } from "@/lib/ui/RestrictionLink";
import { cn } from "@/lib/utils";
import { Tracker, type SupplierChoice } from "@/components/product/Tracker";
import type { WatchCondition } from "@/lib/watch";
import type { CostInput } from "@/lib/costOverride";
import { KpiSkeleton, PanelSkeleton, TableSkeleton } from "@/components/ui/skeletons";

const CONFIDENCE = { high: "good", medium: "warn", low: "bad" } as const;

/** A figure with where it came from and how old it is. */
function Figure({ label, value, source }: { label: ReactNode; value: ReactNode; source?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="stat-value truncate">{value}</p>
      {source && <p className="text-xs text-muted-foreground">{source}</p>}
    </div>
  );
}

function Panel({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-label min-w-0">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One product: the decision, its evidence, every supplier's price, its history and the paperwork. */
export default function ProductPage() {
  const { asin } = useParams<{ asin: string }>();
  const openForm = useSearchParams().get("record") === "1";
  const { confirm } = useDialogs();
  const [v, setV] = useState<ProductView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roomOf = (o: ProductView["offers"][number]) => (o.landedGbp != null && v?.maxLandedGbp != null ? v.maxLandedGbp - o.landedGbp : null);
  const load = useCallback(() => {
    api<ProductView>(`/api/products/${asin}`).then(setV).catch((e: Error) => setError(e.message));
  }, [asin]);
  useEffect(load, [load]);
  const title = (v?.latest?.product as { title?: string } | undefined)?.title ?? (v?.products[0]?.title as string | undefined) ?? asin;

  if (error) return <ErrorState title="Couldn't load this product" message={error} onRetry={() => { setError(null); load(); }} />;
  if (!v) return <div className="space-y-4"><Skeleton className="h-10 w-2/3 rounded-lg" /><KpiSkeleton /><PanelSkeleton lines={5} height="h-48" /><TableSkeleton rows={5} columns={5} /></div>;

  const p = (v.latest?.product ?? v.products[0]) as { ean: string; asin: string; title: string | null; brand: string | null; image_url?: string | null };
  const r = v.latest as unknown as (Result & { updated_at: string; run?: { id: string; name: string | null; source: string } }) | null;
  const m = (r?.inputs?.market ?? null) as (StoredMarket & { amazonNow?: boolean | null }) | null;
  const j = v.judgement;
  const eans = [...new Set(v.products.map((x) => x.ean as string).filter((e) => e && e !== v.asin))];
  const fav = v.favourite as unknown as Fav | null;
  const cheapest = v.offers.find((o) => o.costKnown) ?? null;
  const gating = r?.gate_outcomes.find((g) => g.gate === "gating");
  const needsApproval = gating?.tags?.some((t) => t === "APPROVAL" || t === "BLOCKED");
  const applyUrl = applyLinks((gating as { links?: Parameters<typeof applyLinks>[0] } | undefined)?.links)[0]?.resource ?? approvalRequestUrl(v.asin);
  const seen = m && !(m.amazonNow || m.amazonLastSeenDays === 0) ? amazonLastSeen(m.amazonLastSeenDays, m.amazonLastSeenAt, r?.updated_at) : null;
  const keepaAge = v.keepa ? ago(v.keepa.fetchedAt) : null;
  const sales = estSales(m), yours = share(m);

  async function star() {
    try {
      if (fav) {
        if (fav.note && !(await confirm({ title: "Un-star this product?", description: `Its note is deleted with it: “${fav.note.slice(0, 140)}”`, confirmLabel: "Un-star", destructive: true }))) return;
        await api(`/api/favourites?id=${fav.id}`, { method: "DELETE" });
      } else await api("/api/favourites", { method: "POST", json: { ean: p.ean, asin: v!.asin } });
      load();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function saveNote(_r: Result, f: Fav | undefined, note: string) {
    try {
      if (f) await api("/api/favourites", { method: "PATCH", json: { id: f.id, note } });
      else await api("/api/favourites", { method: "POST", json: { ean: p.ean, asin: v!.asin, note } });
      load();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function waive(_r: Result, gate: GateId, action: "waive" | "unwaive", reason?: string) {
    await api("/api/overrides", { method: "POST", json: { items: [{ ean: p.ean, asin: v!.asin }], gate, action, reason } });
    toast.success(`${GATE_LABELS[gate]} ${action === "waive" ? "waived" : "un-waived"}; re-scored in every current run`);
    load();
  }
  async function cost(r: Result, c: CostInput | null) {
    await api("/api/cost-override", { method: c ? "POST" : "DELETE", json: c ? { resultIds: [r.id], cost: c } : { resultIds: [r.id] } });
    load();
  }
  async function watch(_r: Result, condition: WatchCondition | null, noSupplier: boolean) {
    try {
      await api("/api/watchlist", { method: "PUT", json: { ean: p.ean, asin: v!.asin, condition, noSupplier } });
      toast.success("On the watchlist");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <ProductThumb url={p.image_url ?? null} asin={v.asin} title={p.title ?? v.asin} brand={p.brand} size={72} />
        <div className="min-w-0 flex-1 space-y-1">
          <PageHeader
            crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Products", href: "/products" }, { label: String(title).slice(0, 60) }]}
            title={<span className="flex items-start gap-2"><span className="min-w-0">{p.title ?? v.asin}</span><FavouriteStar starred={!!fav} onToggle={star} /></span>}
            subtitle={<span className="inline-flex flex-wrap items-center gap-x-2">
              {p.brand && <Link className="link font-medium" href={`/brands/${encodeURIComponent(brandKey(p.brand))}`}>{p.brand}</Link>}
              <span className="num">{v.asin}</span>
              {eans.length > 0 && <span className="num">EAN {eans.join(", ")}</span>}
              <a className="link inline-flex items-center gap-0.5" href={`https://www.amazon.co.uk/dp/${v.asin}`} target="_blank" rel="noreferrer">Amazon <ExternalLinkIcon className="size-3" /></a>
              <a className="link inline-flex items-center gap-0.5" href={`https://keepa.com/#!product/2-${v.asin}`} target="_blank" rel="noreferrer">Keepa <ExternalLinkIcon className="size-3" /></a>
            </span>}
          />
          <Checked at={r?.updated_at} recheck={{ text: cheapest?.landedGbp != null ? `${v.asin}, ${cheapest.landedGbp.toFixed(2)}` : v.asin, supplier: cheapest?.supplier?.name ?? null }} />
        </div>
      </div>

      {/* The decision */}
      <section className="panel space-y-4 p-4" aria-label="Decision">
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-2">
            <ProductDecision verdict={j.decision} className="h-8 px-3 text-base" />
            <p className="text-xs text-muted-foreground">
              Confidence: <StatusChip tone={CONFIDENCE[j.confidence]} className="ml-1">{j.confidence[0].toUpperCase() + j.confidence.slice(1)}</StatusChip>
            </p>
          </div>
          <div className="min-w-64 flex-1 space-y-2 text-sm">
            <ul className="list-disc space-y-0.5 pl-5">{j.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {j.doubts.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium">Why not more confident:</p>
                <ul className="list-disc pl-5">{j.doubts.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {j.notes?.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">{j.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
          {needsApproval && <ApplyKit brand={p.brand} supplierId={cheapest?.supplier?.id ?? null} applyUrl={applyUrl} />}
        </div>
        {r && (
          <div className="grid grid-cols-2 gap-4 border-t border-divider pt-4 sm:grid-cols-4 lg:grid-cols-8">
            <Figure label={<>{r.landed_cost != null ? `Profit at ${gbp(r.landed_cost)}` : "Profit"} <VatTag registered={vatBasisOf(r.fees as { vatRegistered?: boolean; outputVat?: number | null } | null)} /></>} value={r.landed_cost != null ? gbp(r.profit) : "—"}
              source={r.roi != null ? `${pct(r.roi)} ROI · ${pct(r.margin)} margin` : "no cost"} />
            <Figure label="Max landed" value={gbp(v.maxLandedGbp)} source="clears the profile's floors" />
            <Figure label="Sells at" value={gbp(r.sell_price)} source={r.price_source} />
            <Figure label="Sales / mo" value={sales.value ?? "—"} source={m?.hasHistory ? `Keepa${keepaAge ? `, ${keepaAge}` : ""}` : "no history"} />
            <Figure label="Your share / mo" value={yours.value ?? "—"} source={m?.fbaOffers != null ? `${m.fbaOffers} FBA sellers + you` : null} />
            <Figure label="Fees / unit" value={gbp(r.fees?.total ?? null)} source={r.fees ? (r.fees.source === "amazon" ? "Amazon's estimate" : "rate card") : null} />
            <Figure label="Amazon" value={m ? (m.amazonNow || m.amazonLastSeenDays === 0 ? "selling" : seen ? "not now" : "never") : "—"} source={seen?.label ?? null} />
            <Figure label="Screened" value={r.updated_at ? ago(r.updated_at) : "—"} source={r.run ? r.run.name ?? r.run.source : null} />
          </div>
        )}
      </section>

      <Tracker asin={v.asin} openForm={openForm} defaultLanded={cheapest?.landedGbp ?? r?.landed_cost ?? null}
        suppliers={v.offers.filter((o) => o.supplier).map((o): SupplierChoice => ({ id: o.supplier!.id, name: o.supplier!.name, landedGbp: o.landedGbp, unitCostGbp: o.unitCostGbp }))} />

      {/* History charts */}
      {v.keepa && (
        <Panel title={<>Last 12 months <span>· Keepa, fetched {keepaAge}</span></>}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium">Price</p>
              <HistoryChart now={Date.parse(v.keepa.fetchedAt)} format={(x) => `£${x.toFixed(x >= 100 ? 0 : 2)}`} series={[
                { label: "Buy Box", points: v.keepa.buyBox, colour: "var(--primary)" },
                { label: "Amazon", points: v.keepa.amazon, colour: "var(--fail)", dashed: true },
              ]} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Sales rank (lower is better) and sellers</p>
              <HistoryChart now={Date.parse(v.keepa.fetchedAt)} log invert format={(x) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(Math.round(x)))}
                series={[{ label: "Rank", points: v.keepa.rank, colour: "var(--primary)" }]} />
              <HistoryChart now={Date.parse(v.keepa.fetchedAt)} height={90} format={(x) => String(Math.round(x))}
                series={[{ label: "New offers", points: v.keepa.offers, colour: "var(--highlight)" }]} />
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Suppliers */}
        <section className="min-w-0 space-y-2">
          <SectionTitle title={<>Suppliers <span>· newest price from each, landed on your default profile</span></>} />
          <DataTable
            rows={v.offers}
            getRowId={(o) => o.id}
            caption="Suppliers"
            pageSize={25}
            rowAttrs={(o) => { const room = roomOf(o); return { "data-verdict": room == null ? "empty" : room >= 0 ? "pass" : "fail" }; }}
            rowClassName={(o) => cn(o.archived && "opacity-60")}
            empty={{ icon: <StoreIcon />, title: "No supplier offers it yet", description: "Upload a supplier's price list with this EAN, or look for it on Qogita." }}
            columns={[
              {
                id: "supplier", header: "Supplier", mobile: "title", sortValue: (o) => o.supplier?.name ?? null,
                cell: (o) => <>
                  {o.supplier ? <Link className="link font-medium" href={`/suppliers/${o.supplier.id}`}>{o.supplier.name}</Link> : "—"}
                  {o.archived && <StatusChip tone="neutral" icon={false} className="ml-1.5 h-5 px-2" title="The Qogita UK account now prices this product: this EU offer is kept for history and left out of plans">Archived</StatusChip>}
                  {(o.stock != null || o.offerCount != null || o.preOrder || o.deliveryWeeks != null) && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {[o.stock != null ? `${o.stock.toLocaleString("en-GB")} in stock` : null, o.offerCount != null ? `${o.offerCount} offer${o.offerCount === 1 ? "" : "s"}` : null, o.preOrder ? "pre-order" : null, o.deliveryWeeks != null ? `${o.deliveryWeeks} wk delivery` : null].filter(Boolean).join(" · ")}
                      {o.link && <> · <a className="link" href={o.link} target="_blank" rel="noreferrer">view</a></>}
                    </span>
                  )}
                </>,
              },
              { id: "unit", header: "Unit (ex-VAT)", numeric: true, mobile: 2, sortValue: (o) => (o.costKnown ? o.unitCostGbp : null), cell: (o) => (o.costKnown ? gbp(o.unitCostGbp) : <span className="text-muted-foreground">no cost</span>) },
              { id: "landed", header: "Landed", numeric: true, mobile: 1, sortValue: (o) => o.landedGbp, cell: (o) => gbp(o.landedGbp) },
              {
                id: "room", header: "Room", numeric: true, mobile: 3, sortValue: roomOf,
                cell: (o) => { const room = roomOf(o); return <span className={cn(room != null && (room >= 0 ? "text-success" : "text-danger"))}>{room == null ? "—" : `${room >= 0 ? "" : "-"}£${Math.abs(room).toFixed(2)}`}</span>; },
              },
              { id: "moq", header: "MOQ", numeric: true, sortValue: (o) => o.moq, cell: (o) => o.moq ?? "—" },
              { id: "seen", header: "Seen", sortValue: (o) => o.seenAt, cell: (o) => <span className="text-meta whitespace-nowrap text-muted-foreground">{ago(o.seenAt)}</span> },
            ]}
          />
          {!cheapest && /^\d{8,14}$/.test(p.ean) && <FindOnQogita ean={p.ean} />}
        </section>

        {/* Screening history */}
        <section className="min-w-0 space-y-2">
          <SectionTitle title={<>Screened <span>· {v.history.length} time{v.history.length === 1 ? "" : "s"}, newest first</span></>} />
          <DataTable
            rows={v.history}
            getRowId={(h) => h.id}
            caption="Screening history"
            pageSize={25}
            rowAttrs={(h) => ({ "data-verdict": h.verdict ?? "empty" })}
            empty={{ icon: <HistoryIcon />, title: "Not screened yet", description: "Each run that screens this product adds a line here." }}
            columns={[
              { id: "when", header: "When", sortValue: (h) => h.at, cell: (h) => <span className="num text-xs whitespace-nowrap">{new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> },
              { id: "run", header: "Run", mobile: "title", className: "max-w-48", sortValue: (h) => h.runName, cell: (h) => <><Link className="link block truncate" href={`/runs/${h.runId}`}>{h.runName}</Link>{h.profile && <span className="block text-xs font-normal text-muted-foreground">{h.profile}</span>}</> },
              {
                id: "verdict", header: "Verdict", mobile: 1, sortValue: (h) => (h.verdict ? { pass: 1, warn: 2, fail: 3 }[h.verdict] ?? 4 : null),
                cell: (h) => <>{h.verdict ? <ProductDecision verdict={h.verdict} /> : "—"}{h.failedGate && <span className="block text-xs text-muted-foreground">{GATE_LABELS[h.failedGate as GateId] ?? h.failedGate}</span>}</>,
              },
              { id: "score", header: "Score", numeric: true, mobile: 2, sortValue: (h) => h.score, cell: (h) => (h.score != null ? Math.round(h.score) : "—") },
              { id: "sell", header: "Sells at", numeric: true, sortValue: (h) => h.sellPrice, cell: (h) => gbp(h.sellPrice) },
              { id: "profit", header: "Profit", numeric: true, mobile: 3, sortValue: (h) => h.profit, cell: (h) => gbp(h.profit) },
            ]}
          />
        </section>
      </div>

      {/* Paperwork */}
      {(p.brand || v.waivers.length > 0) && (
        <Panel title="Approval and paperwork">
          <p className="text-sm">
            {v.approval ? <>Your approval for {p.brand}: <b>{v.approval.status.replace(/_/g, " ")}</b>{v.approval.requirement ? ` · ${v.approval.requirement}` : ""}</> : <>No approval recorded for {p.brand ?? "this brand"}.</>}
            {p.brand && <> · <Link className="link" href={`/brands/${encodeURIComponent(brandKey(p.brand))}`}>brand page</Link></>}
          </p>
          {v.documents.length ? <ul className="space-y-1.5">{v.documents.map((d) => <DocumentLine key={d.id} d={d} />)}</ul>
            : <p className="text-sm text-muted-foreground">No documents for this brand yet (attach them on the brand&apos;s or the supplier&apos;s page).</p>}
          {v.waivers.length > 0 && (
            <p className="text-sm">Waived by you: {v.waivers.map((w) => `${w.label}${w.reason ? ` (“${w.reason}”)` : ""}`).join("; ")}</p>
          )}
        </Panel>
      )}

      {/* The latest screening in full */}
      {r && (
        <Panel title={<>Latest screening <span>· {r.run ? <Link className="link" href={`/runs/${r.run.id}`}>{r.run.name ?? r.run.source}</Link> : null}</span></>}>
          {r.run && <StaleBanner rows={[{ id: r.id, run_id: r.run.id, fees: r.fees as never }]} onRechecked={load} />}
          <Detail r={r} fav={fav ?? undefined} onNote={saveNote} onWaive={waive} onWatch={watch} onCost={cost} />
        </Panel>
      )}
    </div>
  );
}
