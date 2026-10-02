/**
 * What a campaign's daily rows (the daily Campaign report) say: days out of budget, 7- and 14-day
 * windows, and the impressions trend week on week. The rules for bids, budgets and quiet keywords
 * read these. Pure.
 */

export interface DailyRow { date: string; impressions: number | null; clicks: number; cost: number; orders: number; sales: number }
export interface Window { days: number; from: string | null; to: string | null; impressions: number; clicks: number; cost: number; orders: number; sales: number }

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** A day's spend this close to the budget counts as out of budget (Amazon stops a little short). */
export const BUDGET_HIT = 0.95;
/** Daily data older than this (its last day before today) is too old to act on. */
export const DAILY_STALE_DAYS = 10;

/** The n days ending on `end` (inclusive), summed over the rows present. */
export function windowOf(rows: DailyRow[], end: string, n: number): Window {
  const from = iso(Date.parse(end) - (n - 1) * DAY);
  const inside = rows.filter((r) => r.date >= from && r.date <= end);
  return inside.reduce<Window>((a, r) => ({ ...a, impressions: a.impressions + (r.impressions ?? 0), clicks: a.clicks + r.clicks, cost: a.cost + r.cost, orders: a.orders + r.orders, sales: a.sales + r.sales }),
    { days: inside.length, from: inside.length ? from : null, to: inside.length ? end : null, impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 });
}

export interface DailySignals {
  /** The last day with data, and whether it's recent enough to act on. */
  last: string; fresh: boolean;
  week: Window; prevWeek: Window; fortnight: Window;
  /** Days in the last 7 with spend at least 95% of the budget. */
  budgetLimitedDays: number;
  /** Impressions this week against last week: −0.2 is 20% fewer; null without both weeks. */
  impressionsChange: number | null;
}

export function dailySignals(rows: DailyRow[], budget: number | null, today: string, windowDays = 7, staleDays = DAILY_STALE_DAYS): DailySignals | null {
  if (!rows.length) return null;
  const last = rows.map((r) => r.date).sort().at(-1)!;
  const week = windowOf(rows, last, windowDays);
  const prevWeek = windowOf(rows, iso(Date.parse(last) - windowDays * DAY), windowDays);
  const fortnight = windowOf(rows, last, windowDays * 2);
  const from = iso(Date.parse(last) - (windowDays - 1) * DAY);
  const budgetLimitedDays = budget ? rows.filter((r) => r.date >= from && r.date <= last && r.cost >= budget * BUDGET_HIT).length : 0;
  const impressionsChange = week.days >= windowDays - 1 && prevWeek.days >= windowDays - 1 && prevWeek.impressions > 0 ? week.impressions / prevWeek.impressions - 1 : null;
  return { last, fresh: (Date.parse(today) - Date.parse(last)) / DAY <= staleDays, week, prevWeek, fortnight, budgetLimitedDays, impressionsChange };
}
