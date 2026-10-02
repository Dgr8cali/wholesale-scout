/**
 * Sponsored Products figures: the ratios, a campaign's totals without double counting, break-even
 * ACoS, profit after ads, and the search-term status chips. The chips' thresholds are the ones
 * the Negative rule starts from (ADS_THRESHOLDS). Pure.
 */

export interface Totals { impressions: number | null; clicks: number; cost: number; orders: number; sales: number; units: number | null }

/** The start of a sum: impressions and units stay unknown (null) unless a part reports them. */
export const ZERO: Totals = { impressions: null, clicks: 0, cost: 0, orders: 0, sales: 0, units: null };

export function add(a: Totals, b: Totals): Totals {
  return {
    impressions: a.impressions == null || b.impressions == null ? (a.impressions ?? b.impressions) : a.impressions + b.impressions,
    clicks: a.clicks + b.clicks, cost: a.cost + b.cost, orders: a.orders + b.orders, sales: a.sales + b.sales,
    units: a.units == null && b.units == null ? null : (a.units ?? 0) + (b.units ?? 0),
  };
}

const div = (a: number, b: number | null | undefined) => (b ? a / b : null);

export interface Ratios {
  /** Spend ÷ sales; null with no sales. */
  acos: number | null;
  cpc: number | null;
  /** Orders ÷ clicks. */
  conversion: number | null;
  /** Clicks ÷ impressions. */
  ctr: number | null;
  costPerOrder: number | null;
  roas: number | null;
}

export function ratios(t: Totals): Ratios {
  return {
    acos: div(t.cost, t.sales), cpc: div(t.cost, t.clicks), conversion: div(t.orders, t.clicks),
    ctr: t.impressions ? t.clicks / t.impressions : null, costPerOrder: div(t.cost, t.orders), roas: div(t.sales, t.cost),
  };
}

/* ===================== a campaign's figures ===================== */

export interface Range extends Totals { dateFrom: string | null; dateTo: string | null; source: "campaign" | "campaign_daily" | "grid" | "search_term" | "bulk" }

/**
 * A campaign's totals from the best source, never adding the same days twice:
 * 1. daily rows, when there are any (each day once);
 * 2. else its dated ranges (campaign reports, bulk exports), widest first, skipping any that overlaps one taken
 *    (re-imports and overlapping exports don't double count);
 * 3. else the Campaign Manager export's totals ("as exported": their range is unknown);
 * 4. else its search terms summed.
 */
export function campaignTotals(x: { daily: Range[]; ranges: Range[]; grid: Range | null; terms: Totals | null }): { totals: Totals; source: Range["source"]; from: string | null; to: string | null } | null {
  if (x.daily.length) {
    const byDay = new Map(x.daily.map((d) => [d.dateFrom, d]));
    const days = [...byDay.values()];
    return { totals: days.reduce<Totals>((a, d) => add(a, d), ZERO), source: "campaign_daily", ...span(days) };
  }
  const dated = x.ranges.filter((r) => r.dateFrom && r.dateTo).sort((a, b) => days(b) - days(a));
  const taken: Range[] = [];
  for (const r of dated) if (!taken.some((t) => r.dateFrom! <= t.dateTo! && t.dateFrom! <= r.dateTo!)) taken.push(r);
  if (taken.length) return { totals: taken.reduce<Totals>((a, r) => add(a, r), ZERO), source: "campaign", ...span(taken) };
  if (x.grid) return { totals: x.grid, source: "grid", from: null, to: x.grid.dateTo };
  if (x.terms) return { totals: x.terms, source: "search_term", from: null, to: null };
  return null;
}

/**
 * The date ranges to count, never overlapping: widest first, then (for equal dates) the higher
 * rank, skipping any that overlaps one taken. Search terms use it per campaign so a bulk export and
 * a search term report over overlapping weeks aren't added together.
 */
