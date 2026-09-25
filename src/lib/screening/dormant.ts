/**
 * A dormant listing: the ASIN exists and Keepa has its history, but nobody sells it now:
 * no Buy Box, no current rank, and no current offers (Keepa's offer count, or an offer
 * still live in its history, would mean somebody is). It's scored on its history instead: the last Buy Box
 * price seen in 12 months, and 12 months of rank drops for demand.
 */
export interface DormantInputs {
  hasHistory: boolean;
  currentBuyBox: number | null;
  rankNow: number | null;
  lastBuyBox12m?: number | null;
  lastBuyBoxAt?: string | null;
  rankDrops12m?: number | null;
  offersNow?: number | null;
  lastOfferDaysAgo?: number | null;
}

export function isDormant(m: DormantInputs | null | undefined): boolean {
  return !!m?.hasHistory && m.currentBuyBox == null && m.rankNow == null && !((m.offersNow ?? 0) > 0) && m.lastOfferDaysAgo !== 0;
}

/** "last seen £12.99 on 3 Mar 2026" */
export function lastSeenLabel(price: number, at: string | null | undefined): string {
  const when = at ? ` on ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}` : "";
  return `last seen £${price.toFixed(2)}${when}`;
}
