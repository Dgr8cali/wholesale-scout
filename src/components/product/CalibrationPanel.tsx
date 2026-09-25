"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MIN_DAYS_LIVE, MIN_FOR_SUGGESTION, SOLID_AT, type Calibration, type Measure } from "@/lib/calibration";
import { api } from "@/lib/ui/client";

type Data = { calibration: Calibration; profile: { id: string; name: string; shareFactor: number; basedOn: number | null; appliedAt: string | null } };

const off = (m: Measure) => (m.median == null ? "—" : `${m.median >= 1 ? "+" : ""}${Math.round((m.median - 1) * 100)}%`);
const range = (m: Measure) => (m.low == null || m.high == null ? "" : `${Math.round((m.low - 1) * 100)}% to ${Math.round((m.high - 1) * 100)}%`);

/** How accurate the app has been on your purchases, and the correction it suggests. */
export function CalibrationPanel({ nonce = 0 }: { nonce?: number }) {
  const { confirm } = useDialogs();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>("/api/calibration").then(setD).catch(() => {}); }, [nonce]);
  if (!d) return null;
  const c = d.calibration, p = d.profile;

  async function act(action: "apply" | "reset") {
    const ok = await confirm(action === "apply"
      ? { title: `Apply × ${c.suggestedFactor} to ${p.name}?`, description: `Your-share estimates on ${p.name} are multiplied by ${c.suggestedFactor} from the next screening (re-screen a run to apply it there). It changes the Demand gate's share check, months to sell, the plan and profit a month. Based on ${c.share.n} purchases.`, confirmLabel: "Apply" }
      : { title: `Reset ${p.name}'s calibration?`, description: "Your-share estimates go back to the uncorrected figure from the next screening.", confirmLabel: "Reset" });
    if (!ok) return;
    try { setD(await api<Data>("/api/calibration", { method: "POST", json: { action } })); toast.success(action === "apply" ? "Calibration applied" : "Calibration reset"); }
    catch (e) { toast.error((e as Error).message); }
  }

  const rows: [string, Measure][] = [["Your sales a month vs your-share", c.share], ["Sell price", c.price], ["Fees per unit", c.fees], ["Profit per unit", c.profit]];
  return (
    <section className="panel space-y-3 p-4" aria-label="Accuracy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-label">How accurate the app has been <span>· actual against predicted, purchases live {MIN_DAYS_LIVE}+ days or sold out</span></h2>
        <span className="text-xs text-muted-foreground">
          {p.name}: your-share × <b className="num text-foreground">{p.shareFactor}</b>{p.appliedAt ? ` (applied ${new Date(p.appliedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, from ${p.basedOn} purchases)` : " (uncorrected)"}
        </span>
      </div>
      {c.eligible > 0 && (
        <table className="w-full max-w-2xl text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left font-normal">Figure</th><th className="text-right font-normal">Median off</th><th className="text-right font-normal">Middle half</th><th className="text-right font-normal">Purchases</th></tr></thead>
          <tbody>
            {rows.map(([label, m]) => (
              <tr key={label} className="border-t">
                <td className="py-1">{label}</td>
                <td className="num text-right">{off(m)}</td>
                <td className="num text-right text-xs text-muted-foreground">{range(m)}</td>
                <td className="num text-right">{m.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ul className="list-disc space-y-0.5 pl-5 text-sm">{c.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <div className="flex flex-wrap items-center gap-2">
        {c.suggestedFactor != null && c.suggestedFactor !== p.shareFactor && (
          <>
            <Badge variant={c.strength === "solid" ? "pass" : "warn"}>{c.strength === "solid" ? `solid: ${c.share.n} purchases` : `early: ${c.share.n} of ${SOLID_AT}`}</Badge>
            <Button size="sm" onClick={() => act("apply")}>Apply × {c.suggestedFactor} to {p.name}</Button>
          </>
        )}
        {p.shareFactor !== 1 && <Button size="sm" variant="outline" onClick={() => act("reset")}>Reset to × 1</Button>}
        {c.suggestedFactor == null && <span className="text-xs text-muted-foreground">A correction is suggested once {MIN_FOR_SUGGESTION} purchases count (solid from {SOLID_AT}).</span>}
      </div>
    </section>
  );
}
