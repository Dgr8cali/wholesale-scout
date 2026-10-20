"use client";

import { DataTable } from "@/components/ui/data-table";
import type { Actuals } from "@/lib/actuals";
import type { Purchase } from "@/lib/server/purchases";
import { decisionLabel, PRODUCT_DECISION } from "@/components/ui/status-chip";
import { gbp } from "@/lib/ui/client";
import { cn } from "@/lib/utils";

/** How far off: +12% (actual above the prediction) in the colour of good or bad for this figure. */
function Diff({ predicted, actual, higherIsGood = true }: { predicted: number | null; actual: number | null; higherIsGood?: boolean }) {
  if (predicted == null || actual == null || predicted === 0) return null;
  const pc = Math.round(((actual - predicted) / Math.abs(predicted)) * 100);
  const good = higherIsGood ? pc >= 0 : pc <= 0;
  return <span className={cn("num text-xs", Math.abs(pc) < 10 ? "text-muted-foreground" : good ? "text-success" : "text-danger")}>{pc > 0 ? "+" : ""}{pc}%</span>;
}

/** A purchase's prediction (frozen when recorded), and beside it what happened once Amazon's reports are in. */
export function PurchaseOutcome({ p, actuals }: { p: Purchase; actuals: Actuals | null }) {
  const f = p.prediction;
  const rows: { label: string; predicted: string; actual?: string; diff?: React.ReactNode }[] = [
    { label: "Sell price", predicted: gbp(f.sellPrice), actual: actuals ? gbp(actuals.avgPrice) : undefined, diff: <Diff predicted={f.sellPrice} actual={actuals?.avgPrice ?? null} /> },
    { label: "Fees / unit", predicted: gbp(f.feesPerUnit), actual: actuals ? gbp(actuals.feesPerUnit) : undefined, diff: <Diff predicted={f.feesPerUnit} actual={actuals?.feesPerUnit ?? null} higherIsGood={false} /> },
    { label: "Profit / unit", predicted: gbp(f.profitPerUnit), actual: actuals ? gbp(actuals.profitPerUnit) : undefined, diff: <Diff predicted={f.profitPerUnit} actual={actuals?.profitPerUnit ?? null} /> },
    { label: "Your sales / mo", predicted: f.sharePerMonth != null ? String(f.sharePerMonth) : "—", actual: actuals ? (actuals.unitsPerMonth != null ? String(actuals.unitsPerMonth) : "—") : undefined, diff: <Diff predicted={f.sharePerMonth} actual={actuals?.unitsPerMonth ?? null} /> },
    { label: "Months to sell", predicted: f.monthsToSell != null ? String(f.monthsToSell) : "—", actual: actuals?.sellOutDays != null ? String(Math.round(((actuals.daysLive + actuals.sellOutDays) / 30) * 10) / 10) : actuals ? "—" : undefined },
  ];
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Predicted {new Date(f.capturedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {f.decision ? decisionLabel(PRODUCT_DECISION, f.decision) : "—"} · {f.confidence ?? "?"} confidence{f.profile ? ` · ${f.profile}` : ""}
      </p>
      <DataTable dense caption="Predicted against actual" rows={rows} getRowId={(r) => r.label} columns={[
        { id: "figure", header: "Figure", cell: (r) => r.label },
        { id: "predicted", header: "Predicted", numeric: true, cell: (r) => r.predicted },
        ...(actuals ? [
          { id: "actual", header: "Actual", numeric: true, cell: (r: (typeof rows)[number]) => r.actual },
          { id: "diff", header: <span className="sr-only">Difference</span>, numeric: true, cell: (r: (typeof rows)[number]) => r.diff },
        ] : []),
      ]} />
      {actuals ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {actuals.unitsSold} sold in {actuals.daysLive} days · {gbp(actuals.revenue)} revenue · profit to date {gbp(actuals.profitToDate)}
          {actuals.buyBoxPct != null ? ` · Buy Box ${actuals.buyBoxPct}%` : ""}{actuals.onHand != null ? ` · ${actuals.onHand} at Amazon` : ""}
          {actuals.syncedAt ? ` · from Amazon's reports, ${new Date(actuals.syncedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Actual sales, price and fees appear here once it&apos;s live and Amazon&apos;s reports have been read (nightly).</p>
      )}
    </div>
  );
}
