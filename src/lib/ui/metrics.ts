/** Figures for the results table, read from the market data stored on a result. */

export interface StoredMarket {
  hasHistory: boolean;
  rankDrops30d?: number | null;
  monthlySold?: number | null;
  fbaOffers?: number | null;
  offersNow?: number | null;
  currentBuyBox?: number | null;
}

export interface Figure {
  value: number | null;
  /** Tooltip: where the number came from. */
  note: string;
}

/**
 * Estimated sales a month: the higher of Keepa's rank drops in the last 30 days and
 * Amazon's "bought in past month". Nothing without Keepa history.
 */
export function estSales(m: StoredMarket | null | undefined): Figure {
  if (!m?.hasHistory) return { value: null, note: "Needs Keepa history (Keepa is a stub for now)" };
  const drops = m.rankDrops30d ?? null;
  const bought = m.monthlySold ?? null;
  if (drops == null && bought == null) return { value: null, note: "Keepa has no rank drops or bought-in-past-month figure" };
  if (bought != null && (drops == null || bought > drops)) {
    return { value: bought, note: `Amazon's "bought in past month" (${bought}+)${drops != null ? `, higher than ${drops} rank drops in 30 days` : ""}` };
  }
  return { value: drops, note: `${drops} rank drops in the last 30 days (Keepa)${bought != null ? `, vs ${bought}+ bought in past month` : ", no bought-in-past-month figure"}` };
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
