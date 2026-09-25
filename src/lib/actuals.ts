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
