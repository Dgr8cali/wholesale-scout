import "server-only";
import { aggregateBrands, type BrandProduct, type BrandSummary } from "../brandMap";
import { brandKey, type BrandApproval } from "../brands";
import { applyLinks } from "../spapi/parse";
import { chunks, db, loadProfile, must } from "./db";
import { evaluateStored } from "./process";

/** Products re-gated per batch; a refresh call stops starting batches near its budget. */
const BATCH = 400;
const LEASE_MS = 90_000;

interface State { profile_version: string | null; refreshed_at: string | null; lease_until: string | null; remaining: number }

async function state(): Promise<State> {
  return (must(await db().from("brand_map_state").select("profile_version, refreshed_at, lease_until, remaining").eq("id", 1).maybeSingle(), "brand map state") as State | null)
    ?? { profile_version: null, refreshed_at: null, lease_until: null, remaining: 0 };
}

/** The default profile, and a version string that changes whenever it's saved. */
async function defaultProfile() {
  const p = await loadProfile(null);
  return { profile: p, version: `${p.id}@${p.updated_at ?? ""}` };
}

/** Whether the map is behind: the default profile was saved, or a result changed, since the last refresh. */
export async function brandMapStale(): Promise<boolean> {
  const [s, { version }] = await Promise.all([state(), defaultProfile()]);
  if (s.remaining > 0 || s.profile_version !== version || !s.refreshed_at) return true;
  const newer = await db().from("results").select("id", { count: "exact", head: true }).eq("status", "done").gt("updated_at", s.refreshed_at);
  return (newer.count ?? 0) > 0;
}

/**
 * Bring the brand map up to date: each product's latest result, re-gated on the default
 * profile from stored data. Works for up to `budgetMs`; returns how many products are left.
 * One refresh at a time (a lease); a second caller returns at once.
 */
