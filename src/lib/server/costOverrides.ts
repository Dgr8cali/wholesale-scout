import "server-only";
import { exVat, unitFromLanded, validCost, type CostInput } from "../costOverride";
import { chunks, db, loadProfile, must } from "./db";
import { rescoreProducts } from "./rescore";

/**
 * Cost overrides: one offer per product from the "Manual" supplier. Screening weighs it against
 * the sheet's offer on every run and re-screen (process.ts, loadRows and context); the cheaper
 * is scored. Setting or clearing one re-scores the product in every current run, from stored data.
 */

const MANUAL = "Manual";
export const COST_OVERRIDE_MIGRATION = "Run migration 20260927002500_cost_override.sql to override costs";

async function manualSupplier(): Promise<{ id: string; vat_rate: number }> {
  const d = db();
  const found = must(await d.from("suppliers").select("id, vat_rate").eq("name", MANUAL).maybeSingle(), "supplier") as { id: string; vat_rate: number } | null;
  if (found) return { id: found.id, vat_rate: Number(found.vat_rate) };
  return must(await d.from("suppliers").insert({ name: MANUAL, source_type: "manual", vat_basis: "ex_vat", vat_rate: 20 }).select("id, vat_rate").single(), "supplier") as { id: string; vat_rate: number };
}

/** The rows' products and runs. */
async function rowsOf(resultIds: string[]) {
  const out: { id: string; run_id: string; product_id: string }[] = [];
  for (const c of chunks([...new Set(resultIds)])) out.push(...(must(await db().from("results").select("id, run_id, product_id").in("id", c), "results") as typeof out));
  return out;
}

/** Re-score the rows' products in every current run, from stored data. */
async function rescore(rows: { product_id: string }[], origin?: string): Promise<number> {
  return (await rescoreProducts(rows.map((r) => r.product_id), { origin })).rescored;
}

/** Set (or change) the cost override for these rows' products, and re-score the rows. */
export async function setCostOverride(resultIds: string[], input: CostInput, origin?: string): Promise<{ products: number; rescored: number }> {
  const bad = validCost(input);
  if (bad) throw new Error(bad);
  const rows = await rowsOf(resultIds);
  if (!rows.length) throw new Error("No rows");
  const [sup, profile] = await Promise.all([manualSupplier(), loadProfile(null)]);
  const landed = input.landedGbp != null ? Number(input.landedGbp) : null;
  const price = input.priceGbp != null ? Number(input.priceGbp) : null;
  // Kept ex-VAT like any offer; a landed cost is turned round on your default profile for
  // display (scoring turns it round on each run's own profile).
  const unitGbp = landed != null ? unitFromLanded(landed, profile.config.fees, sup.vat_rate) : exVat(price!, input.vatBasis!, sup.vat_rate);
  const fields = {
    supplier_id: sup.id, manual: true, unit_cost: landed ?? price, currency: "GBP", fx_rate: 1,
    unit_cost_gbp: Math.round(unitGbp * 10000) / 10000, landed_gbp: landed, vat_basis: landed != null ? null : input.vatBasis,
    manual_supplier: input.supplierName?.trim() || null, note: input.note?.trim() || null,
    moq: null, stock: null, title: null, brand: null, category: null, source_ref: "Cost override", seen_at: new Date().toISOString(),
  };
  const d = db();
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  for (const c of chunks(productIds)) {
    const res = await d.from("offers").select("id, product_id").in("product_id", c).eq("manual", true);
    if (res.error && /manual/.test(res.error.message)) throw new Error(COST_OVERRIDE_MIGRATION);
    const existing = new Map((must(res, "cost overrides") as { id: string; product_id: string }[]).map((o) => [o.product_id, o.id]));
    for (const pid of c) {
      const id = existing.get(pid);
      if (id) must(await d.from("offers").update(fields).eq("id", id), "update cost override");
      else must(await d.from("offers").insert({ ...fields, product_id: pid }), "save cost override");
    }
  }
  return { products: productIds.length, rescored: await rescore(rows, origin) };
}

/** Clear the cost override for these rows' products: every run goes back to the sheet's offer. */
export async function clearCostOverride(resultIds: string[], origin?: string): Promise<{ products: number; rescored: number }> {
  const rows = await rowsOf(resultIds);
  const d = db();
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  let cleared = 0;
  for (const c of chunks(productIds)) {
    const manual = must(await d.from("offers").select("id").in("product_id", c).eq("manual", true), "cost overrides") as { id: string }[];
    for (const m of manual) {
      // Rows scored on it go back to their sheet offer before it's deleted (the link would go null).
      const using = must(await d.from("results").select("id, sheet_offer_id").eq("offer_id", m.id), "rows on the override") as { id: string; sheet_offer_id: string | null }[];
      for (const u of using) {
        if (u.sheet_offer_id) must(await d.from("results").update({ offer_id: u.sheet_offer_id, cost_override: null }).eq("id", u.id), "restore sheet offer");
      }
      must(await d.from("offers").delete().eq("id", m.id), "delete cost override");
      cleared++;
    }
  }
  return { products: cleared, rescored: await rescore(rows, origin) };
}
