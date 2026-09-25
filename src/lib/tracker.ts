/**
 * The tracker: what the app predicted when you bought, frozen, and (once Amazon's reports are
 * in) how it went. Pure: shared by the server, the pages and the tests.
 */
import { estSales, share, type StoredMarket } from "./ui/metrics";

export type PurchaseStatus = "ordered" | "received" | "sent" | "live" | "closed";
export const PURCHASE_STATUSES: { id: PurchaseStatus; label: string }[] = [
  { id: "ordered", label: "Ordered" },
  { id: "received", label: "Received" },
  { id: "sent", label: "Sent to Amazon" },
  { id: "live", label: "Live" },
  { id: "closed", label: "Closed" },
];

/** The app's prediction at the moment you bought. */
export interface Prediction {
  capturedAt: string;
  resultId: string | null;
  runId: string | null;
  runName: string | null;
  profile: string | null;
  verdict: string | null;
  score: number | null;
  decision: string | null;
  confidence: string | null;
  sellPrice: number | null;
  /** Amazon's fees per unit at the sell price (referral, FBA, storage, returns). */
  feesPerUnit: number | null;
  /** At your landed cost. */
  profitPerUnit: number | null;
  roi: number | null;
  margin: number | null;
  salesPerMonth: number | null;
  sharePerMonth: number | null;
  fbaSellers: number | null;
  /** Units ÷ your share. */
  monthsToSell: number | null;
  profitPerMonth: number | null;
  keepaAt: string | null;
  /** The your-share calibration in force (1 = none), so later calibration measures the raw estimate. */
  shareFactor?: number;
}

export interface PredictionSource {
  result: {
    id: string; run_id?: string | null; verdict: string | null; score: number | null; sell_price: number | null; landed_cost: number | null;
    profit: number | null; fees: { total?: number | null; outputVat?: number | null } | null; inputs: { market?: StoredMarket | null } | null;
  } | null;
  runName: string | null;
  profile: string | null;
  decision: string | null;
  confidence: string | null;
  keepaAt: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const numOr = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Freeze the prediction for a purchase of `units` at `landed` per unit. */
export function predictionFor(src: PredictionSource, landed: number, units: number, now = new Date()): Prediction {
  const r = src.result;
  const m = r?.inputs?.market ?? null;
  const price = numOr(r?.sell_price);
  const fees = numOr(r?.fees?.total);
  // The engine's profit at its landed cost, moved to yours; else price − fees − output VAT − landed.
  const resultProfit = numOr(r?.profit), resultLanded = numOr(r?.landed_cost);
  const profit = resultProfit != null && resultLanded != null
    ? resultProfit + (resultLanded - landed)
    : price != null && fees != null ? price - fees - (numOr(r?.fees?.outputVat) ?? 0) - landed : null;
  const sales = estSales(m).value, mine = share(m).value;
  return {
    capturedAt: now.toISOString(),
    resultId: r?.id ?? null,
    runId: r?.run_id ?? null,
    runName: src.runName,
    profile: src.profile,
    verdict: r?.verdict ?? null,
    score: numOr(r?.score),
    decision: src.decision,
    confidence: src.confidence,
    sellPrice: price,
    feesPerUnit: fees,
    profitPerUnit: profit == null ? null : r2(profit),
    roi: profit != null && landed > 0 ? r2((profit / landed) * 100) : null,
    margin: profit != null && price ? r2((profit / price) * 100) : null,
    salesPerMonth: sales,
    sharePerMonth: mine,
    fbaSellers: m?.fbaOffers ?? null,
    monthsToSell: mine ? Math.round((units / mine) * 10) / 10 : null,
    profitPerMonth: profit != null && mine ? r2(profit * mine) : null,
    keepaAt: src.keepaAt,
    shareFactor: m?.shareFactor ?? 1,
  };
}
