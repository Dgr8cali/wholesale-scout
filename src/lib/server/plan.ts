import "server-only";
import type { BrandProduct } from "../brandMap";
import { landedCost } from "../fees/engine";
import { unitFromLanded } from "../costOverride";
import type { NoOffer, PlanCandidate, PlanLimits } from "../plan";
import { chunks, db, loadProfile, must } from "./db";

type Offer = {
  id: string; product_id: string; supplier_id: string; unit_cost_gbp: number; cost_known?: boolean; moq: number | null; stock: number | null; fx_rate: number;
  /** Set your cost (the Manual supplier), with the supplier you named, its landed cost or price, and any MOV. */
  manual?: boolean; manual_supplier?: string | null; landed_gbp?: number | null; mov_gbp?: number | null;
};
type Supplier = { id: string; name: string; source_type: string; vat_rate: number; mov: number | null };

/**
 * What the planner chooses from: every product that passes on the default profile (and, with
 * `warns`, those that warn), from each supplier that offers it, priced at that supplier's
 * landed cost and held to the profile's profit floors. Products that warn only for brand
 * approval come back flagged, to list separately.
 */
export async function planCandidates(opts: { warns?: boolean } = {}): Promise<{ limits: PlanLimits; profile: string; candidates: PlanCandidate[]; noOffer: NoOffer[]; updatedAt: string | null; vatRegistered: boolean; vatRate: number }> {
  const d = db();
  const profile = await loadProfile(null);
  const cfg = profile.config;
  const limits: PlanLimits = {
    budget: cfg.budget,
    lineCap: (cfg.budget * cfg.gates.budgetFit.maxLineSharePct) / 100,
    maxMonths: cfg.gates.demand.maxMonthsToSell,
  };
  const floors = cfg.gates.fees;
  const rows: (BrandProduct & { evaluated_at?: string })[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await d.from("brand_products").select("*").eq("priced", true).in("verdict", ["pass", "warn"]).order("product_id").range(from, from + 999), "brand map") as typeof rows;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const picked = rows.filter((r) => r.proceeds != null && (r.verdict === "pass" || opts.warns || isApprovalOnly(r)));

  // Every offer for those EANs, from any product of that EAN.
  const productEan = new Map<string, string>();
  for (const c of chunks([...new Set(picked.map((r) => r.ean))], 200)) {
    for (const p of must(await d.from("products").select("id, ean").in("ean", c), "products") as { id: string; ean: string }[]) productEan.set(p.id, p.ean);
  }
  const offers: Offer[] = [];
  for (const c of chunks([...productEan.keys()], 200)) {
    const res = await d.from("offers").select("id, product_id, supplier_id, unit_cost_gbp, cost_known, moq, stock, fx_rate, manual, manual_supplier, landed_gbp, mov_gbp").in("product_id", c).is("archived_at", null);
    // Before the cost-override migrations: the offers without those columns.
    offers.push(...(res.error && /manual|landed_gbp|mov_gbp/.test(res.error.message)
      ? must(await d.from("offers").select("id, product_id, supplier_id, unit_cost_gbp, cost_known, moq, stock, fx_rate").in("product_id", c).is("archived_at", null), "offers") as Offer[]
      : must(res, "offers") as Offer[]));
  }
  const suppliers = new Map<string, Supplier>();
  for (const c of chunks([...new Set(offers.map((o) => o.supplier_id))], 200)) {
    for (const s of must(await d.from("suppliers").select("id, name, source_type, vat_rate, mov").in("id", c), "suppliers") as Supplier[]) suppliers.set(s.id, s);
  }
  const offersByEan = new Map<string, Offer[]>();
  for (const o of offers) {
    const ean = productEan.get(o.product_id)!;
    offersByEan.set(ean, [...(offersByEan.get(ean) ?? []), o]);
  }

  const out: PlanCandidate[] = [];
  const noOffer: NoOffer[] = [];
  for (const r of picked) {
    const before = out.length;
    let offered = !!r.qogita;
    const approvalOnly = r.verdict === "warn" && isApprovalOnly(r);
    const base = {
      productId: r.product_id, ean: r.ean, asin: r.asin, title: r.title, brand: r.brand, sellPrice: Number(r.sell_price),
      shareMonth: r.share_month == null ? null : Number(r.share_month), verdict: r.verdict as "pass" | "warn", approvalOnly,
      warnGates: r.warn_gates ?? [],
    };
    const priced = (unitCostGbp: number, vatRate: number) => {
      const landed = landedCost(unitCostGbp, { goodsVatRatePct: vatRate }, cfg.fees).total;
      const profit = Number(r.proceeds) - landed;
      const ok = profit >= floors.minProfit && (profit / landed) * 100 >= floors.minRoiPct && (profit / Number(r.sell_price)) * 100 >= floors.minMarginPct;
      return { landed: Math.round(landed * 100) / 100, profit: Math.round(profit * 100) / 100, ok };
    };
    // The chosen Qogita seller's offer: its own order, MOV and case size, and it can go in the cart.
    if (r.qogita) {
      const q = r.qogita;
      const p = priced(q.priceGbp, 20);
      if (p.ok) {
        out.push({
          ...base, key: `${r.product_id}|qogita:${q.seller}`, supplierKey: `qogita:${q.seller}`, supplierName: `Qogita · ${q.seller}`, supplierId: null,
          movGbp: Math.round(q.movGbp * 100) / 100, unitCostGbp: Math.round(q.priceGbp * 100) / 100, landedGbp: p.landed, profitUnit: p.profit,
          moq: q.unit, step: q.unit, maxUnits: q.inventory || null, qogita: { qid: q.qid, unit: q.unit },
        });
      }
    }
    // Other suppliers' offers: the cheapest from each.
    const best = new Map<string, Offer>();
    for (const o of offersByEan.get(r.ean) ?? []) {
      const s = suppliers.get(o.supplier_id);
      // Your cost (Set your cost) is a buyable offer; a cost typed into a check or the extension isn't.
      if (o.manual && s && (Number(o.landed_gbp) > 0 || Number(o.unit_cost_gbp) > 0)) {
        offered = true;
        const vat = Number(s.vat_rate);
        const unit = o.landed_gbp != null ? unitFromLanded(Number(o.landed_gbp), cfg.fees, vat) : Number(o.unit_cost_gbp);
        const p = priced(unit, vat);
        if (!p.ok) continue;
        const name = o.manual_supplier?.trim() || "Your cost";
        out.push({
          ...base, key: `${r.product_id}|manual`, supplierKey: `manual:${name.toLowerCase()}`, supplierName: name, supplierId: null,
          movGbp: o.mov_gbp == null ? null : Number(o.mov_gbp), unitCostGbp: Math.round(unit * 10000) / 10000, landedGbp: p.landed, profitUnit: p.profit,
          moq: o.moq ?? 1, step: 1, maxUnits: null, qogita: null, manual: true,
        });
        continue;
      }
      if (!s || s.source_type === "manual" || o.cost_known === false || !(Number(o.unit_cost_gbp) > 0)) continue;
      offered = true;
      if (s.source_type === "qogita" && r.qogita) continue; // covered by the seller's offer above
      const cur = best.get(o.supplier_id);
      if (!cur || Number(o.unit_cost_gbp) < Number(cur.unit_cost_gbp)) best.set(o.supplier_id, o);
    }
    for (const o of best.values()) {
      const s = suppliers.get(o.supplier_id)!;
      const p = priced(Number(o.unit_cost_gbp), Number(s.vat_rate));
      if (!p.ok) continue;
      out.push({
        ...base, key: `${r.product_id}|${s.id}`, supplierKey: s.id, supplierName: s.name, supplierId: s.id,
        movGbp: s.mov == null ? null : Math.round(Number(s.mov) * Number(o.fx_rate || 1) * 100) / 100,
        unitCostGbp: Number(o.unit_cost_gbp), landedGbp: p.landed, profitUnit: p.profit,
        moq: o.moq, step: 1, maxUnits: o.stock != null && o.stock > 0 ? o.stock : null, qogita: null,
      });
    }
    // Passes, but nobody offers it at a price (a check or hunt with no cost): say so, to set one.
    if (!offered && out.length === before && !isApprovalOnly(r)) {
      noOffer.push({
        productId: r.product_id, resultId: r.result_id ?? null, ean: r.ean, asin: r.asin, title: r.title, brand: r.brand,
        sellPrice: Number(r.sell_price), maxLandedGbp: r.max_landed == null ? null : Number(r.max_landed), verdict: r.verdict as "pass" | "warn",
      });
    }
  }
  const updatedAt = rows.reduce<string | null>((m, r) => (r.evaluated_at && (!m || r.evaluated_at > m) ? r.evaluated_at : m), null);
  return { limits, profile: profile.name, candidates: out, noOffer, updatedAt, vatRegistered: profile.config.fees.vatRegistered, vatRate: profile.config.fees.vatRatePct };
}

/** It warns, and only because the brand needs approval. */
function isApprovalOnly(r: BrandProduct): boolean {
  const g = r.warn_gates ?? [];
  return r.verdict === "warn" && g.length > 0 && g.every((x) => x === "gating") && r.restriction === "approval_required";
}
