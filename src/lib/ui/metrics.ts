import { monthsLabel, orderPlan } from "../screening/order";
import { profitPerMonth, salesPerMonth, yourShare } from "../screening/sales";

/** Figures for the results table, read from the market data stored on a result. */

export interface StoredMarket {
  hasHistory: boolean;
  rankDrops30d?: number | null;
  keepaRankDrops30?: number | null;
  monthlySold?: number | null;
  fbaOffers?: number | null;
  offersNow?: number | null;
  currentBuyBox?: number | null;
  rankNow?: number | null;
  amazonLastSeenDays?: number | null;
  amazonLastSeenAt?: string | null;
  rankDrops12m?: number | null;
  lastOfferDaysAgo?: number | null;
  lastBuyBox12m?: number | null;
  lastBuyBoxAt?: string | null;
  /** The profile's your-share calibration when it was screened. */
  shareFactor?: number | null;
  /** Seller holding the Buy Box now, when known. */
  buyBoxSellerId?: string | null;
}

export interface Figure {
  value: number | null;
  /** Tooltip: where the number came from. */
  note: string;
}

/**
 * Estimated sales a month: the highest of our rank-drop count from the history, Keepa's
 * own 30-day rank-drop count, and Amazon's "bought in past month" (which Keepa carries as
 * monthlySold). The tooltip lists all three. Nothing without Keepa history.
 */
export function estSales(m: StoredMarket | null | undefined): Figure {
  if (!m?.hasHistory) return { value: null, note: "Needs Keepa history" };
  const f = salesPerMonth(m);
  if (f.sources.every((s) => s.value == null)) return { value: 0, note: "Keepa history shows no rank drops and no bought-in-past-month figure" };
  const lines = f.sources.map((s) => `${s.best ? "▶ " : "  "}${s.label}: ${s.value == null ? "—" : `${s.value}${s.plus ? "+" : ""}`}`);
  return { value: f.value, note: `Highest of:\n${lines.join("\n")}` };
}

/** Your share of sales a month: sales ÷ (sellers + you), Amazon counted as three. */
export function share(m: StoredMarket | null | undefined): Figure {
  const f = yourShare(m);
  return { value: f.value, note: f.note };
}

/** Your profit a month: your share × net profit per unit. */
export function profitMonth(m: StoredMarket | null | undefined, profit: number | null | undefined): Figure {
  const f = yourShare(m);
  const v = profitPerMonth(f.value, profit ?? null);
  return v == null
    ? { value: null, note: f.value == null ? f.note : "Needs a profit per unit" }
    : { value: v, note: `${f.value}/mo your share × £${profit!.toFixed(2)} profit per unit` };
}

/** The first order under a line cap, and months to sell it at your share (see screening/order). */
export function firstOrderFigures(m: StoredMarket | null | undefined, landed: number | null | undefined, moq: number | null | undefined, lineCapGbp: number) {
  const share = yourShare(m).value;
  const plan = orderPlan({ lineCapGbp, landedGbp: landed ?? null, moq: moq ?? null, sharePerMonth: share });
  const qty: Figure & { moqOverCap: boolean } = plan
    ? { value: plan.qty, moqOverCap: plan.moqOverCap, note: plan.moqOverCap ? `The MOQ (${plan.qty}) is more than the £${lineCapGbp.toFixed(0)} line cap buys (${plan.capUnits})` : `£${lineCapGbp.toFixed(0)} line cap ÷ £${landed!.toFixed(2)} landed` }
    : { value: null, moqOverCap: false, note: "Needs a landed cost" };
  const months: Figure = plan?.months != null
    ? { value: Number.isFinite(plan.months) ? Math.round(plan.months * 10) / 10 : Infinity, note: `${plan.qty} units ÷ ${share}/mo your share = ${monthsLabel(plan.months)}` }
    : { value: null, note: plan ? "Needs your share (Keepa history and a seller count)" : "Needs a landed cost" };
  return { qty, months };
}

/** FBA sellers from Keepa; until then all new offers from SP-API, said so. */
export function sellers(m: StoredMarket | null | undefined): Figure {
  if (m?.fbaOffers != null) return { value: m.fbaOffers, note: "FBA sellers (Keepa)" };
  if (m?.offersNow != null) return { value: m.offersNow, note: "All new offers (SP-API). An FBA-only count needs Keepa" };
  return { value: null, note: "No offer data" };
}

export function buyBox(m: StoredMarket | null | undefined): Figure {
  return m?.currentBuyBox != null
    ? { value: m.currentBuyBox, note: m.hasHistory ? "Current Buy Box (Keepa)" : "Current Buy Box (SP-API)" }
    : { value: null, note: "No Buy Box" };
}
