import type { QogitaOffer } from "./client";

/** One supplier's offer, as kept on a result. Money in the offer currency. */
export interface SupplierOffer {
  qid: string;
  seller: string;
  /** Case size: the order multiple. */
  unit: number;
  inventory: number;
  deliveryWeeks: number | null;
  /** Entry tier: the smallest order this supplier takes, and its price per piece. */
  basePrice: number;
  baseMov: number;
  /** Every tier, cheapest price (biggest MOV) first as Qogita lists them. */
  tiers: { price: number; mov: number }[];
  isTopSeller?: boolean;
}

/** A result's Qogita offers and the one chosen for the budget. */
export interface QogitaOffers {
  fid: string;
  currency: string;
  /** GBP per 1 unit of `currency`, as used for the row's cost. */
  fxRate: number;
  fetchedAt: string;
  movLimit: number | null;
  offers: SupplierOffer[];
  /** qid of the chosen offer, null when there were none. */
  chosen: string | null;
  /** Why this one: "cheapest whose MOV fits the budget", or why none did. */
  reason: string;
  /** Offers Qogita left out (over the MOV limit or delivery limit). */
  excluded: number;
}

export function toSupplierOffer(o: QogitaOffer): SupplierOffer | null {
  const tiers = (o.tieredPrices ?? [])
    .map((t) => ({ price: Number(t.tierPrice?.amount), mov: Number(t.tierMov?.amount) }))
    .filter((t) => Number.isFinite(t.price) && t.price > 0 && Number.isFinite(t.mov));
  if (!tiers.length) return null;
  const entry = tiers.reduce((a, b) => (b.mov < a.mov ? b : a));
  return {
    qid: o.qid, seller: o.seller, unit: Math.max(1, o.unit || 1), inventory: o.inventory ?? 0,
    deliveryWeeks: o.estimatedDeliveryTime ?? null, basePrice: entry.price, baseMov: entry.mov, tiers, isTopSeller: o.isTopSeller,
  };
}

/**
 * Choose the supplier to buy from: the cheapest entry price among offers whose MOV fits the
 * budget and that hold at least one case. When none fits, the cheapest overall is kept so
 * the budget gate can say by how much its MOV is over.
 */
export function chooseOffer(offers: SupplierOffer[], budgetGbp: number, fxRate: number): { chosen: SupplierOffer | null; reason: string } {
  if (!offers.length) return { chosen: null, reason: "No supplier offers" };
  const byPrice = [...offers].sort((a, b) => a.basePrice - b.basePrice || a.baseMov - b.baseMov);
  const inStock = byPrice.filter((o) => o.inventory >= o.unit);
  const fits = inStock.filter((o) => o.baseMov * fxRate <= budgetGbp);
  if (fits.length) {
    const c = fits[0];
    const cheaper = byPrice.indexOf(c);
    return { chosen: c, reason: cheaper === 0 ? "Cheapest offer, and its MOV fits the budget" : `Cheapest offer whose MOV fits the budget (${cheaper} cheaper ${cheaper === 1 ? "one doesn't" : "ones don't"})` };
  }
  const c = inStock[0] ?? byPrice[0];
  return { chosen: c, reason: inStock.length ? "No supplier's MOV fits the budget; cheapest shown" : "No supplier holds a full case; cheapest shown" };
}
