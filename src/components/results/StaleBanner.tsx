"use client";

import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PRICE_BASIS_SHORT, type PriceBasis } from "@/lib/screening/config";
import { api } from "@/lib/ui/client";

type Fees = { priceBasis?: PriceBasis | null; vatRegistered?: boolean | null; outputVat?: number | null } | null | undefined;
interface Settings { vatRegistered: boolean; priceBasis: PriceBasis }

/** Why a screening's figures aren't on today's settings (Settings → Business), or null when they are. */
export function staleReason(fees: Fees, now: Settings | null): string | null {
  if (!fees || !now) return null;
  const why: string[] = [];
  if ((fees.priceBasis ?? "lower") !== now.priceBasis) why.push(`price basis ${PRICE_BASIS_SHORT[fees.priceBasis ?? "lower"]} (now ${PRICE_BASIS_SHORT[now.priceBasis]})`);
  const vat = typeof fees.vatRegistered === "boolean" ? fees.vatRegistered : (fees.outputVat ?? 0) > 0;
  if (vat !== now.vatRegistered) why.push(`${vat ? "VAT registered" : "not VAT registered"} (now ${now.vatRegistered ? "VAT registered" : "not VAT registered"})`);
  return why.length ? why.join("; ") : null;
}

/** Today's business settings, once per page. */
export function useBusinessBasis(): Settings | null {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { api<Settings>("/api/business").then(setS).catch(() => {}); }, []);
  return s;
}

/**
 * The screenings on this page made on other settings than today's (price basis, VAT): a banner with
 * Re-check, which re-screens just those rows from what's stored (no Amazon or Keepa calls).
 */
export function StaleBanner({ rows, onRechecked }: { rows: { id: string; run_id: string; fees: Fees }[]; onRechecked?: () => void }) {
  const now = useBusinessBasis();
  const [busy, setBusy] = useState(false);
  const stale = rows.map((r) => ({ r, why: staleReason(r.fees, now) })).filter((x) => x.why);
  if (!stale.length) return null;
  const reasons = [...new Set(stale.map((x) => x.why))];
  const recheck = async () => {
    setBusy(true);
    try {
      const byRun = new Map<string, string[]>();
      for (const { r } of stale) byRun.set(r.run_id, [...(byRun.get(r.run_id) ?? []), r.id]);
      let done = 0;
      for (const [runId, ids] of byRun) done += (await api<{ rescored: number }>(`/api/runs/${runId}/rescreen`, { method: "POST", json: { storedOnly: true, resultIds: ids } })).rescored;
      toast.success(`Re-checked ${done.toLocaleString("en-GB")} screening${done === 1 ? "" : "s"} on today's settings`);
      onRechecked?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm">
      <span className="font-semibold text-warn">Stale</span>
      <span className="min-w-0 flex-1">
        {stale.length === rows.length && rows.length === 1 ? "This screening was" : `${stale.length.toLocaleString("en-GB")} screening${stale.length === 1 ? " was" : "s were"}`} made on other settings: {reasons.slice(0, 2).join("; ")}{reasons.length > 2 ? "; …" : ""}. Re-check to update the profit, ROI, margin and verdict.
      </span>
      <Button size="sm" variant="outline" disabled={busy} onClick={recheck}>{busy ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />} Re-check</Button>
    </div>
  );
}
