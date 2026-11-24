/**
 * Where daily campaign rows come from: an imported report file ('import') or the Amazon Ads API
 * ('api'). Both are kept (an API pull never overwrites an imported row); where both cover the same
 * campaign and day, the API's row counts, since it's fresher (attribution is revised after the fact).
 * Every reader of ads_campaign_daily passes its rows through this.
 */
export function preferApi<T extends { campaign: string; date: string; source?: string | null }>(rows: T[]): T[] {
  const api = new Set<string>();
  for (const r of rows) if (r.source === "api") api.add(`${r.campaign}|${r.date}`);
  return api.size ? rows.filter((r) => r.source === "api" || !api.has(`${r.campaign}|${r.date}`)) : rows;
}

export interface SourceSummary {
  api: { from: string | null; to: string | null; days: number };
  import: { from: string | null; to: string | null; days: number };
  /** Days both cover: the app uses the API's. */
  overlapDays: number;
}

/** Which source the daily numbers come from, for the Settings → Amazon Ads card. */
export function summariseSources(rows: { date: string; source?: string | null }[]): SourceSummary {
  const days = { api: new Set<string>(), import: new Set<string>() };
  for (const r of rows) days[r.source === "api" ? "api" : "import"].add(r.date);
  const span = (s: Set<string>) => { const d = [...s].sort(); return { from: d[0] ?? null, to: d.at(-1) ?? null, days: d.length }; };
  return { api: span(days.api), import: span(days.import), overlapDays: [...days.api].filter((d) => days.import.has(d)).length };
}
