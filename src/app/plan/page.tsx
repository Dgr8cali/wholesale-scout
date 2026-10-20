"use client";

import { VatTag } from "@/components/VatTag";
import { DownloadIcon, PinIcon, PinOffIcon, RotateCcwIcon, ShoppingCartIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import * as XLSX from "xlsx";
import { useQogitaCart } from "@/components/QogitaCart";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { SectionTitle } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Kpi } from "@/components/ui/kpi";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { GATE_LABELS, type GateId } from "@/lib/screening/config";
import { monthsLabel } from "@/lib/screening/order";
import { planOrder, type NoOffer, type PlanCandidate, type PlanLimits, type PlanLine } from "@/lib/plan";
import { CostOverrideDialog } from "@/components/results/CostOverride";
import type { CostInput } from "@/lib/costOverride";
import { api, gbp, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";
import { KpiSkeleton, TableSkeleton } from "@/components/ui/skeletons";

interface Data { limits: PlanLimits; profile: string; candidates: PlanCandidate[]; noOffer?: NoOffer[]; updatedAt: string | null; updating?: boolean; vatRegistered?: boolean; vatRate?: number }

const STORE = "ws.plan.controls";
const gates = (g?: string[]) => (g ?? []).map((x) => GATE_LABELS[x as GateId] ?? x).join(", ");

/** Order planner: the set and quantities that make the most profit a month within the budget. */
export default function PlanPage() {
  const { confirm } = useDialogs();
  /** After ordering from a supplier: its plan lines go into the tracker, each with its prediction. */
  async function recordGroup(g: { name: string; supplierId: string | null; lines: { qty: number; c: { asin: string | null; landedGbp: number; unitCostGbp: number } }[] }) {
    const lines = g.lines.filter((x) => x.c.asin && x.qty > 0);
    if (!lines.length) return;
    const total = lines.reduce((s, x) => s + x.qty * x.c.landedGbp, 0);
    if (!(await confirm({ title: `Record ${lines.length} line${lines.length === 1 ? "" : "s"} as bought from ${g.name}?`, description: `${gbp(total)} landed, ordered today. Each is recorded in the tracker with the app's prediction as it stands now.`, confirmLabel: "Record" }))) return;
    let ok = 0;
    for (const x of lines) {
      try {
        await api("/api/purchases", { method: "POST", json: { asin: x.c.asin, units: x.qty, landedGbp: x.c.landedGbp, unitCostGbp: x.c.unitCostGbp, supplierId: g.supplierId, supplierName: g.name } });
        ok++;
      } catch (e) { toast.error((e as Error).message); }
    }
    if (ok) toast.success(`${ok} line${ok === 1 ? "" : "s"} recorded: see Tracker`);
  }
  const cart = useQogitaCart();
  const [warns, setWarns] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pins, exclusions and your quantities, kept between visits.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(load().pinned));
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(load().excluded));
  const [qty, setQty] = useState<Map<string, number>>(() => new Map(load().qty));
  const [adding, setAdding] = useState(false);
  const [costFor, setCostFor] = useState<NoOffer | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let stale = false;
    api<Data>(`/api/plan${warns ? "?warns=1" : ""}`).then((d) => { if (!stale) { setData(d); setError(null); } }).catch((e) => !stale && setError(e.message));
    return () => { stale = true; };
  }, [warns, reload]);
  /** Set your cost for a product with no supplier offer, then plan it (pinned). */
  async function setCostAndPlan(n: NoOffer, cost: CostInput) {
    if (!n.resultId) throw new Error("No screening to attach the cost to: check the product first");
    await api("/api/cost-override", { method: "POST", json: { resultIds: [n.resultId], cost } });
    setPinned((s) => new Set(s).add(`${n.productId}|manual`));
    setReload((x) => x + 1);
    toast.success(`${n.title ?? n.ean}: cost set and pinned into the plan`);
  }
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ pinned: [...pinned], excluded: [...excluded], qty: [...qty] }));
    } catch {
      // Private window: the plan just won't be remembered.
    }
  }, [pinned, excluded, qty]);

  const plan = useMemo(() => (data ? planOrder(data.candidates, data.limits, { pinned, excluded, qty }) : null), [data, pinned, excluded, qty]);
  const approval = useMemo(() => (data?.candidates ?? []).filter((c) => c.approvalOnly), [data]);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key); else n.add(key);
    setter(n);
  };
  const setLineQty = (key: string, v: string) => {
    const n = new Map(qty);
    const q = Math.floor(Number(v));
    if (v === "" || !(q > 0)) n.delete(key); else n.set(key, q);
    setQty(n);
  };
  const reset = () => { setPinned(new Set()); setExcluded(new Set()); setQty(new Map()); };

  const qogitaLines = plan ? plan.groups.flatMap((g) => g.lines).filter((x) => x.c.qogita) : [];
  async function addAll() {
    if (!cart) return;
    setAdding(true);
    let ok = 0;
    for (const x of qogitaLines) if (await cart.add(x.c.qogita!.qid, x.qty, x.c.qogita!.unit, x.c.title ?? x.c.ean)) ok++;
    setAdding(false);
    toast.success(`${ok} of ${qogitaLines.length} Qogita lines added`);
  }

  function exportXlsx() {
    if (!plan || !data) return;
    const rows = plan.groups.flatMap((g) => g.lines.map((x) => ({
      Supplier: g.name, Product: x.c.title ?? "", Brand: x.c.brand, EAN: x.c.ean, ASIN: x.c.asin ?? "", Qty: x.qty,
      "Unit cost ex VAT": x.c.unitCostGbp, "Landed / unit": x.c.landedGbp, "Profit / unit": x.c.profitUnit, "Sell price": x.c.sellPrice,
      "Your share / mo": x.c.shareMonth, "Months to sell": x.months == null ? "" : Math.round(x.months * 10) / 10,
      "Line total (landed)": Math.round(x.lineTotal * 100) / 100, "Profit / mo": Math.round(x.profitMonth * 100) / 100,
      Verdict: x.c.verdict, Pinned: x.pinned ? "yes" : "", Notes: x.notes.join("; "),
    })));
    const suppliers = plan.groups.map((g) => ({
      Supplier: g.name, Lines: g.lines.length, "Goods ex VAT": Math.round(g.goods * 100) / 100, MOV: g.movGbp ?? "", "MOV met": g.movMet ? "yes" : "no", "Landed total": Math.round(g.landed * 100) / 100,
    }));
    const summary = [
      { Item: "Profile", Value: data.profile }, { Item: "Budget", Value: data.limits.budget }, { Item: "Line cap", Value: data.limits.lineCap },
      { Item: "Months limit", Value: data.limits.maxMonths }, { Item: "Plan total (landed)", Value: Math.round(plan.total * 100) / 100 },
      { Item: "Profit / month", Value: Math.round(plan.profitMonth * 100) / 100 }, { Item: "Payback (months)", Value: plan.paybackMonths == null ? "" : Math.round(plan.paybackMonths * 10) / 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Plan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(suppliers), "Suppliers");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    XLSX.writeFile(wb, `wholesale-scout-plan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const header = (
    <div className="space-y-2">
      <PageHeader
        title="Plan"
        crumbs={[{ label: "Wholesale", href: "/runs" }, { label: "Plan" }]}
        subtitle={`The products and quantities that make the most profit a month${data ? ` on ${data.profile}` : ""}.`}
        info={<>
          <p>Each line stays within the line cap and sells within the months limit at your share, MOQs and case sizes kept, and a supplier is used only if its lines reach its MOV.</p>
          <p>Pin or exclude products and change quantities: the plan recomputes. Figures come from each product&apos;s latest result on your default profile{data?.updatedAt ? ` (as of ${when(data.updatedAt)})` : ""}.</p>
        </>}
        actions={<>
          <div className="flex items-center gap-2">
            <Switch id="plan-warns" checked={warns} onCheckedChange={setWarns} />
            <Label htmlFor="plan-warns" className="text-sm font-normal">Include Check</Label>
          </div>
          {data && (pinned.size > 0 || excluded.size > 0 || qty.size > 0) && <Button variant="ghost" size="sm" onClick={reset}><RotateCcwIcon /> Reset</Button>}
          {cart && qogitaLines.length > 0 && <Button variant="secondary" onClick={addAll} loading={adding}>{adding ? "Adding" : <><ShoppingCartIcon /> Add {qogitaLines.length} to Qogita cart</>}</Button>}
          <Button variant="secondary" onClick={exportXlsx} disabled={!plan?.groups.length}><DownloadIcon /> Export xlsx</Button>
        </>}
      />
      {data?.updating && <p className="text-sm font-medium text-warn-ink" role="status">Some results changed since: the figures are updating, reload in a minute.</p>}
    </div>
  );
  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't build the plan" message={error} onRetry={() => window.location.reload()} /></div>;
  if (!data || !plan) return <div className="space-y-5">{header}<KpiSkeleton /><TableSkeleton rows={8} columns={7} /></div>;

  const l = data.limits;
  const over = plan.total > l.budget + 0.005;
  return (
    <div className="space-y-5">
      {header}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Totals">
        <Kpi label="Plan total" value={<span className={cn("num", over && "text-danger")}>{gbp(plan.total)}</span>} hint={`of ${gbp(l.budget)} budget${over ? " · over" : ` · ${gbp(plan.left)} left`}`} />
        <Kpi label={<>Profit / month <VatTag registered={data.vatRegistered} /></>} value={<span className="num text-success">{gbp(plan.profitMonth)}</span>} hint="at your share of sales" />
        <Kpi label="Payback" value={plan.paybackMonths == null ? "—" : monthsLabel(plan.paybackMonths)} hint="until sales bring the outlay back" />
        <Kpi label="Lines" value={String(plan.groups.reduce((a, g) => a + g.lines.length, 0))} hint={`${plan.groups.length} supplier order${plan.groups.length === 1 ? "" : "s"}`} />
        <Kpi label="Limits" value={<span className="num">{gbp(l.lineCap)} / line</span>} hint={`sell within ${l.maxMonths} months`} />
      </section>

      {(() => {
        // Cash on the day: Qogita charges VAT at checkout on its ex-VAT prices (reclaimed when registered).
        const qogita = plan.groups.filter((g) => g.supplierKey.startsWith("qogita:")).reduce((a, g) => a + g.goods, 0);
        if (!qogita) return null;
        const rate = data.vatRate ?? 20, vat = (qogita * rate) / 100;
        return (
          <section className="panel flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3 text-sm" aria-label="Cash flow">
            <span><span className="text-muted-foreground">Qogita goods (ex-VAT)</span> <b className="num">{gbp(qogita)}</b></span>
            <span><span className="text-muted-foreground">VAT paid at checkout{data.vatRegistered ? " (reclaimable)" : ""}</span> <b className="num">{gbp(vat)}</b></span>
            <span><span className="text-muted-foreground">Cash needed on the day</span> <b className="num">{gbp(data.vatRegistered ? plan.total + vat : plan.total)}</b></span>
            <span className="text-xs text-muted-foreground">{data.vatRegistered ? `The plan total plus Qogita's ${rate}% VAT, which you reclaim on your VAT return.` : `The plan total plus Qogita's ${rate}% VAT (already a cost in the landed figures as you're not VAT registered).`}</span>
          </section>
        );
      })()}

      {!plan.groups.length ? (
        <EmptyState title="Nothing to plan" action={!warns && !data.candidates.filter((c) => !c.approvalOnly).length ? <Button variant="secondary" onClick={() => setWarns(true)}>Include Check</Button> : undefined}>
          {data.candidates.filter((c) => !c.approvalOnly).length
            ? "No candidate fits: see why below."
            : warns ? "No product is a Buy or Check with a costed offer." : `No product is a Buy on ${data.profile} with a costed offer. Include Check to plan from products to check.`}
        </EmptyState>
      ) : (
        // One table per supplier: each supplier is one order, and its lines sort within it.
        <div className="space-y-5">
          {plan.groups.map((g) => (
            <section key={g.supplierKey} className="space-y-2" aria-label={g.name}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 className="section-title">
                  {g.supplierId ? <Link className="hover:underline" href={`/suppliers/${g.supplierId}`}>{g.name}</Link> : g.name}
                </h2>
                <span className="num text-meta">
                  goods {gbp(g.goods)}
                  {g.movGbp != null && <span className={g.movMet ? "text-success" : "text-danger"}> · MOV {gbp(g.movGbp)} {g.movMet ? "met" : "not met"}</span>}
                  <span className="text-muted-foreground"> · landed {gbp(g.landed)}</span>
                </span>
                <Button size="sm" variant="secondary" className="ml-auto" onClick={() => recordGroup(g)} title="After ordering: record these lines in the tracker, with the app's prediction for each">Record as bought</Button>
              </div>
              <DataTable
                rows={g.lines}
                getRowId={(x) => x.c.key}
                caption={`Plan lines from ${g.name}`}
                storageKey="wholesale.plan"
                rowClassName={(x) => cn(x.notes.length > 0 && "bg-warn-soft/40")}
                columns={lineColumns({
                  lineCap: l.lineCap, qty,
                  onPin: (x) => toggle(pinned, setPinned, x.c.key), onExclude: (x) => toggle(excluded, setExcluded, x.c.key),
                  onQty: (x, v) => setLineQty(x.c.key, v),
                })}
              />
            </section>
          ))}
        </div>
      )}

      {approval.length > 0 && (
        <section className="space-y-2" aria-label="Approval needed">
          <SectionTitle title={<>If approved <span>· Check only for brand approval; pin one to plan it</span></>} />
          <CandidateList items={approval} pinned={pinned} onPin={(k) => toggle(pinned, setPinned, k)} />
        </section>
      )}

      {(plan.skipped.length > 0 || (data.noOffer?.length ?? 0) > 0) && (
        <details className="panel p-4">
          <summary className="cursor-pointer text-sm font-semibold">Not in the plan <span className="num font-normal text-muted-foreground">{plan.skipped.length + (data.noOffer?.length ?? 0)}</span></summary>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(data.noOffer ?? []).map((n) => (
              <li key={`no-offer:${n.productId}`} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{n.title ?? n.ean}</span>
                  <span className="text-xs text-muted-foreground"> · <span className="font-semibold text-warn-ink">no supplier offer</span>{n.maxLandedGbp != null ? ` · clears the floors up to ${gbp(n.maxLandedGbp)} landed` : ""}</span>
                </span>
                <Button size="sm" variant="ghost" disabled={!n.resultId} onClick={() => setCostFor(n)}>Set cost &amp; plan</Button>
              </li>
            ))}
            {plan.skipped.map(({ c, reason }) => (
              <li key={c.key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{c.title ?? c.ean}</span>
                  <span className="text-xs text-muted-foreground"> · {c.supplierName} · {reason}</span>
                </span>
                <span className="flex gap-1">
                  {excluded.has(c.key)
                    ? <Button size="sm" variant="ghost" onClick={() => toggle(excluded, setExcluded, c.key)}>Include</Button>
                    : <Button size="sm" variant="ghost" onClick={() => toggle(pinned, setPinned, c.key)}><PinIcon /> Pin</Button>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {costFor && (
        <CostOverrideDialog open onOpenChange={(o) => { if (!o) setCostFor(null); }} title={`Set cost & plan: ${costFor.title ?? costFor.ean}`}
          hint={costFor.maxLandedGbp != null ? `Clears the profit floors up to ${gbp(costFor.maxLandedGbp)} landed.` : undefined}
          onSave={(c) => setCostAndPlan(costFor, c)} />
      )}
    </div>
  );
}

/** The plan's columns, one product line each: quantity to type, the figures, and pin / exclude. */
function lineColumns({ lineCap, qty, onPin, onExclude, onQty }: {
  lineCap: number; qty: Map<string, number>;
  onPin: (x: PlanLine) => void; onExclude: (x: PlanLine) => void; onQty: (x: PlanLine, v: string) => void;
}): DataColumn<PlanLine>[] {
  return [
    {
      id: "product", header: "Product", mobile: "title", className: "max-w-96 min-w-[16rem]", sortValue: (x) => x.c.title ?? x.c.ean,
      cell: (x) => {
        const c = x.c;
        return <>
          <p className="line-clamp-2 text-sm">{c.asin ? <Link className="hover:text-link hover:underline" href={`/products/${c.asin}`}>{c.title ?? c.ean}</Link> : c.title ?? c.ean}</p>
          <p className="num text-xs font-normal text-muted-foreground">
            {c.brand} · {c.asin ? <a className="link" href={`https://www.amazon.co.uk/dp/${c.asin}`} target="_blank" rel="noreferrer">{c.asin}</a> : c.ean}
            {c.verdict === "warn" && <span className="font-sans text-warn-ink" title={gates(c.warnGates)}> · Check: {gates(c.warnGates) || "yes"}</span>}
            {c.moq ? ` · MOQ ${c.moq}` : ""}{c.step > 1 ? ` · cases of ${c.step}` : ""}
          </p>
          {x.notes.length > 0 && <p className="text-xs font-normal text-warn-ink">{x.notes.join("; ")}</p>}
        </>;
      },
    },
    {
      id: "qty", header: "Qty", numeric: true, mobile: 1, sortValue: (x) => qty.get(x.c.key) ?? x.qty,
      cell: (x) => (
        <Input className="num ml-auto h-8 w-20 text-right" type="number" min={1} step={Math.max(1, x.c.step)} value={qty.get(x.c.key) ?? x.qty}
          aria-label={`Quantity of ${x.c.title ?? x.c.ean}`} title={`Up to ${Math.floor(lineCap / x.c.landedGbp)} fit the line cap`} onChange={(e) => onQty(x, e.target.value)} />
      ),
    },
    { id: "landed", header: "Landed / unit", numeric: true, sortValue: (x) => x.c.landedGbp, cell: (x) => gbp(x.c.landedGbp) },
    { id: "profit", header: "Profit / unit", numeric: true, sortValue: (x) => x.c.profitUnit, cell: (x) => gbp(x.c.profitUnit) },
    { id: "share", header: "Your share", numeric: true, sortValue: (x) => x.c.shareMonth, cell: (x) => <>{x.c.shareMonth ?? "—"}<span className="text-xs text-muted-foreground">/mo</span></> },
    { id: "months", header: "Months to sell", numeric: true, sortValue: (x) => x.months, cell: (x) => (x.months == null ? "—" : monthsLabel(x.months)) },
    { id: "total", header: "Line total", numeric: true, mobile: 2, sortValue: (x) => x.lineTotal, cell: (x) => gbp(x.lineTotal) },
    { id: "profitMo", header: "Profit / mo", numeric: true, mobile: 3, sortValue: (x) => x.profitMonth, cell: (x) => <span className="text-success">{gbp(x.profitMonth)}</span> },
    {
      id: "act", header: <span className="sr-only">Pin or exclude</span>, className: "w-20",
      cell: (x) => (
        <div className="flex justify-end gap-0.5">
          <Button size="icon-sm" variant="ghost" className={cn(x.pinned && "text-link")} onClick={() => onPin(x)} aria-label={x.pinned ? "Unpin" : "Pin"} title={x.pinned ? "Unpin" : "Pin: always in the plan"}>
            {x.pinned ? <PinOffIcon /> : <PinIcon />}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => onExclude(x)} aria-label="Exclude" title="Exclude from the plan"><XIcon /></Button>
        </div>
      ),
    },
  ];
}

function CandidateList({ items, pinned, onPin }: { items: PlanCandidate[]; pinned: Set<string>; onPin: (key: string) => void }) {
  return (
    <ul className="panel divide-y divide-divider">
      {items.map((c) => (
        <li key={c.key} className="flex flex-wrap items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{c.title ?? c.ean}</p>
            <p className="num text-xs text-muted-foreground">{c.brand} · {c.supplierName} · landed {gbp(c.landedGbp)} · profit {gbp(c.profitUnit)} · share {c.shareMonth ?? "—"}/mo</p>
          </div>
          <StatusChip tone="warn">Approval needed</StatusChip>
          <Button size="sm" variant="ghost" onClick={() => onPin(c.key)}>{pinned.has(c.key) ? <><PinOffIcon /> Unpin</> : <><PinIcon /> Pin</>}</Button>
        </li>
      ))}
    </ul>
  );
}

function load(): { pinned: string[]; excluded: string[]; qty: [string, number][] } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (v && Array.isArray(v.pinned) && Array.isArray(v.excluded) && Array.isArray(v.qty)) return v;
  } catch {
    // Nothing saved, or storage blocked.
  }
  return { pinned: [], excluded: [], qty: [] };
}
