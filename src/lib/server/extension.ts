import "server-only";
import { suggestCondition, type SuggestFrom, type WatchCondition } from "../watch";
import { chunks, db, must } from "./db";
import { addFavourite } from "./favourites";
import { setWatch } from "./watchlist";

/** CORS for the extension's calls (the password is the protection, not the origin). */
export const EXT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
export const extJson = (body: unknown, status = 200) => Response.json(body, { status, headers: EXT_CORS });
export const extOptions = () => new Response(null, { status: 204, headers: EXT_CORS });

export const isAsin = (s: unknown): s is string => typeof s === "string" && /^[A-Z0-9]{10}$/.test(s);

type ProductRow = { id: string; ean: string; asin: string; brand: string | null; amazon_dg: Record<string, unknown> | null };

/** The product for an ASIN (the one with the newest result when several EANs share it). */
export async function productByAsin(asin: string): Promise<ProductRow | null> {
  const rows = must(await db().from("products").select("id, ean, asin, brand, amazon_dg, updated_at").eq("asin", asin).order("updated_at", { ascending: false }).limit(5), "product") as ProductRow[];
  return rows[0] ?? null;
}

export interface LookupBadge { verdict: string | null; score: number | null; band: string | null; pending: boolean; runId: string }

/**
 * What the app already knows about each ASIN (search-results badges): the latest result, from any
 * run. Nothing is screened; an ASIN never checked comes back null.
 */
export async function lookupAsins(asins: string[]): Promise<Record<string, LookupBadge | null>> {
  const d = db();
  const out: Record<string, LookupBadge | null> = Object.fromEntries(asins.map((a) => [a, null]));
  const products = must(await d.from("products").select("id, asin").in("asin", asins), "products") as { id: string; asin: string }[];
  if (!products.length) return out;
  const byProduct = new Map(products.map((p) => [p.id, p.asin]));
  const latest = new Map<string, { status: string; verdict: string | null; score: number | null; band: string | null; run_id: string; updated_at: string }>();
  for (const c of chunks(products.map((p) => p.id), 100)) {
    const rows = must(await d.from("results").select("product_id, status, verdict, score, band, run_id, updated_at").in("product_id", c).order("updated_at", { ascending: false }), "results") as
      ({ product_id: string } & { status: string; verdict: string | null; score: number | null; band: string | null; run_id: string; updated_at: string })[];
    for (const r of rows) {
      const asin = byProduct.get(r.product_id)!;
      const cur = latest.get(asin);
      if (!cur || r.updated_at > cur.updated_at) latest.set(asin, r);
    }
  }
  for (const [asin, r] of latest) {
    out[asin] = { verdict: r.status === "done" ? r.verdict : null, score: r.score == null ? null : Math.round(Number(r.score)), band: r.band, pending: r.status === "pending", runId: r.run_id };
  }
  return out;
}

/** Star an ASIN the app has seen. */
export async function starAsin(asin: string) {
  const p = await productByAsin(asin);
  if (!p) return null;
  return addFavourite(p.ean, p.asin);
}

/** Watch an ASIN: your condition, else the one suggested from what blocked its latest result. */
export async function watchAsin(asin: string, condition?: WatchCondition | null) {
  const p = await productByAsin(asin);
  if (!p) return null;
  let c = condition;
  if (c === undefined) {
    const r = (must(await db().from("results").select("failed_gate, gate_outcomes, hurdle_price, landed_cost, inputs, offer_id").eq("product_id", p.id).eq("status", "done").order("updated_at", { ascending: false }).limit(1), "result") as (SuggestFrom & { offer_id: string })[])[0];
    const offer = r ? (must(await db().from("offers").select("stock, cost_known").eq("id", r.offer_id).maybeSingle(), "offer") as SuggestFrom["offer"]) : null;
    c = r ? suggestCondition({ ...r, offer }) : null;
  }
  return setWatch({ ean: p.ean, asin: p.asin, condition: c ?? null });
}

export interface StockSeller { sellerId: string; name: string | null; fba: boolean; stock: number | null; limited: boolean }

/** Competitors' stock read on Amazon for this ASIN, kept on the product. */
export async function saveCompetitorStock(asin: string, sellers: StockSeller[]) {
  const p = await productByAsin(asin);
  if (!p) return false;
  const clean = sellers.slice(0, 30).map((s) => ({
    sellerId: String(s.sellerId).slice(0, 30), name: s.name ? String(s.name).slice(0, 120) : null, fba: !!s.fba,
    stock: s.stock == null || !Number.isFinite(Number(s.stock)) ? null : Math.max(0, Math.round(Number(s.stock))), limited: !!s.limited,
  }));
  must(await db().from("products").update({ competitor_stock: { at: new Date().toISOString(), sellers: clean } }).eq("id", p.id), "save stock");
  return true;
}

/**
 * Seller Central's dangerous-goods classification, as you confirmed it on the page. Hazmat is
 * added to the product's Amazon DG data, so the compliance gate counts it on the next screening.
 */
export async function saveScDg(asin: string, input: { status: string; detail?: string | null; url?: string | null }) {
  const p = await productByAsin(asin);
  if (!p) return false;
  const status = ["hazmat", "not_hazmat", "unknown"].includes(input.status) ? input.status : "unknown";
  const detail = input.detail ? String(input.detail).slice(0, 300) : null;
  const update: Record<string, unknown> = { sc_dg: { at: new Date().toISOString(), status, detail, url: input.url ? String(input.url).slice(0, 500) : null } };
  if (status === "hazmat") {
    const dg = (p.amazon_dg ?? { hazmat: null, ghs: [], declared: [], heatSensitive: false }) as { declared?: string[] };
    const mark = `Seller Central${detail ? `: ${detail.slice(0, 60)}` : ""}`;
    update.amazon_dg = { ...dg, declared: [...new Set([...(dg.declared ?? []).filter((x) => !x.startsWith("Seller Central")), mark])] };
  }
  must(await db().from("products").update(update).eq("id", p.id), "save DG");
  return true;
}
