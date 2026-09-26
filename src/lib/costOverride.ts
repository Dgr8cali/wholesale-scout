/**
 * Cost override: your own cost for a product, kept as an offer from the "Manual" supplier.
 * Pure: shared by the server, the pages and the tests.
 */
import type { FeeAssumptions } from "./fees/engine";

export type VatBasis = "ex_vat" | "inc_vat";

/** What you enter: a landed cost per unit, or a supplier price per unit and its VAT basis. */
export interface CostInput {
  landedGbp?: number | null;
  priceGbp?: number | null;
  vatBasis?: VatBasis | null;
  supplierName?: string | null;
  note?: string | null;
  /** Units a minimum order (default 1), and the supplier's minimum order value in £ (default none). */
  moq?: number | null;
  movGbp?: number | null;
}

/** On a result whose product has an override: it, whether it's scored, and the sheet's cost. */
export interface CostOverride {
  /** Cheaper than the sheet's cost, so it's the one scored. */
  active: boolean;
  offerId: string;
  supplier: string | null;
  note: string | null;
  /** As entered: a landed cost, or a price and its VAT basis. */
  landedGbp: number | null;
  priceGbp: number | null;
  vatBasis: VatBasis | null;
  /** Per unit, ex-VAT, as scored. */
  unitGbp: number;
  /** As you set them (null: MOQ 1, no MOV). */
  moq?: number | null;
  movGbp?: number | null;
  /** The sheet's cost (null for a product with no sheet offer). */
  original: { supplier: string | null; unitGbp: number | null; landedGbp: number | null; costKnown: boolean } | null;
}

/** Check what's entered: one of a landed cost or a price, each a positive number of pounds. */
export function validCost(c: CostInput): string | null {
  const landed = c.landedGbp, price = c.priceGbp;
  if ((landed == null) === (price == null)) return "Enter a landed cost or a supplier price";
  const v = Number(landed ?? price);
  if (!Number.isFinite(v) || v <= 0 || v > 100_000) return "The cost must be a number of pounds above 0";
  if (price != null && c.vatBasis !== "ex_vat" && c.vatBasis !== "inc_vat") return "Say whether the price includes VAT";
  if ((c.supplierName ?? "").length > 120) return "Keep the supplier name under 120 characters";
  if ((c.note ?? "").length > 500) return "Keep the note under 500 characters";
  if (c.moq != null && !(Number.isInteger(Number(c.moq)) && Number(c.moq) >= 1 && Number(c.moq) <= 100_000)) return "MOQ must be a whole number of units, 1 or more";
  if (c.movGbp != null && !(Number.isFinite(Number(c.movGbp)) && Number(c.movGbp) >= 0 && Number(c.movGbp) <= 1_000_000)) return "MOV must be a number of pounds";
  return null;
}

/** A supplier price to ex-VAT pounds. */
export const exVat = (price: number, basis: VatBasis, vatRatePct: number) => (basis === "inc_vat" ? price / (1 + vatRatePct / 100) : price);

/**
 * The ex-VAT unit cost that lands at `landedGbp` under these fee assumptions: the fee engine's
 * landed cost (goods + duty + VAT on goods when not registered + inbound + prep) turned round.
 */
export function unitFromLanded(landedGbp: number, a: Pick<FeeAssumptions, "dutyPct" | "vatRegistered" | "inboundPerUnit" | "prepPerUnit">, vatRatePct: number): number {
  const vat = a.vatRegistered ? 0 : vatRatePct / 100;
  return Math.max(0, (landedGbp - a.inboundPerUnit - a.prepPerUnit) / ((1 + a.dutyPct / 100) * (1 + vat)));
}

/** The manual offer's ex-VAT unit cost under a profile's fee assumptions. */
export function manualUnitGbp(m: { landed_gbp?: number | string | null; unit_cost_gbp: number | string }, a: FeeAssumptions, vatRatePct: number): number {
  return m.landed_gbp != null ? unitFromLanded(Number(m.landed_gbp), a, vatRatePct) : Number(m.unit_cost_gbp);
}

/** Hover text for an overridden row. */
export function overrideTitle(o: CostOverride): string {
  const mine = o.landedGbp != null ? `£${o.landedGbp.toFixed(2)} landed` : `£${(o.priceGbp ?? o.unitGbp).toFixed(2)} ${o.vatBasis === "inc_vat" ? "inc" : "ex"} VAT`;
  const by = o.supplier ? ` from ${o.supplier}` : "";
  const was = !o.original ? "No sheet price for this product."
    : !o.original.costKnown ? `The sheet had no cost${o.original.supplier ? ` (${o.original.supplier})` : ""}.`
    : `Original: £${(o.original.unitGbp ?? 0).toFixed(2)} ex VAT${o.original.landedGbp != null ? `, £${o.original.landedGbp.toFixed(2)} landed` : ""}${o.original.supplier ? ` from ${o.original.supplier}` : ""}.`;
  if (!o.active) return `Your cost: ${mine}${by}${o.note ? ` (${o.note})` : ""}. It isn't cheaper than the sheet's, so the sheet's is scored. ${was}`;
  return `Cost overridden: ${mine}${by}${o.note ? ` (${o.note})` : ""}. ${was}`;
}