export async function refreshBrandMap(budgetMs = 40_000): Promise<{ busy?: boolean; refreshed: number; remaining: number }> {
  const started = Date.now();
  const deadline = started + budgetMs;
  const d = db();
  const now = new Date();
  const claimed = must(
    await d.from("brand_map_state").update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
      .eq("id", 1).or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`).select("id"),
    "brand map lease",
  ) as { id: number }[];
  if (!claimed.length) return { busy: true, refreshed: 0, remaining: (await state()).remaining };
  try {
    const { profile, version } = await defaultProfile();
    const startedAt = now.toISOString();

    // Latest finished result per product.
    const latest = new Map<string, { id: string; product_id: string; updated_at: string }>();
    for (let from = 0; ; from += 1000) {
      const page = must(await d.from("results").select("id, product_id, updated_at").eq("status", "done").order("id").range(from, from + 999), "results") as
        { id: string; product_id: string; updated_at: string }[];
      for (const r of page) {
        const cur = latest.get(r.product_id);
        if (!cur || r.updated_at > cur.updated_at) latest.set(r.product_id, r);
      }
      if (page.length < 1000) break;
    }
    // What the map holds now.
    const held = new Map<string, { result_id: string | null; result_updated_at: string | null; profile_version: string }>();
    for (let from = 0; ; from += 1000) {
      const page = must(await d.from("brand_products").select("product_id, result_id, result_updated_at, profile_version").order("product_id").range(from, from + 999), "brand map") as
        { product_id: string; result_id: string | null; result_updated_at: string | null; profile_version: string }[];
      for (const r of page) held.set(r.product_id, r);
      if (page.length < 1000) break;
    }
    const stale = [...latest.values()].filter((r) => {
      const h = held.get(r.product_id);
      return !h || h.profile_version !== version || h.result_id !== r.id || (h.result_updated_at ?? "") < r.updated_at;
    });

    let refreshed = 0;
    let lastBatchMs = 0;
    for (const batch of chunks(stale, BATCH)) {
      if (Date.now() + Math.max(5_000, lastBatchMs * 1.5) > deadline) break;
      const t0 = Date.now();
      const results = [] as { id: string; product_id: string; offer_id: string; inputs: never; updated_at: string }[];
      for (const c of chunks(batch.map((r) => r.id), 200)) {
        results.push(...(must(await d.from("results").select("id, product_id, offer_id, inputs, updated_at").in("id", c), "results") as typeof results));
      }
      const evaluated = await evaluateStored(results, profile.config);
      const suppliers = await suppliersFor(evaluated.map((e) => e.product.ean));
      const byResult = new Map(results.map((r) => [r.id, r]));
      const rows = evaluated.map((e) => {
        const m = e.market;
        const brand = e.product.brand?.trim() || "Unknown brand";
        const amazon = m == null ? null : m.hasHistory ? m.amazonLastSeenDays != null : m.amazonNow != null ? !!m.amazonNow : null;
        return {
          product_id: e.product.id, brand_key: brandKey(brand) || "unknown", brand, ean: e.product.ean, asin: e.product.asin,
          title: e.product.title, image_url: e.product.image_url || null, result_id: e.resultId, result_updated_at: byResult.get(e.resultId)?.updated_at ?? null,
          profile_version: version, verdict: e.verdict, priced: e.priced, sell_price: round2(e.scoringPrice),
          buy_box: round2(m?.currentBuyBox ?? null), fba_sellers: m?.fbaOffers ?? m?.offersNow ?? null, amazon, max_landed: round2(e.maxLandedGbp),
          restriction: e.restriction?.status ?? null, apply_url: applyLinks(e.restriction?.links)[0]?.resource ?? null,
          sellers: (e.sellers ?? []).map((s) => ({ id: s.sellerId, name: s.name, sharePct: s.sharePct })),
          buy_box_holder: m?.buyBoxSellerId ?? null,
          suppliers: suppliers.get(e.product.ean) ?? [],
          evaluated_at: new Date().toISOString(),
        };
      });
      for (const c of chunks(rows, 200)) must(await d.from("brand_products").upsert(c, { onConflict: "product_id" }), "save brand map");
      refreshed += rows.length;
      lastBatchMs = Date.now() - t0;
    }

    const remaining = stale.length - refreshed;
    if (!remaining) {
      // Products whose results are all gone (runs deleted) leave the map.
      const gone = [...held.keys()].filter((id) => !latest.has(id));
      for (const c of chunks(gone, 200)) must(await d.from("brand_products").delete().in("product_id", c), "prune brand map");
    }
    must(await d.from("brand_map_state").update({
      remaining,
      ...(remaining ? {} : { profile_version: version, refreshed_at: startedAt }),
    }).eq("id", 1), "brand map state");
    return { refreshed, remaining };
  } finally {
    await d.from("brand_map_state").update({ lease_until: null }).eq("id", 1);
  }
}

const round2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/** Suppliers offering each EAN (any product of it), by name; "Manual" checks and scans aren't suppliers. */
async function suppliersFor(eans: string[]): Promise<Map<string, string[]>> {
  const d = db();
  const out = new Map<string, Set<string>>();
  const products = new Map<string, string>();
  for (const c of chunks([...new Set(eans)], 200)) {
    for (const p of must(await d.from("products").select("id, ean").in("ean", c), "products") as { id: string; ean: string }[]) products.set(p.id, p.ean);
  }
  const offers: { product_id: string; supplier_id: string }[] = [];
  for (const c of chunks([...products.keys()], 200)) offers.push(...(must(await d.from("offers").select("product_id, supplier_id").in("product_id", c), "offers") as typeof offers));
  const names = new Map<string, string>();
  for (const c of chunks([...new Set(offers.map((o) => o.supplier_id))], 200)) {
    for (const s of must(await d.from("suppliers").select("id, name").in("id", c), "suppliers") as { id: string; name: string }[]) names.set(s.id, s.name);
  }
  for (const o of offers) {
    const name = names.get(o.supplier_id);
    const ean = products.get(o.product_id);
    if (!name || !ean || name === "Manual") continue;
    out.set(ean, (out.get(ean) ?? new Set()).add(name));
  }
  return new Map([...out].map(([k, v]) => [k, [...v].sort()]));
}

/** Every brand in the map, rolled up, with approvals and seller names. */
export async function brandSummaries(): Promise<BrandSummary[]> {
  const d = db();
  const rows: BrandProduct[] = [];
  for (let from = 0; ; from += 1000) {
    // The roll-up doesn't need titles or images.
    const page = must(await d.from("brand_products")
      .select("product_id, brand_key, brand, ean, asin, verdict, priced, sell_price, buy_box, fba_sellers, amazon, max_landed, restriction, apply_url, sellers, buy_box_holder, suppliers")
      .order("product_id").range(from, from + 999), "brand map") as BrandProduct[];
    rows.push(...page.map((r) => ({ ...r, sell_price: num(r.sell_price), buy_box: num(r.buy_box), max_landed: num(r.max_landed) })));
    if (page.length < 1000) break;
  }
  const approvals = must(await d.from("brand_approvals").select("brand_key, brand, status, requirement, status_date"), "approvals") as BrandApproval[];
  // Names for Buy Box holders that aren't among a listing's top sellers.
  const holders = [...new Set(rows.map((r) => r.buy_box_holder).filter((x): x is string => !!x))];
  const names = new Map<string, string | null>();
  for (const c of chunks(holders, 200)) {
    for (const s of must(await d.from("keepa_sellers").select("seller_id, name").in("seller_id", c), "sellers") as { seller_id: string; name: string | null }[]) names.set(s.seller_id, s.name);
  }
  return aggregateBrands(rows, approvals, names);
}

const num = (v: unknown) => (v == null ? null : Number(v));

/** One brand's products from the map, each with its best (cheapest) offer across suppliers. */
export async function brandDetail(key: string) {
  const d = db();
  const rows = (must(await d.from("brand_products").select("*").eq("brand_key", key), "brand map") as BrandProduct[])
    .map((r) => ({ ...r, sell_price: num(r.sell_price), buy_box: num(r.buy_box), max_landed: num(r.max_landed) }));
  if (!rows.length) return null;
  const approvals = must(await d.from("brand_approvals").select("brand_key, brand, status, requirement, status_date").eq("brand_key", key), "approvals") as BrandApproval[];
  const [summary] = aggregateBrands(rows, approvals);

  // Best offer per EAN: the lowest ex-VAT unit cost any supplier quoted for it (costed offers only).
  const eans = [...new Set(rows.map((r) => r.ean))];
  const productEan = new Map<string, string>();
  for (const c of chunks(eans, 200)) {
    for (const p of must(await d.from("products").select("id, ean").in("ean", c), "products") as { id: string; ean: string }[]) productEan.set(p.id, p.ean);
  }
  const offers: { product_id: string; supplier_id: string; unit_cost_gbp: number; moq: number | null; seen_at: string; cost_known?: boolean }[] = [];
  for (const c of chunks([...productEan.keys()], 200)) {
    offers.push(...(must(await d.from("offers").select("product_id, supplier_id, unit_cost_gbp, moq, seen_at, cost_known").in("product_id", c), "offers") as typeof offers));
  }
  const supplierNames = new Map<string, string>();
  for (const c of chunks([...new Set(offers.map((o) => o.supplier_id))], 200)) {
    for (const s of must(await d.from("suppliers").select("id, name").in("id", c), "suppliers") as { id: string; name: string }[]) supplierNames.set(s.id, s.name);
  }
  const best = new Map<string, { supplier: string; unitCostGbp: number; moq: number | null; seenAt: string }>();
  for (const o of offers) {
    if (o.cost_known === false || !(Number(o.unit_cost_gbp) > 0)) continue;
    const ean = productEan.get(o.product_id)!;
    const cur = best.get(ean);
    const cost = Number(o.unit_cost_gbp);
    if (!cur || cost < cur.unitCostGbp) best.set(ean, { supplier: supplierNames.get(o.supplier_id) ?? "?", unitCostGbp: cost, moq: o.moq, seenAt: o.seen_at });
  }
  // The run each product's latest result is in, to open it there.
  const runOf = new Map<string, string>();
  for (const c of chunks(rows.map((r) => r.result_id).filter((x): x is string => !!x), 200)) {
    for (const x of must(await d.from("results").select("id, run_id").in("id", c), "results") as { id: string; run_id: string }[]) runOf.set(x.id, x.run_id);
  }
  const verdictRank = { pass: 0, warn: 1, fail: 2 } as const;
  const products = rows
    .map((r) => ({ ...r, bestOffer: best.get(r.ean) ?? null, runId: r.result_id ? runOf.get(r.result_id) ?? null : null }))
    .sort((a, b) => Number(b.priced) - Number(a.priced) || verdictRank[a.verdict ?? "fail"] - verdictRank[b.verdict ?? "fail"] || (b.buy_box ?? 0) - (a.buy_box ?? 0));
  return { summary, products };
}
