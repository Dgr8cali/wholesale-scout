import "server-only";
import type { GateId } from "../screening/config";
import { chunks, db, must } from "./db";

export interface GateOverride {
  id: string;
  ean: string;
  asin: string | null;
  gate: GateId;
  reason: string | null;
  created_at: string;
}

export const OVERRIDES_MIGRATION = "Run migration 20260926000800_gate_overrides.sql to waive gates";
const missing = (m: string) => /does not exist|schema cache/i.test(m);
export const productKey = (ean: string, asin: string | null | undefined) => `${ean}/${asin ?? ""}`;

export async function listOverrides(): Promise<GateOverride[]> {
  const res = await db().from("gate_overrides").select("*").order("created_at", { ascending: false });
  if (res.error && missing(res.error.message)) throw new Error(OVERRIDES_MIGRATION);
  return must(res, "overrides") as GateOverride[];
}

/** Waive a gate for a product (EAN + ASIN); the same waiver again just updates the reason. */
export async function addOverride(ean: string, asin: string | null, gate: GateId, reason?: string | null): Promise<GateOverride> {
  const d = db();
  const q = d.from("gate_overrides").select("*").eq("ean", ean).eq("gate", gate);
  const found = asin ? await q.eq("asin", asin) : await q.is("asin", null);
  if (found.error && missing(found.error.message)) throw new Error(OVERRIDES_MIGRATION);
  const existing = (must(found, "override") as GateOverride[])[0];
  const clean = reason?.trim() || null;
  if (existing) {
    return must(await d.from("gate_overrides").update({ reason: clean }).eq("id", existing.id).select("*").single(), "override") as GateOverride;
  }
  return must(await d.from("gate_overrides").insert({ ean, asin, gate, reason: clean }).select("*").single(), "override") as GateOverride;
}

export async function removeOverride(filter: { id: string } | { ean: string; asin: string | null; gate: GateId }): Promise<GateOverride[]> {
  const d = db();
  let q = d.from("gate_overrides").delete();
  if ("id" in filter) q = q.eq("id", filter.id);
  else {
    q = q.eq("ean", filter.ean).eq("gate", filter.gate);
    q = filter.asin ? q.eq("asin", filter.asin) : q.is("asin", null);
  }
  return must(await q.select("*"), "un-waive") as GateOverride[];
}

/** Waivers for these products, keyed by EAN/ASIN. Empty before the migration is run. */
export async function waiversFor(eans: string[]): Promise<Map<string, Map<GateId, string | null>>> {
  const out = new Map<string, Map<GateId, string | null>>();
  for (const c of chunks([...new Set(eans)])) {
    const res = await db().from("gate_overrides").select("ean, asin, gate, reason").in("ean", c);
    if (res.error) {
      if (missing(res.error.message)) return out;
      throw new Error(`overrides: ${res.error.message}`);
    }
    for (const o of res.data as { ean: string; asin: string | null; gate: GateId; reason: string | null }[]) {
      const k = productKey(o.ean, o.asin);
      if (!out.has(k)) out.set(k, new Map());
      out.get(k)!.set(o.gate, o.reason);
    }
  }
  return out;
}
