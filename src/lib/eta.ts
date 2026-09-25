/**
 * Time left on a run: rows queued for Amazon at the rate this run has been achieving, plus
 * rows queued for Keepa at the token balance and refill rate Keepa last reported.
 */

export interface RunStats {
  /** A watchlist re-check: when it started, and when its conditions were evaluated (alerts sent). */
  watch?: { startedAt: string; evaluatedAt?: string | null; alerts?: number; emailed?: boolean } | null;
  /** A seller scan: whose storefront this run screens (rows mark whether it holds the Buy Box). */
  scan?: { sellerId: string; sellerName: string | null; asins: number; more: number } | null;
  /** Rows leaving the Amazon queue per minute, measured on this run (smoothed across batches). */
  amazonPerMin?: number | null;
  /** Keepa's own figures, as last read by the Keepa stage. */
  keepa?: { tokensLeft: number; refillRate: number; refillInMs: number; at: string } | null;
  /** The profile the run was last screened with: its name and when it was last saved. */
  profile?: { id: string; name: string; savedAt: string | null; appliedAt: string } | null;
  /** A re-screen in progress (or the last one): rows updated before startedAt still need it. */
  rescreen?: { startedAt: string; finishedAt: string | null; storedOnly: boolean; resultIds?: string[] | null; rescored: number; requeued: number } | null;
  /** Keepa tokens by stage: history (1 a product), Buy Box (3 a product), EAN lookups, seller profiles. */
  keepaStages?: { history: number; buyBox: number; lookup: number; sellers: number } | null;
  /** Keepa tokens this run spent per UK day (see keepaLedger). */
  keepaByDay?: Record<string, number> | null;
}

export interface Eta {
  /** Estimated minutes left; null while there's nothing to estimate from yet. */
  minutes: number | null;
  /** Only rows waiting on Keepa's refill remain, and the balance can't cover the next one. */
  refillBound: boolean;
  /** When Keepa should have tokens again (ISO), when refill-bound. */
  resumeAt: string | null;
}

export const KEEPA_TOKENS_PER_ROW = 3;

export function estimateEta(
  waiting: { amazon: number; keepa: number },
  stats: RunStats | null | undefined,
  resumeAfter: string | null,
  now = Date.now(),
  /** Keepa tokens the waiting rows need (1 for history, 3 with Buy Box); defaults to 3 a row. */
  keepaTokensNeeded?: number,
): Eta {
  const rate = stats?.amazonPerMin ?? null;
  let minutes: number | null = 0;
  if (waiting.amazon > 0) minutes = rate && rate > 0 ? waiting.amazon / rate : null;

  let refillBound = false;
  let resumeAt: string | null = null;
  if (waiting.keepa > 0) {
    const k = stats?.keepa;
    if (!k || !(k.refillRate > 0)) {
      minutes = null;
    } else {
      // Tokens now: last reported balance plus what has refilled since.
      const since = Math.max(0, (now - Date.parse(k.at)) / 60_000);
      const tokensNow = k.tokensLeft + k.refillRate * since;
      const need = keepaTokensNeeded ?? waiting.keepa * KEEPA_TOKENS_PER_ROW;
      const keepaMin = Math.max(0, need - tokensNow) / k.refillRate;
      if (minutes != null) minutes += keepaMin;
      if (waiting.amazon === 0 && tokensNow < KEEPA_TOKENS_PER_ROW) {
        refillBound = true;
        resumeAt = resumeAfter ?? new Date(now + ((KEEPA_TOKENS_PER_ROW - tokensNow) / k.refillRate) * 60_000).toISOString();
      }
    }
  }
  return { minutes, refillBound, resumeAt };
}

/** "about 12 min left", "about 1 h 5 min left", "under a minute", "waiting for Keepa tokens, resumes at 14:32". */
export function etaLabel(eta: Eta, timeZone?: string): string {
  if (eta.refillBound && eta.resumeAt) {
    const at = new Date(eta.resumeAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
    return `waiting for Keepa tokens, resumes at ${at}`;
  }
  if (eta.minutes == null) return "estimating time left…";
  if (eta.minutes < 1) return "under a minute";
  const m = Math.ceil(eta.minutes);
  return m < 60 ? `about ${m} min left` : `about ${Math.floor(m / 60)} h ${m % 60} min left`;
}
