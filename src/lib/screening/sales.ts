/**
 * Sales a month for one listing: the highest of our rank-drop count from the Keepa history,
 * Keepa's own 30-day rank-drop count, and Amazon's "bought in past month" (Keepa's
 * monthlySold). The Demand gate and the results table's Sales / mo read this same figure.
 * Nothing without Keepa history: a current rank alone says nothing about sales.
 */
export interface SalesInputs {
  hasHistory: boolean;
  rankDrops30d?: number | null;
  keepaRankDrops30?: number | null;
  monthlySold?: number | null;
}

export interface SalesFigure {
  /** null without history; 0 when there is history but none of the sources recorded a sale. */
  value: number | null;
  sources: { label: string; value: number | null; plus?: boolean; best: boolean }[];
}

export function salesPerMonth(m: SalesInputs | null | undefined): SalesFigure {
  if (!m?.hasHistory) return { value: null, sources: [] };
  const raw = [
    { label: "rank drops in 30 days (from the history)", value: m.rankDrops30d ?? null },
    { label: "Keepa's 30-day rank-drop count", value: m.keepaRankDrops30 ?? null },
    { label: `Amazon "bought in past month" (via Keepa)`, value: m.monthlySold ?? null, plus: true },
  ];
  const known = raw.filter((s) => s.value != null);
  const best = known.length ? known.reduce((a, b) => (b.value! > a.value! ? b : a)) : null;
  return { value: best ? best.value : 0, sources: raw.map((s) => ({ ...s, best: s === best })) };
}

/** What your share needs on top of sales: who else sells, and whether Amazon does. */
export interface ShareInputs extends SalesInputs {
  fbaOffers?: number | null;
  offersNow?: number | null;
  /** 0 = Amazon holds an offer now. */
  amazonLastSeenDays?: number | null;
  // Dormant listings (nobody selling now): sales come from the past year instead.
  currentBuyBox?: number | null;
  rankNow?: number | null;
  rankDrops12m?: number | null;
  lastOfferDaysAgo?: number | null;
}

export interface ShareFigure {
  value: number | null;
  sales: number | null;
  /** Sellers you'd share with, Amazon counted as three. */
  competitors: number | null;
  amazon: boolean;
  note: string;
}

/**
 * Your share of sales a month: sales ÷ (FBA sellers + 1 for you), with Amazon counted as
 * three sellers when it's on the listing (it takes the Buy Box far more than its share).
 * Keepa's FBA count leaves Amazon out; the all-offers fallback includes it once.
 * Dormant listings: the past year's sales a month, shared with nobody.
 */
export function yourShare(m: ShareInputs | null | undefined): ShareFigure {
  const none = (note: string): ShareFigure => ({ value: null, sales: null, competitors: null, amazon: false, note });
  if (!m?.hasHistory) return none("Needs Keepa history");
  const amazon = m.amazonLastSeenDays === 0;
  const dormant = m.currentBuyBox == null && m.rankNow == null && !((m.offersNow ?? 0) > 0) && m.lastOfferDaysAgo !== 0;
  if (dormant) {
    const sales = m.rankDrops12m != null ? Math.round((m.rankDrops12m / 12) * 10) / 10 : 0;
    return { value: sales, sales, competitors: 0, amazon: false, note: `Dormant: ${sales}/mo over the past year, nobody selling now` };
  }
  const sales = salesPerMonth(m).value ?? 0;
  let competitors: number | null = null;
  if (m.fbaOffers != null) competitors = m.fbaOffers + (amazon ? 3 : 0);
  else if (m.offersNow != null) competitors = m.offersNow + (amazon ? 2 : 0);
  if (competitors == null) return { ...none("No seller count"), sales };
  const value = Math.round((sales / (competitors + 1)) * 10) / 10;
  return {
    value, sales, competitors, amazon,
    note: `${sales} sales/mo ÷ (${competitors} other seller${competitors === 1 ? "" : "s"}${amazon ? ", Amazon counted as 3" : ""} + you)`,
  };
}

/** Your profit a month: your share of sales × net profit per unit. */
export function profitPerMonth(share: number | null, profitPerUnit: number | null): number | null {
  return share == null || profitPerUnit == null ? null : Math.round(share * profitPerUnit * 100) / 100;
}
