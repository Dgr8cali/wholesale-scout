"use client";

import { CheckIcon, ExternalLinkIcon, PackageSearchIcon, ScanSearchIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkBar } from "@/components/BulkBar";
import { Detail } from "@/components/results/Detail";
import { DetailDrawer } from "@/components/results/DetailDrawer";
import { downloadXlsx, exportRows } from "@/components/results/exportXlsx";
import { ResultsFilterBar } from "@/components/results/ResultsFilterBar";
import { ResultsTable, type ResultRow } from "@/components/results/ResultsTable";
import { compareRows, loadResultSort, nextResultSort, saveResultSort } from "@/components/results/sort";
import type { Result, SortKey } from "@/components/results/types";
import { useResultActions } from "@/components/results/useResultActions";
import { useSparks } from "@/components/results/useSparks";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, type Tone } from "@/components/ui/status-chip";
import { GATING_LABELS, GATING_VARIANT, type BrandProduct, type BrandSummary } from "@/lib/brandMap";
import { APPROVAL_STATUSES, STATUS_LABELS, type ApprovalStatus } from "@/lib/brands";
import { matches } from "@/lib/filters";
import { GATE_LABELS, GATE_ORDER, withDefaults, type GateId, type ProfileConfig } from "@/lib/screening/config";
import { api, gbp, when } from "@/lib/ui/client";
import { toFilterRow } from "@/lib/ui/resultRows";
import { useUrlFilters } from "@/lib/ui/useUrlFilters";
import { cn } from "@/lib/utils";
import { ApplyKit } from "@/components/documents/ApplyKit";
import { DocumentUploader } from "@/components/documents/Documents";

type Product = BrandProduct & { bestOffer: { supplier: string; unitCostGbp: number; moq: number | null; seenAt: string } | null; runId: string | null };

/** The brand map's gating colours (lib/brandMap's badge variants) as chip tones. */
const GATING_TONE: Record<(typeof GATING_VARIANT)[keyof typeof GATING_VARIANT], Tone> = { pass: "good", warn: "warn", fail: "bad", muted: "neutral", brand: "info" };
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <p className="eyebrow">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

type BrandData = { summary: BrandSummary; products: Product[]; results: Record<string, Result> };

export default function BrandPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Brand /></Suspense>;
}

