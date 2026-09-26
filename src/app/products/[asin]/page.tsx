"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Checked } from "@/components/check/Checked";
import { usePageCrumbs } from "@/components/Crumbs";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brandKey } from "@/lib/brands";
import type { Decision } from "@/lib/product";
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

const DECISION: Record<Decision, { label: string; variant: "pass" | "warn" | "fail" }> = {
  buy: { label: "Buy", variant: "pass" },
  wait: { label: "Wait", variant: "warn" },
  skip: { label: "Skip", variant: "fail" },
};
const CONFIDENCE = { high: "pass", medium: "warn", low: "fail" } as const;

/** A figure with where it came from and how old it is. */
function Figure({ label, value, source }: { label: string; value: ReactNode; source?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="stat-value truncate">{value}</p>
      {source && <p className="text-2xs text-muted-foreground">{source}</p>}
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
  const load = useCallback(() => {
    api<ProductView>(`/api/products/${asin}`).then(setV).catch((e: Error) => setError(e.message));
  }, [asin]);
  useEffect(load, [load]);
  const title = (v?.latest?.product as { title?: string } | undefined)?.title ?? (v?.products[0]?.title as string | undefined) ?? asin;
  usePageCrumbs([{ label: "Products" }, { label: String(title).slice(0, 60) }]);

  if (error) return <ErrorState title="Couldn't load this product" message={error} onRetry={() => { setError(null); load(); }} />;
  if (!v) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>;

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
    toast.success(`${GATE_LABELS[gate]} ${action === "waive" ? "waived" : "un-waived"}: it applies when the product is next screened (Re-check).`);
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
      <div className="flex flex-wrap items-start gap-4">
        <ProductThumb url={p.image_url ?? null} asin={v.asin} title={p.title ?? v.asin} brand={p.brand} size={72} />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="page-title flex items-start gap-2">
            <span className="min-w-0">{p.title ?? v.asin}</span>
            <FavouriteStar starred={!!fav} onToggle={star} />
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {p.brand && <Link className="font-medium text-brand hover:underline" href={`/brands/${encodeURIComponent(brandKey(p.brand))}`}>{p.brand}</Link>}
            <span className="num">{v.asin}</span>
            {eans.length > 0 && <span className="num">EAN {eans.join(", ")}</span>}
            <a className="inline-flex items-center gap-0.5 text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${v.asin}`} target="_blank" rel="noreferrer">Amazon <ExternalLinkIcon className="size-3" /></a>
            <a className="inline-flex items-center gap-0.5 text-brand hover:underline" href={`https://keepa.com/#!product/2-${v.asin}`} target="_blank" rel="noreferrer">Keepa <ExternalLinkIcon className="size-3" /></a>
          </p>
          <Checked at={r?.updated_at} recheck={{ text: cheapest?.landedGbp != null ? `${v.asin}, ${cheapest.landedGbp.toFixed(2)}` : v.asin, supplier: cheapest?.supplier?.name ?? null }} />
        </div>
      </div>

      {/* The decision */}
      <section className="panel space-y-4 p-4" aria-label="Decision">
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-2">
            <Badge variant={DECISION[j.decision].variant} className="h-8 px-3 text-lg uppercase">{DECISION[j.decision].label}</Badge>
            <p className="text-xs text-muted-foreground">
              Confidence: <Badge variant={CONFIDENCE[j.confidence]} className="ml-1 capitalize">{j.confidence}</Badge>
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
          </div>
          {needsApproval && <ApplyKit brand={p.brand} supplierId={cheapest?.supplier?.id ?? null} applyUrl={applyUrl} />}
        </div>
        {r && (
          <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4 lg:grid-cols-8">
            <Figure label={r.landed_cost != null ? `Profit at ${gbp(r.landed_cost)}` : "Profit"} value={r.landed_cost != null ? gbp(r.profit) : "—"}
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
                { label: "Buy Box", points: v.keepa.buyBox, colour: "var(--accent-strong)" },
                { label: "Amazon", points: v.keepa.amazon, colour: "var(--fail)", dashed: true },
              ]} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Sales rank (lower is better) and sellers</p>
              <HistoryChart now={Date.parse(v.keepa.fetchedAt)} log invert format={(x) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(Math.round(x)))}
                series={[{ label: "Rank", points: v.keepa.rank, colour: "var(--accent-strong)" }]} />
              <HistoryChart now={Date.parse(v.keepa.fetchedAt)} height={90} format={(x) => String(Math.round(x))}
                series={[{ label: "New offers", points: v.keepa.offers, colour: "var(--warn)" }]} />
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Suppliers */}
        <Panel title={<>Suppliers <span>· newest price from each, landed on your default profile</span></>}>
          {v.offers.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">Unit (ex-VAT)</TableHead><TableHead className="text-right">Landed</TableHead><TableHead className="text-right">Room</TableHead><TableHead className="text-right">MOQ</TableHead><TableHead>Seen</TableHead></TableRow></TableHeader>
                <TableBody>
                  {v.offers.map((o) => {
                    const room = o.landedGbp != null && v.maxLandedGbp != null ? v.maxLandedGbp - o.landedGbp : null;
                    return (
                      <TableRow key={o.id} data-verdict={room == null ? "empty" : room >= 0 ? "pass" : "fail"}>
                        <TableCell>{o.supplier ? <Link className="font-medium text-brand hover:underline" href={`/suppliers/${o.supplier.id}`}>{o.supplier.name}</Link> : "—"}</TableCell>
                        <TableCell className="num text-right">{o.costKnown ? gbp(o.unitCostGbp) : <span className="text-muted-foreground">no cost</span>}</TableCell>
                        <TableCell className="num text-right">{gbp(o.landedGbp)}</TableCell>
                        <TableCell className={cn("num text-right", room != null && (room >= 0 ? "text-pass" : "text-fail"))}>{room == null ? "—" : `${room >= 0 ? "" : "-"}£${Math.abs(room).toFixed(2)}`}</TableCell>
                        <TableCell className="num text-right">{o.moq ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ago(o.seenAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No supplier offers it yet.</p>}
          {!cheapest && /^\d{8,14}$/.test(p.ean) && <FindOnQogita ean={p.ean} />}
        </Panel>

        {/* Screening history */}
        <Panel title={<>Screened <span>· {v.history.length} time{v.history.length === 1 ? "" : "s"}, newest first</span></>}>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Run</TableHead><TableHead>Verdict</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="text-right">Sells at</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
              <TableBody>
                {v.history.map((h) => (
                  <TableRow key={h.id} data-verdict={h.verdict ?? "empty"}>
                    <TableCell className="num text-xs whitespace-nowrap">{new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</TableCell>
                    <TableCell className="max-w-48 truncate"><Link className="text-brand hover:underline" href={`/runs/${h.runId}`}>{h.runName}</Link>{h.profile && <span className="block text-2xs text-muted-foreground">{h.profile}</span>}</TableCell>
                    <TableCell>{h.verdict ? <Badge variant={h.verdict as "pass"}>{h.verdict}</Badge> : "—"}{h.failedGate && <span className="block text-2xs text-muted-foreground">{GATE_LABELS[h.failedGate as GateId] ?? h.failedGate}</span>}</TableCell>
                    <TableCell className="num text-right">{h.score != null ? Math.round(h.score) : "—"}</TableCell>
                    <TableCell className="num text-right">{gbp(h.sellPrice)}</TableCell>
                    <TableCell className="num text-right">{gbp(h.profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>

      {/* Paperwork */}
      {(p.brand || v.waivers.length > 0) && (
        <Panel title="Approval and paperwork">
          <p className="text-sm">
            {v.approval ? <>Your approval for {p.brand}: <b>{v.approval.status.replace(/_/g, " ")}</b>{v.approval.requirement ? ` · ${v.approval.requirement}` : ""}</> : <>No approval recorded for {p.brand ?? "this brand"}.</>}
            {p.brand && <> · <Link className="text-brand hover:underline" href={`/brands/${encodeURIComponent(brandKey(p.brand))}`}>brand page</Link></>}
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
        <Panel title={<>Latest screening <span>· {r.run ? <Link className="text-brand hover:underline" href={`/runs/${r.run.id}`}>{r.run.name ?? r.run.source}</Link> : null}</span></>}>
          <Detail r={r} fav={fav ?? undefined} onNote={saveNote} onWaive={waive} onWatch={watch} />
        </Panel>
      )}
    </div>
  );
}
