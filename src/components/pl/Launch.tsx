"use client";

import { MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LAUNCH_STEPS, budgetTracker, nextStep, type LaunchStep, type PlStatus } from "@/lib/pl/launch";
import { api } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

const gbp = (v: number | null | undefined) => (v == null ? "—" : `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export interface AdsSummary { asin: string; campaigns: number; spend: number | null; sales: number | null; acos: number | null; breakEvenAcos: number | null; profitAfterAds: number | null }

/** The launch: the checklist from samples to the first review, the listing ASIN, and the budget against Gate 7. */
export function LaunchSection({ candidateId, status, steps, listingAsin, ads, plan, budget, onChanged }: {
  candidateId: string; status: PlStatus; steps: LaunchStep[]; listingAsin: string | null; ads: AdsSummary | null;
  /** Gate 7's planned lines (stock = units × landed). */
  plan: { stock: number | null; samples: number | null; inspection: number | null; photography: number | null; trademark: number | null; launchAds: number | null };
  budget: number;
  onChanged: (status?: PlStatus) => void;
}) {
  const [local, setLocal] = useState<LaunchStep[]>(steps);
  const [asin, setAsin] = useState(listingAsin ?? "");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const byKey = new Map(local.map((s) => [s.step, s]));
  const next = nextStep(local);
  const b = budgetTracker(plan, local, budget);

  const save = (step: string, patch: Partial<LaunchStep>, delay = 0) => {
    const cur = byKey.get(step) ?? { step, done: false, done_on: null, note: null, spend: null };
    const merged = { ...cur, ...patch, ...(patch.done && !cur.done_on && !patch.done_on ? { done_on: new Date().toISOString().slice(0, 10) } : {}) };
    setLocal((l) => [...l.filter((s) => s.step !== step), merged]);
    clearTimeout(timers.current[step]);
    timers.current[step] = setTimeout(async () => {
      try {
        const r = await api<{ steps: LaunchStep[]; status: PlStatus }>(`/api/pl/candidates/${candidateId}/launch`, { method: "PUT", json: { step, ...patch } });
        if (r.status !== status) { toast.success(`Status: ${r.status}`); onChanged(r.status); }
      } catch (e) {
        toast.error(`Not saved: ${(e as Error).message}`);
      }
    }, delay);
  };
  const saveAsin = async () => {
    try {
      await api(`/api/pl/candidates/${candidateId}/listing`, { method: "PUT", json: { asin: asin.trim() || null } });
      toast.success(asin.trim() ? `Listing ${asin.trim().toUpperCase()} linked to Ads` : "Listing ASIN cleared");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const adsHref = `/ads/launch?candidateId=${candidateId}${listingAsin ? `&asin=${listingAsin}` : ""}`;

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto max-w-3xl">
          <h2 className="font-heading text-base font-bold">Launch</h2>
          <p className="text-sm text-muted-foreground">From samples to the first review. Tick each step as it happens, with the date, a note and what it cost: the status follows (samples ordered → Samples, listing live → Launched), and the costs go in the budget below.{next ? <> Next: <b className="text-foreground">{next.label}</b>.</> : " Every step done."}</p>
        </div>
        <span className="rounded border px-2 py-0.5 text-xs tracking-wide uppercase">{status}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-1.5">Step</th><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5">Note</th><th className="px-2 py-1.5 text-right">Cost (£)</th>
          </tr></thead>
          <tbody>{LAUNCH_STEPS.map((d, i) => {
            const s = byKey.get(d.key);
            return (
              <tr key={d.key} className={cn("border-b last:border-b-0", s?.done && "bg-pass-soft/30", next?.key === d.key && "bg-brand-soft/40")}>
                <td className="px-2 py-1.5">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={!!s?.done} onChange={(e) => save(d.key, { done: e.target.checked })} />
                    <span><span className={cn("font-medium", s?.done && "text-pass")}>{i + 1}. {d.label}</span>
                      {d.hint && <span className="block text-xs text-muted-foreground">{d.hint}</span>}
                      {d.key === "ads_launched" && <Link href={adsHref} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"><MegaphoneIcon className="size-3" /> Build the campaigns in Ads → Launch</Link>}
                    </span>
                  </label>
                </td>
                <td className="px-2 py-1.5"><Input type="date" className="h-7 w-36" value={s?.done_on ?? ""} onChange={(e) => save(d.key, { done_on: e.target.value || null })} aria-label={`${d.label} date`} /></td>
                <td className="px-2 py-1.5"><Input className="h-7 min-w-40" value={s?.note ?? ""} onChange={(e) => save(d.key, { note: e.target.value }, 600)} aria-label={`${d.label} note`} /></td>
                <td className="px-2 py-1.5 text-right"><Input type="number" step="0.01" min={0} className="num ml-auto h-7 w-24 text-right" value={s?.spend ?? ""} onChange={(e) => save(d.key, { spend: e.target.value === "" ? null : Number(e.target.value) }, 600)} aria-label={`${d.label} cost`} /></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Listing ASIN</h3>
          <p className="text-xs text-muted-foreground">Once your listing exists: it becomes an Ads product with this candidate&apos;s landed cost, so profit after ads shows here and on the Ads dashboard.</p>
          <div className="flex gap-2">
            <Input className="num h-8 w-40 uppercase" placeholder="B0…" value={asin} onChange={(e) => setAsin(e.target.value)} aria-label="Listing ASIN" />
            <Button size="sm" variant="outline" onClick={saveAsin}>Save</Button>
            {listingAsin && <Link href="/ads/dashboard" className="self-center text-xs text-brand hover:underline">Ads dashboard →</Link>}
          </div>
          {ads && (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Fig label="Ad spend" value={gbp(ads.spend)} />
              <Fig label="Ad sales" value={gbp(ads.sales)} />
              <Fig label="ACoS" value={pct(ads.acos)} sub={`break-even ${pct(ads.breakEvenAcos)}`} />
              <Fig label="Profit after ads" value={gbp(ads.profitAfterAds)} cls={ads.profitAfterAds == null ? "" : ads.profitAfterAds >= 0 ? "text-pass" : "text-fail"} />
              <Fig label="Campaigns" value={String(ads.campaigns)} sub={ads.campaigns ? undefined : "none imported yet"} />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Budget</h3>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Spent {gbp(b.spent)} of {gbp(b.budget)}</span><span>Planned {gbp(b.plannedTotal)}</span></div>
            <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Spent ${Math.round(b.spentRatio * 100)}% of the budget; planned ${Math.round(b.plannedRatio * 100)}%`}>
              <div className={cn("h-full", b.spentRatio > 1 ? "bg-fail" : b.spentRatio > 0.9 ? "bg-warn" : "bg-brand")} style={{ width: `${Math.min(100, b.spentRatio * 100)}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-ink-2" style={{ left: `${Math.min(100, b.plannedRatio * 100)}%` }} title="Planned (Gate 7)" />
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-0.5">Line</th><th className="py-0.5 text-right">Planned (Gate 7)</th><th className="py-0.5 text-right">Spent</th></tr></thead>
            <tbody>{b.rows.map((r) => (
              <tr key={r.line} className="border-t"><td className="py-0.5">{r.label}</td><td className="num py-0.5 text-right">{gbp(r.planned)}</td>
                <td className={cn("num py-0.5 text-right", r.planned != null && r.actual > r.planned && "text-fail")}>{r.actual ? gbp(r.actual) : "—"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Fig({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
      <div className="text-[10.5px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn("num font-medium", cls)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
