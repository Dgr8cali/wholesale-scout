/**
 * Keepa tokens spent per day, kept on each run's stats so the dashboard can say what today
 * has cost. Days are UK calendar days.
 */

/** Days of history each run keeps. */
const KEEP_DAYS = 14;

export type TokensByDay = Record<string, number>;

/** The UK calendar day of an instant, as YYYY-MM-DD. */
export function ukDay(at: Date = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** Add tokens to a day's total, dropping days older than the retention window. */
export function addDailyTokens(ledger: TokensByDay | null | undefined, tokens: number, at: Date = new Date()): TokensByDay {
  const out: TokensByDay = { ...(ledger ?? {}) };
  if (tokens > 0) {
    const day = ukDay(at);
    out[day] = (out[day] ?? 0) + tokens;
  }
  const cutoff = ukDay(new Date(at.getTime() - KEEP_DAYS * 86_400_000));
  for (const d of Object.keys(out)) if (d < cutoff) delete out[d];
  return out;
}

/** Tokens spent on a day across runs. */
export function tokensOnDay(ledgers: (TokensByDay | null | undefined)[], day: string = ukDay()): number {
  return ledgers.reduce((sum, l) => sum + (l?.[day] ?? 0), 0);
}

/** What a run tells us about its Keepa spend: its total, when it started, and its per-day ledger. */
export interface RunSpend { startedAt: string; tokenCost: number; keepaByDay?: TokensByDay | null }

/**
 * Keepa tokens spent per UK day over the last `days` days (oldest first), from the totals
 * recorded on runs. A run's total counts on the day it started, except what its ledger shows
 * was spent on other days (a re-screen, or a run that carried on past midnight), which counts
 * on those days instead. Runs from before the ledger simply count on their start day.
 */
export function dailySpend(runs: RunSpend[], days = 7, now: Date = new Date()): { day: string; tokens: number }[] {
  const out = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) out.set(ukDay(new Date(now.getTime() - i * 86_400_000)), 0);
  for (const r of runs) {
    const start = ukDay(new Date(r.startedAt));
    let elsewhere = 0;
    for (const [day, t] of Object.entries(r.keepaByDay ?? {})) {
      if (day === start || !(t > 0)) continue;
      elsewhere += t;
      if (out.has(day)) out.set(day, out.get(day)! + t);
    }
    if (out.has(start)) out.set(start, out.get(start)! + Math.max(0, (r.tokenCost ?? 0) - elsewhere));
  }
  return [...out].map(([day, tokens]) => ({ day, tokens }));
}
