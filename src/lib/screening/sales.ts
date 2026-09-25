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
