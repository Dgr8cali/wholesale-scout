/** Figures for the results table, read from the market data stored on a result. */

export interface StoredMarket {
  hasHistory: boolean;
  rankDrops30d?: number | null;
  keepaRankDrops30?: number | null;
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
 * Estimated sales a month: the highest of our rank-drop count from the history, Keepa's
 * own 30-day rank-drop count, and Amazon's "bought in past month" (which Keepa carries as
 * monthlySold). The tooltip lists all three. Nothing without Keepa history.
 */
export function estSales(m: StoredMarket | null | undefined): Figure {
  if (!m?.hasHistory) return { value: null, note: "Needs Keepa history" };
  const sources = [
    { label: "rank drops in 30 days (from the history)", value: m.rankDrops30d ?? null },
    { label: "Keepa's 30-day rank-drop count", value: m.keepaRankDrops30 ?? null },
    { label: `Amazon "bought in past month" (via Keepa)`, value: m.monthlySold ?? null, plus: true },
  ];
  const known = sources.filter((s) => s.value != null);
  if (!known.length) return { value: null, note: "Keepa has no rank drops or bought-in-past-month figure" };
  const best = known.reduce((a, b) => (b.value! > a.value! ? b : a));
  const lines = sources.map((s) => `${s === best ? "▶ " : "  "}${s.label}: ${s.value == null ? "—" : `${s.value}${s.plus ? "+" : ""}`}`);
  return { value: best.value, note: `Highest of:\n${lines.join("\n")}` };
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
