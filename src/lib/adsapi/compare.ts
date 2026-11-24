export interface Totals { impressions: number; clicks: number; cost: number; orders: number; sales: number }
export interface ImportedDay extends Totals { date: string; campaignId: string | null; campaignName: string }
export interface CompareRow { key: string; label: string; api: Totals | null; imported: Totals | null }
export interface Comparison { days: CompareRow[]; campaigns: CompareRow[]; apiTotal: Totals; importedTotal: Totals | null }

const zero = (): Totals => ({ impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 });
const addTo = (t: Totals, r: Totals) => { t.impressions += r.impressions; t.clicks += r.clicks; t.cost += r.cost; t.orders += r.orders; t.sales += r.sales; };
const round = (t: Totals): Totals => ({ ...t, cost: Math.round(t.cost * 100) / 100, sales: Math.round(t.sales * 100) / 100 });

/**
 * The API's last-7-days campaign rows next to the daily rows already imported from reports, by
 * day and by campaign. An imported side is null where nothing was imported for that day or campaign.
 */
export function compareWeek(api: ImportedDay[], imported: ImportedDay[], from: string, to: string): Comparison {
  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10));

  const apiDay = new Map<string, Totals>(), impDay = new Map<string, Totals>();
  for (const r of api) addTo(apiDay.get(r.date) ?? apiDay.set(r.date, zero()).get(r.date)!, r);
  for (const r of imported) addTo(impDay.get(r.date) ?? impDay.set(r.date, zero()).get(r.date)!, r);

  // Campaigns match by Amazon's numeric id, else by name (case-insensitive).
  const apiCamp = new Map<string, { label: string; t: Totals }>(), impCamp = new Map<string, { label: string; t: Totals }>();
  const apiKey = (r: ImportedDay) => r.campaignId ?? `name:${r.campaignName.toLowerCase()}`;
  const idByName = new Map(api.map((r) => [r.campaignName.toLowerCase(), apiKey(r)]));
  for (const r of api) addTo((apiCamp.get(apiKey(r)) ?? apiCamp.set(apiKey(r), { label: r.campaignName, t: zero() }).get(apiKey(r))!).t, r);
  for (const r of imported) {
    const k = r.campaignId && apiCamp.has(r.campaignId) ? r.campaignId : idByName.get(r.campaignName.toLowerCase()) ?? r.campaignId ?? `name:${r.campaignName.toLowerCase()}`;
    addTo((impCamp.get(k) ?? impCamp.set(k, { label: r.campaignName, t: zero() }).get(k)!).t, r);
  }
  const campKeys = [...new Set([...apiCamp.keys(), ...impCamp.keys()])];
  const campaigns = campKeys.map((k): CompareRow => ({ key: k, label: apiCamp.get(k)?.label ?? impCamp.get(k)!.label, api: apiCamp.has(k) ? round(apiCamp.get(k)!.t) : null, imported: impCamp.has(k) ? round(impCamp.get(k)!.t) : null }))
    .sort((a, b) => (b.api?.cost ?? b.imported?.cost ?? 0) - (a.api?.cost ?? a.imported?.cost ?? 0));

  const apiTotal = zero(); for (const r of api) addTo(apiTotal, r);
  const importedTotal = imported.length ? zero() : null; if (importedTotal) for (const r of imported) addTo(importedTotal, r);
  return {
    days: dates.map((d) => ({ key: d, label: d, api: apiDay.has(d) ? round(apiDay.get(d)!) : null, imported: impDay.has(d) ? round(impDay.get(d)!) : null })),
    campaigns, apiTotal: round(apiTotal), importedTotal: importedTotal && round(importedTotal),
  };
}
