"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDialogs } from "@/components/Dialogs";
import type { CostInput } from "@/lib/costOverride";
import { GATE_LABELS, type GateId } from "@/lib/screening/config";
import { api } from "@/lib/ui/client";
import { favouriteSync, favStore, type FavStore } from "@/lib/ui/favouriteSync";
import { favKey } from "@/lib/ui/resultRows";
import { conditionLabel, type WatchCondition } from "@/lib/watch";
import type { Fav, Result } from "./types";

/**
 * What a results page does with its rows, shared by Run detail, Products and Brand detail: the
 * Shortlist star and note (per product, kept in step), the watch condition, waivers and cost
 * overrides. `onChanged` reloads the page's rows after a waiver or cost change; `runId` (a run)
 * re-screens the waived rows in that run.
 */
export function useResultActions({ runId, onChanged }: { runId?: string; onChanged: () => void | Promise<void> }) {
  const { confirm } = useDialogs();
  const [favs, setFavsState] = useState<Map<string, Fav>>(new Map());
  // The star/note sync reads the latest map at once; React state lags a render behind.
  const [favMap] = useState(() => favStore<Fav>(setFavsState));
  const setFavs = favMap.update;
  const [favSync] = useState(() => favouriteSync(
    {
      star: async (i) => (await api<{ favourite: Fav }>("/api/favourites", { method: "POST", json: i })).favourite,
      note: async (i, note) => (await api<{ favourite: Fav }>("/api/favourites", { method: "POST", json: { ...i, note } })).favourite,
      remove: async (fid) => void (await api(`/api/favourites?id=${fid}`, { method: "DELETE" })),
    },
    favMap as FavStore,
    { onError: (e) => toast.error(e.message) },
  ));
  useEffect(() => {
    api<{ favourites: Fav[] }>("/api/favourites?light=1")
      .then((r) => setFavs(() => new Map(r.favourites.map((f) => [favKey(f.ean, f.asin), f]))))
      .catch(() => {});
  }, [setFavs]);
  const favourites = useMemo(() => new Set(favs.keys()), [favs]);
  const favOf = (r: Result) => (r.product ? favs.get(favKey(r.product.ean, r.product.asin)) : undefined);
  const starred = (r: Result) => !!r.product && favourites.has(favKey(r.product.ean, r.product.asin));

  /** Star or un-star one product (un-starring one with a note asks first). */
  function toggleStar(r: Result) {
    if (!r.product) return;
    void favSync.toggle({ ean: r.product.ean, asin: r.product.asin }, (f) => confirm({
      title: "Remove from the Shortlist?",
      description: `Its note is deleted with it: “${(f.note ?? "").slice(0, 140)}”`,
      confirmLabel: "Remove",
      destructive: true,
    }));
  }
  /** Save a note; on a product not yet starred, the note stars it (shown at once). */
  function saveNote(r: Result, _f: Fav | undefined, note: string) {
    if (r.product) void favSync.saveNote({ ean: r.product.ean, asin: r.product.asin }, note);
  }
  /** Star (or un-star) many products at once. */
  async function bulkStar(rows: Result[], action: "star" | "unstar") {
    const items = [...new Map(rows.filter((r) => r.product).map((r) => [favKey(r.product!.ean, r.product!.asin), { ean: r.product!.ean, asin: r.product!.asin }])).values()];
    const res = await api<{ favourites: Fav[] }>("/api/favourites/bulk", { method: "POST", json: { items, action } });
    setFavs((m) => {
      const n = new Map(m);
      if (action === "star") for (const f of res.favourites) n.set(favKey(f.ean, f.asin), f);
      else for (const i of items) n.delete(favKey(i.ean, i.asin));
      return n;
    });
  }
  /** Put a row on the watchlist (starring it) with its flip condition. */
  async function watch(r: Result, condition: WatchCondition | null, noSupplier: boolean) {
    if (!r.product) return;
    try {
      const { favourite } = await api<{ favourite: Fav }>("/api/watchlist", { method: "PUT", json: { ean: r.product.ean, asin: r.product.asin, condition, noSupplier } });
      favMap.set(favKey(favourite.ean, favourite.asin), favourite);
      toast.success(`Watching: ${conditionLabel(condition)}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  /** Waive or un-waive a gate for these products; their rows are re-scored (and in a run, re-screened). */
  async function waive(rows: Result[], gate: GateId, action: "waive" | "unwaive", reason?: string): Promise<number> {
    const items = [...new Map(rows.filter((r) => r.product).map((r) => [favKey(r.product!.ean, r.product!.asin), { ean: r.product!.ean, asin: r.product!.asin }])).values()];
    const res = await api<{ requeued?: number }>("/api/overrides", { method: "POST", json: { items, gate, action, reason, ...(runId ? { runId } : {}) } });
    await onChanged();
    return res.requeued ?? 0;
  }
  /** The drawer's waive: one row, with a toast. */
  async function waiveOne(r: Result, gate: GateId, action: "waive" | "unwaive", reason?: string) {
    const requeued = await waive([r], gate, action, reason);
    toast.success(`${GATE_LABELS[gate]} ${action === "waive" ? "waived" : "un-waived"}${requeued ? "; fetching the data later gates need for this product." : "; re-scored."}`);
    return requeued;
  }
  /** Set or clear the cost override for these rows' products; they're re-scored now. */
  async function cost(ids: string[], c: CostInput | null) {
    await api("/api/cost-override", { method: c ? "POST" : "DELETE", json: c ? { resultIds: ids, cost: c } : { resultIds: ids } });
    await onChanged();
  }
  return { favourites, favOf, starred, toggleStar, saveNote, bulkStar, watch, waive, waiveOne, cost, favMap };
}
