/**
 * What actually happened to a purchase, from Amazon's own reports (sales and traffic, orders,
 * finances, FBA inventory), and how it compares with the frozen prediction. Pure.
 */

export interface Actuals {
  /** The first day this ASIN sold after the purchase went live (or was ordered). */
  since: string | null;
  daysLive: number;
  unitsSold: number;
  revenue: number;
  avgPrice: number | null;
  /** Amazon's fees per unit sold, from the finance events. */
  feesPerUnit: number | null;
  unitsPerMonth: number | null;
  /** Your share of the Buy Box, % of page views, over the period. */
  buyBoxPct: number | null;
  onHand: number | null;
  inbound: number | null;
  profitPerUnit: number | null;
  profitToDate: number | null;
  /** At the current pace, days until the rest sells. */
  sellOutDays: number | null;
  syncedAt: string | null;
}

export interface SaleDay { day: string; units: number; revenue: number }
export interface PurchaseLike {
  id: string; units: number; landed_gbp: number; ordered_on: string;
  status_dates: Partial<Record<string, string>>;
}

const DAY = 86_400_000;
const MONTH_DAYS = 30.4;
const r2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** When a purchase's stock could start selling: live, else sent to Amazon, else ordered. */
export const startOf = (p: PurchaseLike) => p.status_dates.live ?? p.status_dates.sent ?? p.ordered_on;

/**
 * How each purchase of one ASIN is doing, from its FBA sales per day. Sales go to purchases
 * first in, first out: the earliest purchase sells before a later one. Fees per unit and output
 * VAT come from the fee engine at the price you actually sold at (Amazon's fee estimate, with
 * the same storage, returns, DSF and VAT as the prediction).
 */
export function computeActuals(
  purchases: PurchaseLike[],
  sales: SaleDay[],
  money: { feesPerUnit: (price: number) => number | null; outputVat: (price: number) => number },
  stock: { onHand: number | null; inbound: number | null },
  today: string,
  syncedAt: string | null,
): Map<string, Actuals> {
  const out = new Map<string, Actuals>();
  const days = [...sales].filter((s) => s.units > 0).sort((a, b) => a.day.localeCompare(b.day)).map((s) => ({ ...s, left: s.units }));
  const order = [...purchases].sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.id.localeCompare(b.id));
  for (const p of order) {
    const start = startOf(p);
    let units = 0, revenue = 0, first: string | null = null, last: string | null = null;
    for (const d of days) {
      if (units >= p.units) break;
      if (d.day < start || d.left <= 0) continue;
      const take = Math.min(d.left, p.units - units);
      revenue += (d.revenue / d.units) * take;
      units += take;
      d.left -= take;
      first ??= d.day;
      last = d.day;
    }
    const daysLive = Math.max(1, daysBetween(start, today));
    const soldOut = units >= p.units;
    // The pace: over the days live, or up to the last sale when it sold out.
    const span = soldOut && last ? Math.max(1, daysBetween(start, last) + 1) : daysLive;
    const perMonth = daysLive >= 7 || soldOut ? r2((units / span) * MONTH_DAYS) : null;
    const avgPrice = units ? r2(revenue / units) : null;
    const fees = avgPrice != null ? money.feesPerUnit(avgPrice) : null;
    const profit = avgPrice != null && fees != null ? r2(avgPrice - fees - money.outputVat(avgPrice) - p.landed_gbp) : null;
    const remaining = p.units - units;
    out.set(p.id, {
      since: first,
      daysLive,
      unitsSold: units,
      revenue: r2(revenue),
      avgPrice,
      feesPerUnit: fees == null ? null : r2(fees),
      unitsPerMonth: perMonth,
      buyBoxPct: null,
      onHand: stock.onHand,
      inbound: stock.inbound,
      profitPerUnit: profit,
      profitToDate: profit == null ? null : r2(profit * units),
      sellOutDays: remaining <= 0 ? 0 : perMonth ? Math.round(remaining / (perMonth / MONTH_DAYS)) : null,
      syncedAt,
    });
  }
  return out;
}