function Brand() {
  const { key } = useParams<{ key: string }>();
  const [data, setData] = useState<BrandData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api<BrandData>(`/api/brands/${encodeURIComponent(key)}`).then(setData).catch((e) => setError(e.message));
  }, [key]);
  useEffect(() => { load(); }, [load]);

  async function saveApproval(patch: { status?: ApprovalStatus; requirement?: string; status_date?: string }) {
    if (!data) return;
    const a = data.summary.approval;
    const body = {
      brand: data.summary.brand,
      status: patch.status ?? a?.status ?? "not_applied",
      requirement: patch.requirement ?? a?.requirement ?? "",
      status_date: patch.status_date ?? a?.status_date ?? (patch.status ? new Date().toISOString().slice(0, 10) : ""),
    };
    try {
      const r = await api<{ rescored?: number }>("/api/brands", { method: "PUT", json: body });
      const again = r.rescored ? `; ${r.rescored} row${r.rescored === 1 ? "" : "s"} re-scored` : "";
      toast.success(patch.status === "approved" ? `${data.summary.brand} marked approved${again}` : `Saved${again}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <ErrorState title="Couldn't load this brand" message={error} onRetry={load} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  const b = data.summary;
  const approval = b.approval;
  const topSellers = b.sellers.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <PageHeader
          crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Brands", href: "/brands" }, { label: b.brand }]}
          title={<span className="flex items-center gap-3">
            {b.brand}
            <span className={cn("num rounded-md px-2 py-0.5 text-sm font-semibold", b.score >= 70 ? "bg-success-soft text-success" : b.score >= 50 ? "bg-warn-soft text-warn-ink" : "bg-subtle text-muted-foreground")}
              title="Wholesale-friendly score, 0–100">{b.score}</span>
          </span>}
          subtitle={<span className="inline-flex flex-wrap items-center gap-2">
            <StatusChip tone={GATING_TONE[GATING_VARIANT[b.gating]]}>{GATING_LABELS[b.gating]}</StatusChip>
            {b.suppliers.length ? `Carried by ${b.suppliers.map((s) => s.name).join(", ")}` : "No supplier offers it yet"}
          </span>}
          actions={<>
            {b.applyUrl && (
              <>
                <ApplyKit brand={b.brand} applyUrl={b.applyUrl} />
                <Button asChild variant="secondary"><a href={b.applyUrl} target="_blank" rel="noreferrer noopener">Apply on Amazon <ExternalLinkIcon /></a></Button>
              </>
            )}
            {approval?.status !== "approved" && (
              <Button onClick={() => saveApproval({ status: "approved", status_date: new Date().toISOString().slice(0, 10) })}><CheckIcon /> Mark approved</Button>
            )}
          </>}
        />
        {b.ipRisk && (
          <p className={cn("text-sm", b.ipRisk.level === "high" ? "text-danger" : "text-warn-ink")}>
            IP risk ({b.ipRisk.level}){b.ipRisk.note ? `: ${b.ipRisk.note}` : ""}{b.ipRisk.source ? ` (${b.ipRisk.source})` : ""}
            {b.ipRisk.level === "high" && " · score halved"}
            {" · "}<Link className="underline-offset-2 hover:underline" href="/settings?tab=ip">edit</Link>
          </p>
        )}
      </div>

      <section className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="ASINs" value={b.asins} />
        <Stat label="Buy / Check" value={<span className="num"><span className="text-success">{b.pass}</span> / <span className="text-warn-ink">{b.warn}</span></span>} hint="On your default profile" />
        <Stat label="Avg sellers" value={b.avgSellers ?? "—"} />
        <Stat label="Amazon" value={b.amazonSharePct == null ? "—" : `${b.amazonSharePct}%`} hint="Share of its listings Amazon sells or sold" />
        <Stat label="Avg Buy Box" value={gbp(b.avgBuyBox)} />
        <Stat label="Median max landed" value={gbp(b.medianMaxLanded)} hint="The most a unit can cost landed and clear the floors, median across its products" />
        <Stat label="IP risk" value={b.ipRisk
          ? <span className={b.ipRisk.level === "high" ? "text-danger" : b.ipRisk.level === "medium" ? "text-warn-ink" : ""}>{cap(b.ipRisk.level)}</span>
          : "—"} hint={b.ipRisk ? [b.ipRisk.note, b.ipRisk.source && `Source: ${b.ipRisk.source}`].filter(Boolean).join(" · ") : "Not on your IP-risk list"} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel space-y-3 p-4" aria-label="Approval">
          <SectionTitle title="Your approval">Marking a brand approved re-scores its rows in every current run.</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem]">
            <NativeSelect value={approval?.status ?? "not_applied"} aria-label="Status" onChange={(e) => saveApproval({ status: e.target.value as ApprovalStatus })}>
              {APPROVAL_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{STATUS_LABELS[s]}</NativeSelectOption>)}
            </NativeSelect>
            <Input placeholder="Requirement, e.g. 3 invoices, 30 units" defaultValue={approval?.requirement ?? ""} aria-label="Requirement"
              onBlur={(e) => e.target.value !== (approval?.requirement ?? "") && saveApproval({ requirement: e.target.value })} />
            <Input type="date" className="num" defaultValue={approval?.status_date ?? ""} aria-label="Date" onChange={(e) => saveApproval({ status_date: e.target.value })} />
          </div>
        </section>
        <section className="panel space-y-2 p-4" aria-label="Top sellers">
          <SectionTitle title="Top sellers of this brand">Buy Box sellers are looked up for products that pass every gate. Scan one to screen its storefront as a run.</SectionTitle>
          {!topSellers.length ? <p className="text-sm text-muted-foreground">No Buy Box sellers known yet: they&apos;re looked up for products that pass every gate.</p> : (
            <ul className="space-y-1.5">
              {topSellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <StoreIcon className="mr-1 inline size-3.5 text-muted-foreground" />
                    {s.name ?? s.id} <span className="text-xs text-muted-foreground">· on {s.count} of its listings</span>
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/new-run?tab=seller&seller=${s.id}`}><ScanSearchIcon /> Scan</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DocumentUploader brand={{ name: b.brand }} />

      <section className="space-y-2">
        <SectionTitle title={<>Products across all runs <span>· latest result each, verdict on your default profile</span></>} />
        <BrandProducts data={data} reload={load} />
      </section>
    </div>
  );
}

/**
 * The brand's products on the results table: the latest result of each (verdict from the brand
 * map, on your default profile; Not scored when never priced), its best offer under the title.
 */
