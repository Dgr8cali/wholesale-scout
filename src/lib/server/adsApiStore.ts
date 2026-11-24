import "server-only";
import type { AdsRow } from "../ads/parse";
import { parseAdvertised, parseCampaigns, parseSearchTerms, parseTargeting, REPORTS, type Perf, type ReportKind } from "../adsapi/reports";
import { resolveCampaigns } from "./ads";
import { chunks, db, must, selectAll } from "./db";

const IMPORT_TYPE: Record<ReportKind, string> = { campaigns: "api_campaign_daily", search_terms: "api_search_terms", targeting: "api_targeting", advertised_products: "api_products" };

/** A campaign as resolveCampaigns wants it (it matches by Amazon's ID, else the exact name, and creates what's new). */
const campaignRow = (campaignId: string, campaignName: string, extra: Partial<AdsRow> = {}): AdsRow => ({
  campaignId, campaignName, adGroupId: null, adGroupName: null, searchTerm: null, keyword: null, matchType: null, placement: null, dateFrom: null, dateTo: null,
  impressions: null, clicks: 0, cost: 0, orders: 0, sales: 0, units: null, state: null, type: "Sponsored Products", targeting: null, campaignStart: null, campaignEnd: null,
  budget: null, topOfSearchShare: null, currency: null, ...extra,
});

/** Amazon campaign id → our campaign's uuid, creating campaigns that are new. */
async function campaignIds(rows: { campaignId: string; campaignName: string }[], extra: (r: never) => Partial<AdsRow> = () => ({})): Promise<Map<string, string>> {
  const ar = rows.map((r) => campaignRow(r.campaignId, r.campaignName, extra(r as never)));
  const resolved = await resolveCampaigns(ar);
  return new Map(ar.map((row, i) => [rows[i].campaignId, resolved.get(row)!]));
}

const metrics = (p: Perf) => ({ impressions: p.impressions, clicks: Math.round(p.clicks), cost: p.cost, orders: Math.round(p.orders), sales: p.sales, units: p.units == null ? null : Math.round(p.units) });
const perfRange = (p: Perf, from: string, to: string, importId: string) => ({ ...metrics(p), date_from: from, date_to: to, import_id: importId });

export interface Stored { importId: string; rows: number; added: number; updated: number }

/**
 * Write one report's rows into the same tables a file import uses, marked source 'api', and say how
 * many were new and how many replaced an earlier pull. Upserts are keyed on campaign, day and
 * entity (plus source), so pulling the same days again replaces rows instead of doubling them, and an
 * imported row is never touched. Keyword, product-target and product-ad rows are one per Amazon ID:
 * Amazon's numbers and current bids replace what an earlier import said (a missing bid or state
 * never blanks one that's there).
 */
