"use client";

import { DownloadIcon, PinIcon, PinOffIcon, RotateCcwIcon, ShoppingCartIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import * as XLSX from "xlsx";
import { usePageCrumbs } from "@/components/Crumbs";
import { useQogitaCart } from "@/components/QogitaCart";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GATE_LABELS, type GateId } from "@/lib/screening/config";
import { monthsLabel } from "@/lib/screening/order";
import { planOrder, type PlanCandidate, type PlanLimits, type PlanLine } from "@/lib/plan";
import { api, gbp, when } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

interface Data { limits: PlanLimits; profile: string; candidates: PlanCandidate[]; updatedAt: string | null }

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
  usePageCrumbs([{ label: "Plan" }]);
  const cart = useQogitaCart();
  const [warns, setWarns] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pins, exclusions and your quantities, kept between visits.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(load().pinned));
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(load().excluded));
  const [qty, setQty] = useState<Map<string, number>>(() => new Map(load().qty));
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let stale = false;
    api<Data>(`/api/plan${warns ? "?warns=1" : ""}`).then((d) => { if (!stale) { setData(d); setError(null); } }).catch((e) => !stale && setError(e.message));
    return () => { stale = true; };
  }, [warns]);
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
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Order plan</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The products and quantities that make the most profit a month{data ? ` on ${data.profile}` : ""}: each line within the line cap and selling within
          the months limit at your share, MOQs and case sizes kept, and a supplier only if its lines reach its MOV. Pin or exclude products and change
          quantities: the plan recomputes. Figures come from each product&apos;s latest result on your default profile{data?.updatedAt ? ` (as of ${when(data.updatedAt)})` : ""}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Switch id="plan-warns" checked={warns} onCheckedChange={setWarns} />
          <Label htmlFor="plan-warns" className="text-sm font-normal">Include warns</Label>
        </div>
        {data && (pinned.size > 0 || excluded.size > 0 || qty.size > 0) && <Button variant="ghost" size="sm" onClick={reset}><RotateCcwIcon /> Reset</Button>}
        {cart && qogitaLines.length > 0 && <Button variant="outline" onClick={addAll} disabled={adding}><ShoppingCartIcon /> {adding ? "Adding…" : `Add ${qogitaLines.length} to Qogita cart`}</Button>}
        <Button variant="outline" onClick={exportXlsx} disabled={!plan?.groups.length}><DownloadIcon /> Export xlsx</Button>
      </div>
    </div>
  );
  if (error) return <div className="space-y-5">{header}<ErrorState title="Couldn't build the plan" message={error} onRetry={() => window.location.reload()} /></div>;
  if (!data || !plan) return <div className="space-y-5">{header}<Skeleton className="h-24 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div>;

  const l = data.limits;
  const over = plan.total > l.budget + 0.005;
  return (
    <div className="space-y-5">
      {header}

      <section className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-5" aria-label="Totals">
        <Total label="Plan total" value={gbp(plan.total)} note={`of ${gbp(l.budget)} budget${over ? " · over" : ` · ${gbp(plan.left)} left`}`} bad={over} />
        <Total label="Profit / month" value={gbp(plan.profitMonth)} note="at your share of sales" good />
        <Total label="Payback" value={plan.paybackMonths == null ? "—" : monthsLabel(plan.paybackMonths)} note="until sales bring the outlay back" />
        <Total label="Lines" value={String(plan.groups.reduce((a, g) => a + g.lines.length, 0))} note={`${plan.groups.length} supplier order${plan.groups.length === 1 ? "" : "s"}`} />
        <Total label="Limits" value={`${gbp(l.lineCap)} / line`} note={`sell within ${l.maxMonths} months`} />
      </section>

      {!plan.groups.length ? (
        <EmptyState title="Nothing to plan">
          {data.candidates.filter((c) => !c.approvalOnly).length
            ? "No candidate fits: see why below."
            : warns ? "No product passes or warns with a costed offer." : `No product passes on ${data.profile} with a costed offer. Switch on “Include warns” to plan from products that warn.`}
        </EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Landed / unit</TableHead>
                <TableHead className="text-right">Profit / unit</TableHead>
                <TableHead className="text-right">Your share</TableHead>
                <TableHead className="text-right">Months to sell</TableHead>
                <TableHead className="text-right">Line total</TableHead>
                <TableHead className="text-right">Profit / mo</TableHead>
                <TableHead className="w-20 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.groups.map((g) => (
                <Fragment key={g.supplierKey}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={9} className="pl-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {g.supplierId ? <Link className="hover:underline" href={`/suppliers/${g.supplierId}`}>{g.name}</Link> : g.name}
                        </span>
                        <Button size="xs" variant="outline" onClick={() => recordGroup(g)} title="After ordering: record these lines in the tracker, with the app's prediction for each">Record as bought</Button>
                        <span className="num ml-auto text-xs">
                          goods {gbp(g.goods)}
                          {g.movGbp != null && <span className={g.movMet ? "text-pass" : "text-fail"}> · MOV {gbp(g.movGbp)} {g.movMet ? "met" : "not met"}</span>}
                          <span className="text-muted-foreground"> · landed {gbp(g.landed)}</span>
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {g.lines.map((x) => <Line key={x.c.key} x={x} lineCap={l.lineCap}
                    onPin={() => toggle(pinned, setPinned, x.c.key)} onExclude={() => toggle(excluded, setExcluded, x.c.key)}
                    ownQty={qty.get(x.c.key)} onQty={(v) => setLineQty(x.c.key, v)} />)}
                </Fragment>
              ))}
              <TableRow className="font-semibold">
                <TableCell className="pl-4" colSpan={6}>Total</TableCell>
                <TableCell className={cn("num text-right", over && "text-fail")}>{gbp(plan.total)}</TableCell>
                <TableCell className="num text-right text-pass">{gbp(plan.profitMonth)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {approval.length > 0 && (
        <section className="space-y-2" aria-label="Approval needed">
          <h2 className="section-label">If approved <span className="font-normal text-muted-foreground">· warn only for brand approval; pin one to plan it</span></h2>
          <CandidateList items={approval} pinned={pinned} onPin={(k) => toggle(pinned, setPinned, k)} />
        </section>
      )}

      {plan.skipped.length > 0 && (
        <details className="panel p-4">
          <summary className="cursor-pointer text-sm font-semibold">Not in the plan <span className="font-normal text-muted-foreground">{plan.skipped.length}</span></summary>
          <ul className="mt-3 space-y-1.5 text-sm">
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
    </div>
  );
}

function Total({ label, value, note, good, bad }: { label: string; value: string; note: string; good?: boolean; bad?: boolean }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("stat-value", good && "text-pass", bad && "text-fail")}>{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Line({ x, lineCap, onPin, onExclude, ownQty, onQty }: { x: PlanLine; lineCap: number; onPin: () => void; onExclude: () => void; ownQty?: number; onQty: (v: string) => void }) {
  const c = x.c;
  return (
    <TableRow className={cn(x.notes.length > 0 && "bg-warn-soft/40")}>
      <TableCell className="max-w-96 pl-4 whitespace-normal">
        <p className="line-clamp-2 text-sm">{c.asin ? <Link className="hover:text-brand hover:underline" href={`/products/${c.asin}`}>{c.title ?? c.ean}</Link> : c.title ?? c.ean}</p>
        <p className="num text-2xs text-muted-foreground">
          {c.brand} · {c.asin ? <a className="text-brand hover:underline" href={`https://www.amazon.co.uk/dp/${c.asin}`} target="_blank" rel="noreferrer">{c.asin}</a> : c.ean}
          {c.verdict === "warn" && <span className="font-sans text-warn" title={gates(c.warnGates)}> · warns: {gates(c.warnGates) || "yes"}</span>}
          {c.moq ? ` · MOQ ${c.moq}` : ""}{c.step > 1 ? ` · cases of ${c.step}` : ""}
        </p>
        {x.notes.length > 0 && <p className="text-2xs text-warn">{x.notes.join("; ")}</p>}
      </TableCell>
      <TableCell className="text-right">
        <Input className="num ml-auto h-7 w-20 text-right" type="number" min={1} step={Math.max(1, c.step)} value={ownQty ?? x.qty}
          aria-label={`Quantity of ${c.title ?? c.ean}`} title={`Up to ${Math.floor(lineCap / c.landedGbp)} fit the line cap`} onChange={(e) => onQty(e.target.value)} />
      </TableCell>
      <TableCell className="num text-right">{gbp(c.landedGbp)}</TableCell>
      <TableCell className="num text-right">{gbp(c.profitUnit)}</TableCell>
      <TableCell className="num text-right">{c.shareMonth ?? "—"}<span className="text-2xs text-muted-foreground">/mo</span></TableCell>
      <TableCell className="num text-right">{x.months == null ? "—" : monthsLabel(x.months)}</TableCell>
      <TableCell className="num text-right">{gbp(x.lineTotal)}</TableCell>
      <TableCell className="num text-right text-pass">{gbp(x.profitMonth)}</TableCell>
      <TableCell className="pr-4">
        <div className="flex justify-end gap-0.5">
          <Button size="icon" variant="ghost" className={cn(x.pinned && "text-brand")} onClick={onPin} aria-label={x.pinned ? "Unpin" : "Pin"} title={x.pinned ? "Unpin" : "Pin: always in the plan"}>
            {x.pinned ? <PinOffIcon /> : <PinIcon />}
          </Button>
          <Button size="icon" variant="ghost" onClick={onExclude} aria-label="Exclude" title="Exclude from the plan"><XIcon /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CandidateList({ items, pinned, onPin }: { items: PlanCandidate[]; pinned: Set<string>; onPin: (key: string) => void }) {
  return (
    <ul className="panel divide-y">
      {items.map((c) => (
        <li key={c.key} className="flex flex-wrap items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{c.title ?? c.ean}</p>
            <p className="num text-xs text-muted-foreground">{c.brand} · {c.supplierName} · landed {gbp(c.landedGbp)} · profit {gbp(c.profitUnit)} · share {c.shareMonth ?? "—"}/mo</p>
          </div>
          <Badge variant="warn">approval needed</Badge>
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