function BrandProducts({ data, reload }: { data: BrandData; reload: () => Promise<unknown> }) {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters();
  const [profiles, setProfiles] = useState<{ id: string; is_default: boolean; config: ProfileConfig }[]>([]);
  useEffect(() => { api<{ profiles: typeof profiles }>("/api/profiles").then((r) => setProfiles(r.profiles)).catch(() => {}); }, []);
  const cfg = useMemo(() => withDefaults(profiles.find((p) => p.is_default)?.config ?? null), [profiles]);
  const lineBudget = (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100;
  const acts = useResultActions({ onChanged: async () => { await reload(); } });
  const { sparks, observe: observeSparks } = useSparks();
  const [sort, setSortState] = useState<{ key: SortKey; dir: 1 | -1 }>(() => loadResultSort("brand"));
  const setSort = (next: { key: SortKey; dir: 1 | -1 }) => { setSortState(next); saveResultSort("brand", next); };

  // Products with a result to show (one the brand map read but whose run has gone is left out).
  const all = useMemo(() => data.products.flatMap((p) => {
    const r = p.result_id ? data.results[p.result_id] : undefined;
    return r ? [{ p, d: { r, x: { decision: p.priced ? p.verdict : null, maxLanded: p.max_landed } } as ResultRow }] : [];
  }), [data]);
  const byResult = useMemo(() => new Map(all.map((x) => [x.d.r.id, x.p])), [all]);
  const rows = useMemo(() => {
    const order = compareRows(sort.key, sort.dir, lineBudget, sort.key === "rank90" || sort.key === "bb90" ? sparks : undefined);
    return all.filter((x) => matches({ ...toFilterRow(x.d.r, acts.favourites), verdict: x.d.x?.decision ?? null }, filters)).map((x) => x.d).sort(order);
  }, [all, filters, sort, lineBudget, sparks, acts.favourites]);
  const ids = useMemo(() => rows.map((d) => d.r.id), [rows]);
  const options = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    const gates = new Map<string, number>();
    for (const { d } of all) if (d.r.failed_gate) gates.set(d.r.failed_gate, (gates.get(d.r.failed_gate) ?? 0) + 1);
    const n = (v: Result["verdict"]) => all.filter((x) => (x.d.x?.decision ?? null) === v).length;
    return {
      brands: [],
      suppliers: uniq(all.map((x) => x.d.r.offer?.supplier?.name)),
      gates: GATE_ORDER.filter((g) => gates.has(g)).map((g) => ({ id: g, label: GATE_LABELS[g as GateId], count: gates.get(g)! })),
      verdictCounts: { pass: n("pass"), warn: n("warn"), fail: n("fail"), unscored: n(null) },
    };
  }, [all]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const chosen = () => all.map((x) => x.d.r).filter((r) => selected.has(r.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = activeId ? rows.findIndex((d) => d.r.id === activeId) : -1;
  const active = activeIndex >= 0 ? rows[activeIndex].r : null;
  const step = useCallback((by: -1 | 1) => {
    const i = activeIndex + by;
    if (i >= 0 && i < rows.length) setActiveId(rows[i].r.id);
  }, [activeIndex, rows]);
  async function rescreen(rs: Result[]) {
    try {
      const r = await api<{ runId: string }>("/api/results/rescreen", { method: "POST", json: { resultIds: rs.map((x) => x.id), label: `${data.summary.brand} re-screen` } });
      router.push(`/runs/${r.runId}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!data.products.length) return <EmptyState icon={<PackageSearchIcon />} title="No products yet">Products of this brand appear once a run screens them.</EmptyState>;
  return (
    <div className="space-y-3">
      <BulkBar count={selected.size} stashed={0} onReselect={() => {}} onClear={() => setSelected(new Set())}
        onStar={() => acts.bulkStar(chosen(), "star")} onUnstar={() => acts.bulkStar(chosen(), "unstar")}
        onRescreen={() => rescreen(chosen())}
        onExport={() => downloadXlsx(exportRows(chosen().map((r) => ({ r, listing: "product" })), lineBudget), data.summary.brand)} />
      <ResultsFilterBar value={filters} onChange={(f) => { setFilters(f); setSelected(new Set()); }} options={options} gateLabels={GATE_LABELS}
        matching={rows.length} total={all.length} favouritesAvailable={acts.favourites.size > 0} />
      <ResultsTable rows={rows} page="brand" paging={{ kind: "client" }}
        selected={selected} onSelect={setSelected} visibleIds={ids}
        activeId={active?.id ?? null} onOpen={(id) => setActiveId((cur) => (cur === id ? null : id))}
        actions={{ starred: acts.starred, onStar: acts.toggleStar, onRescreen: (r) => rescreen([r]) }}
        sort={sort} onSort={(k) => setSort(nextResultSort(sort, k))}
        sparks={sparks} observeSparks={observeSparks}
        rowNote={(r) => {
          const p = byResult.get(r.id);
          if (!p) return null;
          return (
            <p className="text-xs text-muted-foreground">
              {p.bestOffer ? <span title={`Seen ${when(p.bestOffer.seenAt)}`}>Best offer <span className="num font-medium text-foreground">{gbp(p.bestOffer.unitCostGbp)}</span> ex-VAT · {p.bestOffer.supplier}{p.bestOffer.moq ? ` · MOQ ${p.bestOffer.moq}` : ""}</span> : "No costed offer"}
              {p.runId && <> · <Link className="text-primary hover:underline" href={`/runs/${p.runId}`} onClick={(e) => e.stopPropagation()}>latest run</Link></>}
            </p>
          );
        }}
        empty="Nothing matches these filters."
        lineCapGbp={lineBudget} maxMonths={cfg.gates.demand.maxMonthsToSell} />
      {active && (
        <DetailDrawer r={active} index={activeIndex} count={rows.length} sparks={active.product?.asin ? sparks[active.product.asin] : null}
          onStep={step} onClose={() => setActiveId(null)}>
          <Detail r={active} fav={acts.favOf(active)} onNote={acts.saveNote} onWaive={async (r, g, a, reason) => { await acts.waiveOne(r, g, a, reason); }}
            onWatch={acts.watch} onCost={(r, c) => acts.cost([r.id], c)} stacked budgetGbp={lineBudget} />
        </DetailDrawer>
      )}
    </div>
  );
}