export function chooseRanges<T extends { from: string; to: string; rank?: number }>(rs: T[]): T[] {
  const width = (r: T) => Date.parse(r.to) - Date.parse(r.from);
  const sorted = [...rs].sort((a, b) => width(b) - width(a) || (b.rank ?? 0) - (a.rank ?? 0));
  const taken: T[] = [];
  for (const r of sorted) if (!taken.some((t) => r.from <= t.to && t.from <= r.to)) taken.push(r);
  return taken;
}

const days = (r: Range) => (Date.parse(r.dateTo!) - Date.parse(r.dateFrom!)) / 86_400_000;
const span = (rs: Range[]) => ({
  from: rs.map((r) => r.dateFrom).filter((x): x is string => !!x).sort()[0] ?? null,
  to: rs.map((r) => r.dateTo).filter((x): x is string => !!x).sort().at(-1) ?? null,
});

/* ===================== economics ===================== */

/**
 * A product's unit economics before ads, from the fee engine: price, fees (referral, FBA, storage,
 * returns, with VAT and DSF) and landed cost. Margin before ads ÷ price is the break-even ACoS:
 * spend more than that per ad sale and each ad sale loses money.
 */
export interface UnitEconomics { price: number; fees: number | null; landed: number | null }

export function marginBeforeAds(e: UnitEconomics): number | null {
  return e.fees == null || e.landed == null ? null : e.price - e.fees - e.landed;
}

export function breakEvenAcos(e: UnitEconomics): number | null {
  const m = marginBeforeAds(e);
  return m == null || e.price <= 0 ? null : m / e.price;
}

/** Sales − fees × units − landed × units − spend; units are orders when the report has no units. */
export function profitAfterAds(t: Totals, e: UnitEconomics): number | null {
  if (e.fees == null || e.landed == null) return null;
  const units = t.units ?? t.orders;
  return t.sales - (e.fees + e.landed) * units - t.cost;
}

/* ===================== search-term status ===================== */

/** The thresholds the chips use; the Negative rule's defaults are the same (src/lib/ads/rules.ts). */
export const ADS_THRESHOLDS = {
  /** Clicks with no order before a term is waste. */
  wasteClicks: 15,
  /** Spend with no order, as a share of the product's price, before a term is waste. */
  wasteSpendOfPrice: 0.5,
};

export type TermStatus = "converting" | "over_target" | "watch" | "waste";

export const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  converting: "Converting", over_target: "Over target", watch: "Watch", waste: "Waste",
};

/**
 * Converting: orders at or under the target ACoS. Over target: orders, but ACoS above it.
 * Waste: no order after 15 clicks, or after spending half the product's price. Watch: no order yet,
 * under both.
 */
export function termStatus(t: Pick<Totals, "clicks" | "cost" | "orders" | "sales">, targetAcos: number, price: number | null): { status: TermStatus; why: string } {
  if (t.orders > 0) {
    const acos = t.sales ? t.cost / t.sales : Infinity;
    return acos <= targetAcos
      ? { status: "converting", why: `ACoS ${pctTxt(acos)} at or under the ${pctTxt(targetAcos)} target` }
      : { status: "over_target", why: `ACoS ${pctTxt(acos)} over the ${pctTxt(targetAcos)} target` };
  }
  const spendCap = price != null ? price * ADS_THRESHOLDS.wasteSpendOfPrice : null;
  if (t.clicks >= ADS_THRESHOLDS.wasteClicks) return { status: "waste", why: `${t.clicks} clicks and no order (${ADS_THRESHOLDS.wasteClicks}+)` };
  if (spendCap != null && t.cost >= spendCap) return { status: "waste", why: `£${t.cost.toFixed(2)} spent and no order (half the £${price!.toFixed(2)} price)` };
  return { status: "watch", why: `${t.clicks} click${t.clicks === 1 ? "" : "s"}, no order yet` };
}

const pctTxt = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "∞");
