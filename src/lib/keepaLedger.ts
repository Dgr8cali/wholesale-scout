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