export async function storeApiReport(kind: ReportKind, json: unknown, win: { from: string; to: string }): Promise<Stored> {
  const d = db();
  const upsert = async (table: string, rows: Record<string, unknown>[], onConflict: string) => {
    for (const c of chunks(rows, 200)) if (c.length) must(await d.from(table).upsert(c, { onConflict }), `save ${table}`);
  };
  // Which of these keys already exist, to tell new rows from replaced ones.
  const existing = async (table: string, key: string, ids: string[]) => {
    const have = new Set<string>();
    for (const c of chunks(ids, 200)) for (const r of must(await d.from(table).select(key).in(key, c), `read ${table}`) as unknown as Record<string, string>[]) have.add(String(r[key]));
    return have;
  };
  const count = (keys: string[], have: Set<string>) => { const added = keys.filter((k) => !have.has(k)).length; return { added, updated: keys.length - added }; };
  const startImport = async (rows: number) => (must(await d.from("ads_imports").insert({
    report_type: IMPORT_TYPE[kind], file_name: `Amazon Ads API: ${REPORTS[kind].label} ${win.from} to ${win.to}`.slice(0, 200), rows, date_from: win.from, date_to: win.to,
  }).select("id").single(), "import") as { id: string }).id;

  if (kind === "campaigns") {
    const rows = parseCampaigns(json);
    const importId = await startImport(rows.length);
    const ids = await campaignIds(rows, (r: (typeof rows)[number]) => ({ state: r.state, budget: r.budget, currency: r.currency }));
    const out = rows.map((r) => ({ campaign: ids.get(r.campaignId)!, date: r.date, ...metrics(r), source: "api", import_id: importId }));
    const have = new Set<string>();
    for (const r of await selectAll<{ campaign: string; date: string }>("ads_campaign_daily", "campaign, date", ["campaign", "date"], (q) => q.eq("source", "api").gte("date", win.from).lte("date", win.to))) have.add(`${r.campaign}|${r.date}`);
    await upsert("ads_campaign_daily", out, "campaign,date,source");
    return { importId, rows: rows.length, ...count(out.map((r) => `${r.campaign}|${r.date}`), have) };
  }

  if (kind === "search_terms") {
    const rows = parseSearchTerms(json);
    const importId = await startImport(rows.length);
    const uuid = await campaignIds(rows);
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const row = {
        campaign: uuid.get(r.campaignId)!, ad_group_id: r.adGroupId, ad_group_name: r.adGroupName, keyword_id: r.keywordId, keyword_text: r.keywordText, match_type: r.matchType,
        term: r.term, date_from: r.date, date_to: r.date, ...metrics(r), source: "api", import_id: importId,
      };
      byKey.set(`${row.campaign}|${row.ad_group_id}|${row.keyword_id}|${row.term}|${row.date_from}`, row);
    }
    const have = new Set<string>();
    for (const r of await selectAll<{ campaign: string; ad_group_id: string; keyword_id: string; term: string; date_from: string }>("ads_search_terms", "campaign, ad_group_id, keyword_id, term, date_from", ["id"], (q) => q.eq("source", "api").gte("date_from", win.from).lte("date_from", win.to))) have.add(`${r.campaign}|${r.ad_group_id}|${r.keyword_id}|${r.term}|${r.date_from}`);
    await upsert("ads_search_terms", [...byKey.values()], "campaign,ad_group_id,keyword_id,term,date_from,date_to,source");
    return { importId, rows: rows.length, ...count([...byKey.keys()], have) };
  }

  if (kind === "targeting") {
    const { keywords, targets } = parseTargeting(json);
    const importId = await startImport(keywords.length + targets.length);
    const all = [...keywords, ...targets];
    const uuid = await campaignIds(all);
    // bid and state only when Amazon gave them, so a missing value never blanks one already stored.
    const opt = (r: { bid: number | null; state: string | null }) => ({ ...(r.bid != null ? { bid: r.bid } : {}), ...(r.state ? { state: r.state } : {}) });
    const kwHave = await existing("ads_keywords", "keyword_id", keywords.map((k) => k.id));
    const tgHave = await existing("ads_product_targets", "target_id", targets.map((t) => t.id));
    await upsert("ads_keywords", keywords.map((k) => ({ keyword_id: k.id, campaign: uuid.get(k.campaignId)!, ad_group_id: k.adGroupId, keyword_text: k.text, match_type: k.matchType, ...opt(k), ...perfRange(k, win.from, win.to, importId), source: "api" })), "keyword_id");
    await upsert("ads_keyword_ranges", keywords.map((k) => ({ keyword_id: k.id, ...perfRange(k, win.from, win.to, importId) })), "keyword_id,date_from,date_to");
    await upsert("ads_product_targets", targets.map((t) => ({ target_id: t.id, campaign: uuid.get(t.campaignId)!, ad_group_id: t.adGroupId, expression: t.expression, ...opt(t), ...perfRange(t, win.from, win.to, importId), source: "api" })), "target_id");
    const a = count(keywords.map((k) => k.id), kwHave), b = count(targets.map((t) => t.id), tgHave);
    return { importId, rows: all.length, added: a.added + b.added, updated: a.updated + b.updated };
  }

  // advertised_products
  const rows = parseAdvertised(json);
  const importId = await startImport(rows.length);
  const uuid = await campaignIds(rows);
  // The report has no ad id: one is made from ad group, ASIN and SKU (the bulk file's ids are separate rows, unaffected).
  const ads = rows.map((r) => ({ ad_id: `api:${r.adGroupId}:${r.asin}:${r.sku ?? ""}`, campaign: uuid.get(r.campaignId)!, ad_group_id: r.adGroupId, sku: r.sku, asin: r.asin, ...perfRange(r, win.from, win.to, importId), source: "api" }));
  const have = await existing("ads_product_ads", "ad_id", ads.map((a) => a.ad_id));
  await upsert("ads_product_ads", ads, "ad_id");
  // A campaign advertising one ASIN maps to it (a name's ASIN is the fallback; a manual mapping stands unless the ads agree).
  const byCampaign = new Map<string, Set<string>>();
  for (const r of rows) byCampaign.set(r.campaignId, (byCampaign.get(r.campaignId) ?? new Set()).add(r.asin));
  for (const [campaignId, asins] of byCampaign) {
    if (asins.size !== 1) continue;
    const asin = [...asins][0], id = uuid.get(campaignId)!;
    const cur = must(await d.from("ads_campaigns").select("asin, asin_source, name").eq("id", id).single(), "campaign") as { asin: string | null; asin_source: string | null; name: string };
    if (cur.asin_source === "manual" && cur.asin !== asin) continue;
    if (cur.asin !== asin || cur.asin_source !== "product_ad") must(await d.from("ads_campaigns").update({ asin, asin_source: "product_ad" }).eq("id", id), "map campaign");
  }
  return { importId, rows: rows.length, ...count(ads.map((a) => a.ad_id), have) };
}
