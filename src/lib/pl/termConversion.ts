/**
 * A niche's best search-term conversion, from an Opportunity Explorer capture (the extension's "Send
 * to Private label"): the highest 360-day conversion among its search terms. Shoppers who search but
 * don't buy on any term are browsing (BROWSE-ONLY, best under 2.5%); a term converting at 4%+ means
 * they come to buy (BUYING). In between, no chip. Pure.
 */
export const TERM_CONV = { browseBelow: 2.5, buyingAt: 4 } as const;
export type TermSignal = "BUYING" | "BROWSE_ONLY";
export const TERM_SIGNAL_LABEL: Record<TermSignal, string> = { BUYING: "Buying", BROWSE_ONLY: "Browse-only" };

export interface ConvTerm { term: string; volume?: number | null; conversion: number | null }

/** The term converting best (%), or null when no term has a conversion figure. */
export function bestTermConversion(terms: ConvTerm[] | null | undefined): { term: string; conversion: number } | null {
  let best: { term: string; conversion: number } | null = null;
  for (const t of terms ?? []) {
    if (t.conversion == null || !Number.isFinite(t.conversion)) continue;
    if (!best || t.conversion > best.conversion) best = { term: t.term, conversion: t.conversion };
  }
  return best;
}

/** BUYING when the best term converts ≥ 4%, BROWSE_ONLY when none reaches 2.5%, else null. */
export function termSignal(best: number | null | undefined): TermSignal | null {
  if (best == null) return null;
  if (best >= TERM_CONV.buyingAt) return "BUYING";
  if (best < TERM_CONV.browseBelow) return "BROWSE_ONLY";
  return null;
}

/** "Best term 11.2% (bottle brush): buying" — the reading for the scorecard lines. */
export function termSignalText(best: number | null | undefined, term?: string | null): string {
  if (best == null) return "No search-term conversion captured";
  const s = termSignal(best);
  const what = s === "BUYING" ? "buying: a term converts at 4%+" : s === "BROWSE_ONLY" ? "browse-only: no term converts at 2.5%+" : "between 2.5% and 4%";
  return `Best term ${best}%${term ? ` ("${term}")` : ""}: ${what}`;
}
