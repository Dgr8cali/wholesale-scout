import "server-only";
import { asinFromName, dateFromFileName, parseReport, placementName, REPORT_LABEL, type AdsRow, type ParsedReport, type ReportType } from "../ads/parse";
import { parseBulk, type ParsedBulk, type Perf } from "../ads/bulk";
import { insightsFor, type Insights } from "./adsInsights";
import { add, breakEvenAcos, campaignTotals, chooseRanges, marginBeforeAds, profitAfterAds, ratios, termStatus, ZERO, type Range, type Totals, type UnitEconomics } from "../ads/metrics";
import { computeFees, DEFAULT_FEE_ASSUMPTIONS, referralCategoryFor } from "../fees/engine";
import { getKeepa } from "../keepa/client";
import { activeRateCard, chunks, db, must } from "./db";
import { saveSnapshot } from "./process";

/* ===================== settings ===================== */

/**
 * The Ads workspace's settings: the default target ACoS (30%), and the CPC private label's ad
 * estimate uses: £0.60 to start, then the account's trailing CPC after each import while "auto" is on.
 */
export interface AdsSettings {
  targetAcos: number; cpc: number; cpcAuto: boolean;
  /** Smoothed conversion: how many clicks of the product's conversion a keyword's own is pulled towards. */
  smoothingK: number;
  /** Listing health's CTR benchmark, %. */
  ctrBenchmark: number;
}
export const DEFAULT_ADS_SETTINGS: AdsSettings = { targetAcos: 30, cpc: 0.6, cpcAuto: true, smoothingK: 20, ctrBenchmark: 0.4 };

export async function adsSettings(): Promise<AdsSettings> {
  const res = await db().from("ads_settings").select("key, value");
  if (res.error) return DEFAULT_ADS_SETTINGS; // before the migration
  const v = Object.fromEntries((res.data as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  return { targetAcos: v.targetAcos ?? 30, cpc: v.cpc ?? 0.6, cpcAuto: (v.cpcAuto ?? 1) >= 1, smoothingK: v.smoothingK ?? 20, ctrBenchmark: v.ctrBenchmark ?? 0.4 };
}

export async function saveAdsSettings(input: Partial<AdsSettings>): Promise<AdsSettings> {
  const rows: { key: string; value: number }[] = [];
  if (input.targetAcos !== undefined) {
    const v = Number(input.targetAcos);
    if (!(v > 0 && v < 100)) throw new Error("Target ACoS must be between 0 and 100%");
    rows.push({ key: "targetAcos", value: v });
  }
  if (input.cpc !== undefined) {
    const v = Number(input.cpc);
    if (!(v > 0 && v < 20)) throw new Error("CPC must be between £0 and £20");
    rows.push({ key: "cpc", value: v });
  }
  if (input.cpcAuto !== undefined) rows.push({ key: "cpcAuto", value: input.cpcAuto ? 1 : 0 });
  if (input.smoothingK !== undefined) {
    const v = Number(input.smoothingK);
    if (!(Number.isInteger(v) && v >= 0 && v <= 500)) throw new Error("Smoothing must be a whole number of clicks, 0–500");
    rows.push({ key: "smoothingK", value: v });
  }
  if (input.ctrBenchmark !== undefined) {
    const v = Number(input.ctrBenchmark);
    if (!(v > 0 && v < 10)) throw new Error("The CTR benchmark must be between 0 and 10%");
    rows.push({ key: "ctrBenchmark", value: v });
  }
  if (rows.length) must(await db().from("ads_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "key" }), "save ads settings");
  return adsSettings();
}

/* ===================== campaigns ===================== */

interface CampaignRow {
  id: string; campaign_id: string | null; console_id: string | null; name: string; type: string | null; targeting: string | null;
  state: string | null; budget: number | null; start_date: string | null; end_date: string | null; asin: string | null; asin_source: string | null;
  bidding_strategy: string | null; archived: boolean;
}
const CAMPAIGN_COLS = "id, campaign_id, console_id, name, type, targeting, state, budget, start_date, end_date, asin, asin_source, bidding_strategy, archived";

/** Reports give a numeric ID; the Campaign Manager export a console ID ("A0…"). */
const isConsoleId = (id: string) => /[A-Za-z]/.test(id);

/**
 * The campaign each row is about, created when new. Matched by its ID (numeric or console), else by
 * its exact name (the only link between the two kinds of ID). Settings from the Campaign Manager
 * export are kept; an ASIN in the name is taken unless you've set one.
 */
async function resolveCampaigns(rows: AdsRow[]): Promise<Map<AdsRow, string>> {
  const d = db();
  const all = must(await d.from("ads_campaigns").select(CAMPAIGN_COLS), "campaigns") as CampaignRow[];
  const out = new Map<AdsRow, string>();
  const seen = new Map<string, CampaignRow>(); // by row identity within this import
  const now = new Date().toISOString();
  for (const r of rows) {
    const key = `${r.campaignId ?? ""}|${r.campaignName}`;
    let c = seen.get(key);
    if (!c) {
      const id = r.campaignId;
      c = (id && all.find((x) => (isConsoleId(id) ? x.console_id === id : x.campaign_id === id)))
        || all.find((x) => x.name.trim().toLowerCase() === r.campaignName.trim().toLowerCase())
        || undefined;
      const patch: Record<string, unknown> = { name: r.campaignName, last_seen: now };
      if (id) patch[isConsoleId(id) ? "console_id" : "campaign_id"] = id;
      for (const [k, v] of [["type", r.type], ["targeting", r.targeting], ["state", r.state], ["budget", r.budget], ["start_date", r.campaignStart], ["end_date", r.campaignEnd]] as const) if (v != null) patch[k] = v;
      const nameAsin = asinFromName(r.campaignName);
      if (c) {
        if (!c.asin && nameAsin) Object.assign(patch, { asin: nameAsin, asin_source: "name" });
        c = must(await d.from("ads_campaigns").update(patch).eq("id", c.id).select(CAMPAIGN_COLS).single(), "update campaign") as CampaignRow;
        const i = all.findIndex((x) => x.id === c!.id);
        if (i >= 0) all[i] = c;
      } else {
        c = must(await d.from("ads_campaigns").insert({ ...patch, ...(nameAsin ? { asin: nameAsin, asin_source: "name" } : {}) }).select(CAMPAIGN_COLS).single(), "add campaign") as CampaignRow;
        all.push(c);
      }
      seen.set(key, c);
    }
    out.set(r, c.id);
  }
  return out;
}

/* ===================== import ===================== */

export interface ImportSummary { file: string; type: ReportType; label: string; rows: number; dateFrom: string | null; dateTo: string | null; warnings: string[]; importId: string }

const metrics = (r: AdsRow) => ({ impressions: r.impressions, clicks: Math.round(r.clicks), cost: r.cost, orders: Math.round(r.orders), sales: r.sales, units: r.units == null ? null : Math.round(r.units) });

/** Store one parsed report. Re-importing the same rows replaces them (unique keys): never doubled. */
async function storeReport(p: ParsedReport, fileName: string): Promise<ImportSummary> {
  const d = db();
  const imp = must(await d.from("ads_imports").insert({ report_type: p.type, file_name: fileName.slice(0, 200), rows: p.rows.length, date_from: p.dateFrom, date_to: p.dateTo }).select("id").single(), "import") as { id: string };
  const camps = await resolveCampaigns(p.rows);
  const exported = dateFromFileName(fileName) ?? new Date().toISOString().slice(0, 10);
  const upsert = async (table: string, rows: Record<string, unknown>[], onConflict: string) => {
    for (const c of chunks(rows, 200)) if (c.length) must(await d.from(table).upsert(c, { onConflict }), `save ${table}`);
  };
  if (p.type === "search_term") {
    // Within one file a key appears once; across files the newer import's figures replace the older's.
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of p.rows) {
      const row = { campaign: camps.get(r)!, ad_group_id: r.adGroupId ?? "", ad_group_name: r.adGroupName, term: r.searchTerm!, date_from: r.dateFrom, date_to: r.dateTo, ...metrics(r), import_id: imp.id };
      byKey.set(`${row.campaign}|${row.ad_group_id}|${row.term}|${row.date_from}|${row.date_to}`, row);
    }
    await upsert("ads_search_terms", [...byKey.values()], "campaign,ad_group_id,term,date_from,date_to");
  } else if (p.type === "campaign_daily") {
    await upsert("ads_campaign_daily", p.rows.map((r) => ({ campaign: camps.get(r)!, date: r.dateFrom, ...metrics(r), import_id: imp.id })), "campaign,date");
  } else if (p.type === "campaign" || p.type === "campaign_grid") {
    const grid = p.type === "campaign_grid";
    await upsert("ads_campaign_ranges", p.rows.map((r) => ({
      campaign: camps.get(r)!, source: grid ? "grid" : "campaign", date_from: grid ? null : r.dateFrom, date_to: grid ? exported : r.dateTo, ...metrics(r), import_id: imp.id,
    })), "campaign,source,date_from,date_to");
  }
  else if (p.type === "placement") {
    // Daily (a Date column) or one range per row; a re-import replaces the same rows.
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of p.rows) {
      const row = { campaign: camps.get(r)!, placement: placementName(r.placement), date_from: r.dateFrom, date_to: r.dateTo, ...metrics(r), import_id: imp.id };
      byKey.set(`${row.campaign}|${row.placement}|${row.date_from}|${row.date_to}`, row);
    }
    await upsert("ads_placement_daily", [...byKey.values()], "campaign,placement,date_from,date_to");
  }
  // Keyword (targeting) reports: read and their campaigns recorded; the bulk export carries keywords.
  return { file: fileName, type: p.type, label: REPORT_LABEL[p.type], rows: p.rows.length, dateFrom: p.dateFrom, dateTo: p.dateTo, warnings: p.warnings, importId: imp.id };
}

/* ===================== bulk export (the primary import) ===================== */

export interface BulkImportSummary { file: string; label: string; rows: number; dateFrom: string; dateTo: string; warnings: string[]; importId: string; mapped: number }

const perfRow = (p: Perf, from: string, to: string, importId: string) => ({
  impressions: p.impressions == null ? null : Math.round(p.impressions), clicks: Math.round(p.clicks), cost: p.cost, orders: Math.round(p.orders), sales: p.sales,
  units: p.units == null ? null : Math.round(p.units), date_from: from, date_to: to, import_id: importId,
});

/**
 * Store a bulk export: each campaign's settings and totals over the export's range, its placements,
 * ad groups, product ads, keywords, negatives and product targeting (latest settings by Amazon's
 * ID), and search terms with the keyword that matched. A campaign whose product ads advertise one
 * ASIN is mapped to it (over a name's ASIN, never over a different one you set).
 */
export async function importBulk(data: Uint8Array, fileName: string, dateFrom?: string | null, dateTo?: string | null): Promise<BulkImportSummary> {
  const b: ParsedBulk = parseBulk(data, { fileName, dateFrom, dateTo });
  if (!b.dateFrom || !b.dateTo) throw new Error("Give the date range the bulk export was made for");
  const from = b.dateFrom, to = b.dateTo;
  const d = db();
  const rows = b.campaigns.length + b.placements.length + b.adGroups.length + b.productAds.length + b.keywords.length + b.negatives.length + b.targets.length + b.searchTerms.length;
  const imp = must(await d.from("ads_imports").insert({ report_type: "bulk", file_name: fileName.slice(0, 200), rows, date_from: from, date_to: to }).select("id").single(), "import") as { id: string };
  const now = new Date().toISOString();

  // Campaigns: by Amazon's ID, else the exact name; created when new.
  const all = must(await d.from("ads_campaigns").select(CAMPAIGN_COLS), "campaigns") as CampaignRow[];
  const uuid = new Map<string, string>();
  let mapped = 0;
  for (const c of b.campaigns) {
    const cur = all.find((x) => x.campaign_id === c.campaignId) ?? all.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    const patch: Record<string, unknown> = {
      campaign_id: c.campaignId, name: c.name, type: "Sponsored Products", targeting: c.targeting, state: c.state, budget: c.budget,
      bidding_strategy: c.biddingStrategy, portfolio_id: c.portfolioId, start_date: c.startDate, end_date: c.endDate, last_seen: now,
    };
    const adAsin = b.campaignAsins.get(c.campaignId);
    const nameAsin = asinFromName(c.name);
    // A manual mapping stands unless the product ads say the same (then they're the source).
    if (cur?.asin_source !== "manual" || (adAsin && cur.asin === adAsin)) {
      if (adAsin) { Object.assign(patch, { asin: adAsin, asin_source: "product_ad" }); mapped++; }
      else if (!cur?.asin && nameAsin) Object.assign(patch, { asin: nameAsin, asin_source: "name" });
    }
    const row = cur
      ? must(await d.from("ads_campaigns").update(patch).eq("id", cur.id).select("id").single(), "update campaign") as { id: string }
      : must(await d.from("ads_campaigns").insert(patch).select("id").single(), "add campaign") as { id: string };
    uuid.set(c.campaignId, row.id);
  }
  const camp = (id: string) => {
    const u = uuid.get(id);
    if (!u) throw new Error(`Campaign ${id} has rows but no Campaign row in the file`);
    return u;
  };
  const upsert = async (table: string, list: Record<string, unknown>[], onConflict: string) => {
    for (const c of chunks(list, 200)) if (c.length) must(await d.from(table).upsert(c, { onConflict }), `save ${table}`);
  };
  await upsert("ads_campaign_ranges", b.campaigns.map((c) => ({ campaign: camp(c.campaignId), source: "bulk", ...perfRow(c, from, to, imp.id) })), "campaign,source,date_from,date_to");
  await upsert("ads_placements", b.placements.map((p) => ({ campaign: camp(p.campaignId), placement: p.placement, percentage: p.percentage, bidding_strategy: p.biddingStrategy, ...perfRow(p, from, to, imp.id) })), "campaign,placement");
  await upsert("ads_ad_groups", b.adGroups.map((g) => ({ ad_group_id: g.adGroupId, campaign: camp(g.campaignId), name: g.name, default_bid: g.defaultBid, state: g.state, ...perfRow(g, from, to, imp.id) })), "ad_group_id");
  await upsert("ads_product_ads", b.productAds.map((a) => ({ ad_id: a.adId, campaign: camp(a.campaignId), ad_group_id: a.adGroupId, sku: a.sku, asin: a.asin, state: a.state, eligibility: a.eligibility, ...perfRow(a, from, to, imp.id) })), "ad_id");
  await upsert("ads_keywords", b.keywords.filter((k) => k.keywordId).map((k) => ({ keyword_id: k.keywordId, campaign: camp(k.campaignId), ad_group_id: k.adGroupId, keyword_text: k.text, match_type: k.matchType, bid: k.bid, state: k.state, ...perfRow(k, from, to, imp.id) })), "keyword_id");
  await upsert("ads_keyword_ranges", b.keywords.filter((k) => k.keywordId).map((k) => ({ keyword_id: k.keywordId, ...perfRow(k, from, to, imp.id) })), "keyword_id,date_from,date_to");
  await upsert("ads_negative_keywords", b.negatives.filter((k) => k.keywordId).map((k) => ({ keyword_id: k.keywordId, campaign: camp(k.campaignId), ad_group_id: k.adGroupId, keyword_text: k.text, match_type: k.matchType, state: k.state, level: k.level, import_id: imp.id })), "keyword_id");
  await upsert("ads_product_targets", b.targets.filter((t) => t.targetId).map((t) => ({ target_id: t.targetId, campaign: camp(t.campaignId), ad_group_id: t.adGroupId, expression: t.expression, bid: t.bid, state: t.state, ...perfRow(t, from, to, imp.id) })), "target_id");
  const terms = new Map<string, Record<string, unknown>>();
  for (const t of b.searchTerms) {
    const row = { campaign: camp(t.campaignId), ad_group_id: t.adGroupId, ad_group_name: t.adGroupName, keyword_id: t.keywordId ?? t.targetId ?? "", keyword_text: t.keywordText, match_type: t.matchType, term: t.term, ...perfRow(t, from, to, imp.id) };
    terms.set(`${row.campaign}|${row.ad_group_id}|${row.keyword_id}|${row.term}`, row);
  }
  await upsert("ads_search_terms", [...terms.values()], "campaign,ad_group_id,keyword_id,term,date_from,date_to");
  return { file: fileName, label: b.label, rows, dateFrom: from, dateTo: to, warnings: b.warnings, importId: imp.id, mapped };
}

/** After any import: drop superseded import records and follow the account's CPC (when auto). */
async function afterImport(importIds: string[]): Promise<number | null> {
  if (!importIds.length) return null;
  await dropSupersededImports(importIds);
  const s = await adsSettings();
  const trailing = await trailingCpc();
  if (s.cpcAuto && trailing != null) { await saveAdsSettings({ cpc: Math.round(trailing * 100) / 100 }); return trailing; }
  return null;
}

export async function importBulkFile(data: Uint8Array, fileName: string, dateFrom?: string | null, dateTo?: string | null) {
  const summary = await importBulk(data, fileName, dateFrom, dateTo);
  return { imported: summary, cpc: await afterImport([summary.importId]) };
}

/** Import several exported files; afterwards the CPC estimate follows the account's (when auto). */
export async function importReports(files: { name: string; text: string }[]): Promise<{ imported: ImportSummary[]; errors: { file: string; error: string }[]; cpc: number | null }> {
  const imported: ImportSummary[] = [];
  const errors: { file: string; error: string }[] = [];
  for (const f of files) {
    try {
      imported.push(await storeReport(parseReport(f.text, f.name), f.name));
    } catch (e) {
      errors.push({ file: f.name, error: (e as Error).message });
    }
  }
  return { imported, errors, cpc: await afterImport(imported.map((i) => i.importId)) };
}

/**
 * Imports that no longer own a row (the same data was imported again, and the newer import's rows
 * replaced theirs) leave the list: an import listed can always be undone. Keyword and placement
 * imports keep their record (their rows come with Phase 2).
 */
async function dropSupersededImports(keep: string[]) {
  const d = db();
  const owned = new Set<string>();
  for (const t of ["ads_campaign_ranges", "ads_campaign_daily", "ads_search_terms", "ads_placements", "ads_ad_groups", "ads_product_ads", "ads_keywords", "ads_negative_keywords", "ads_product_targets", "ads_keyword_ranges", "ads_placement_daily"]) {
    const rows = must(await d.from(t).select("import_id"), t) as { import_id: string | null }[];
    for (const r of rows) if (r.import_id) owned.add(r.import_id);
  }
  const all = must(await d.from("ads_imports").select("id, report_type"), "imports") as { id: string; report_type: string }[];
  const orphans = all.filter((i) => !owned.has(i.id) && !keep.includes(i.id) && !["keyword"].includes(i.report_type)).map((i) => i.id);
  for (const c of chunks(orphans)) must(await d.from("ads_imports").delete().in("id", c), "drop superseded imports");
}

export async function listImports() {
  return must(await db().from("ads_imports").select("id, report_type, file_name, rows, date_from, date_to, imported_at").order("imported_at", { ascending: false }).limit(100), "imports") as
    { id: string; report_type: ReportType | "bulk"; file_name: string; rows: number; date_from: string | null; date_to: string | null; imported_at: string }[];
}

/** Undo an import: the rows it last wrote go with it. */
export async function deleteImport(id: string) {
  must(await db().from("ads_imports").delete().eq("id", id), "delete import");
}

/* ===================== reading it back ===================== */

const n = (v: unknown) => (v == null ? null : Number(v));
const toTotals = (r: Record<string, unknown>): Totals => ({ impressions: n(r.impressions), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), sales: Number(r.sales), units: n(r.units) });

export async function loadAll() {
  const d = db();
  const [camps, ranges, daily, terms] = await Promise.all([
    d.from("ads_campaigns").select(CAMPAIGN_COLS),
    d.from("ads_campaign_ranges").select("campaign, source, date_from, date_to, impressions, clicks, cost, orders, sales, units"),
    d.from("ads_campaign_daily").select("campaign, date, impressions, clicks, cost, orders, sales, units"),
    d.from("ads_search_terms").select("campaign, ad_group_id, ad_group_name, keyword_id, keyword_text, match_type, term, date_from, date_to, impressions, clicks, cost, orders, sales, units"),
  ]);
  // Archived campaigns (old tests you don't care about) are left out of everything that reads this.
  const active = (must(camps, "campaigns") as CampaignRow[]).filter((c) => !c.archived);
  const ids = new Set(active.map((c) => c.id));
  const mine = (rows: Record<string, unknown>[]) => rows.filter((r) => ids.has(r.campaign as string));
  return {
    campaigns: active,
    ranges: mine(must(ranges, "ranges") as Record<string, unknown>[]),
    daily: mine(must(daily, "daily") as Record<string, unknown>[]),
    terms: countedTerms(mine(must(terms, "search terms") as Record<string, unknown>[])),
  };
}

/**
 * The search-term rows to count: per campaign, the ranges chosen widest first without overlaps
 * (a bulk export and a search term report over overlapping weeks aren't added), with every row in a
 * chosen range. On equal dates, the rows that name the matching keyword win.
 */
function countedTerms(rows: Record<string, unknown>[]) {
  const byCampaign = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) byCampaign.set(r.campaign as string, [...(byCampaign.get(r.campaign as string) ?? []), r]);
  const out: Record<string, unknown>[] = [];
  for (const list of byCampaign.values()) {
    const ranges = new Map<string, { from: string; to: string; rank: number; key: string }>();
    for (const r of list) {
      const rank = r.keyword_id ? 1 : 0;
      const key = `${r.date_from}|${r.date_to}|${rank}`;
      ranges.set(key, { from: r.date_from as string, to: r.date_to as string, rank, key });
    }
    const keep = new Set(chooseRanges([...ranges.values()]).map((r) => r.key));
    out.push(...list.filter((r) => keep.has(`${r.date_from}|${r.date_to}|${r.keyword_id ? 1 : 0}`)));
  }
  return out;
}

/** Each campaign's totals from its best source (see campaignTotals). */
function campaignFigures(all: Awaited<ReturnType<typeof loadAll>>) {
  return all.campaigns.map((c) => {
    const mine = (rows: Record<string, unknown>[]) => rows.filter((r) => r.campaign === c.id);
    const ranges: Range[] = mine(all.ranges).filter((r) => r.source === "campaign" || r.source === "bulk").map((r) => ({ ...toTotals(r), dateFrom: r.date_from as string, dateTo: r.date_to as string, source: r.source as Range["source"] }));
    const gridRow = mine(all.ranges).find((r) => r.source === "grid");
    const grid: Range | null = gridRow ? { ...toTotals(gridRow), dateFrom: null, dateTo: gridRow.date_to as string, source: "grid" } : null;
    const daily: Range[] = mine(all.daily).map((r) => ({ ...toTotals(r), dateFrom: r.date as string, dateTo: r.date as string, source: "campaign_daily" }));
    const termRows = mine(all.terms);
    const terms = termRows.length ? termRows.reduce<Totals>((a, r) => add(a, toTotals(r)), ZERO) : null;
    // Units: reports other than the search term one don't give them; the terms' units stand in.
    const picked = campaignTotals({ daily, ranges, grid, terms });
    const totals = picked ? { ...picked.totals, units: picked.totals.units ?? terms?.units ?? null } : null;
    return { campaign: c, totals, source: picked?.source ?? null, from: picked?.from ?? null, to: picked?.to ?? null };
  });
}

/** The account's CPC over the last 60 days of data (or all of it when older): spend ÷ clicks. */
export async function trailingCpc(): Promise<number | null> {
  // Dated figures only: the Campaign Manager export's range is unknown (a 2024 campaign would look recent).
  const figs = campaignFigures(await loadAll()).filter((f) => f.totals && f.source !== "grid" && f.from);
  if (!figs.length) return null;
  const latest = figs.map((f) => f.to).filter((x): x is string => !!x).sort().at(-1);
  const cutoff = latest ? new Date(Date.parse(latest) - 60 * 86_400_000).toISOString().slice(0, 10) : null;
  const recent = figs.filter((f) => !cutoff || !f.to || f.to >= cutoff);
  const t = (recent.length ? recent : figs).reduce<Totals>((a, f) => add(a, f.totals!), ZERO);
  return t.clicks ? t.cost / t.clicks : null;
}

/* ===================== economics ===================== */

export interface AdsProduct {
  asin: string; title: string | null; price: number | null; landed_cost: number | null; referral_category: string | null;
  weight_g: number | null; dims: { l: number; w: number; h: number } | null; fba_fee: number | null; phase: "launch" | "steady";
  image?: string | null;
  /** Optimise for ACoS (default) or TACoS, with the target TACoS (%). */
  optimise?: "acos" | "tacos"; target_tacos?: number | null;
  pl_candidate_id?: string | null;
}

export interface AsinEconomics extends UnitEconomics {
  /** Where the price came from: you, Keepa's Buy Box, or the ads' average sale price (sales ÷ units). */
  priceSource: "manual" | "keepa" | "ads" | null;
  referralCategory: string;
  referral: number | null; fba: number | null; storage: number | null; returns: number | null;
  sizeKnown: boolean;
  margin: number | null;
  breakEvenAcos: number | null;
  /** What's missing for break-even and profit. */
  needs: string[];
}

/**
 * A product's unit economics: price (yours, else Keepa's Buy Box, else the ads' average sale price),
 * the fee engine's fees on the active rate card (referral, FBA by size, storage, returns; VAT and
 * DSF in) and your landed cost. Break-even ACoS = margin before ads ÷ price.
 */
async function economics(p: AdsProduct | undefined, asin: string, adsAvgPrice: number | null): Promise<AsinEconomics> {
  const card = await activeRateCard();
  const snap = (must(await db().from("keepa_snapshots").select("summary, package").eq("asin", asin).order("fetched_at", { ascending: false }).limit(1), "snapshot") as { summary: { currentBuyBox?: number | null; rootCategory?: string | null } | null; package: { l?: number; w?: number; h?: number; weight_g?: number } | null }[])[0];
  const price = p?.price ?? snap?.summary?.currentBuyBox ?? adsAvgPrice;
  const priceSource = p?.price != null ? "manual" : snap?.summary?.currentBuyBox != null ? "keepa" : adsAvgPrice != null ? "ads" : null;
  const dims = p?.dims ?? (snap?.package?.l ? { l: snap.package.l!, w: snap.package.w!, h: snap.package.h! } : null);
  const weightG = p?.weight_g ?? snap?.package?.weight_g ?? null;
  const referralCategory = p?.referral_category ?? referralCategoryFor(snap?.summary?.rootCategory ?? null, card);
  const needs: string[] = [];
  if (price == null) needs.push("a price");
  if (p?.landed_cost == null) needs.push("your landed cost");
  if (!dims || weightG == null) needs.push("the package size and weight (for the FBA fee)");
  if (price == null) return { price: 0, fees: null, landed: p?.landed_cost ?? null, priceSource, referralCategory, referral: null, fba: null, storage: null, returns: null, sizeKnown: false, margin: null, breakEvenAcos: null, needs };
  const fees = computeFees(price, { referralCategory, dimsCm: dims, weightG }, card, DEFAULT_FEE_ASSUMPTIONS);
  const mult = fees.feeMultiplier;
  const fba = p?.fba_fee != null ? p.fba_fee * mult : dims && weightG != null ? fees.fba : null;
  const total = fba == null ? null : fees.referral + fba + fees.storage + fees.returns;
  const e: UnitEconomics = { price, fees: total, landed: p?.landed_cost ?? null };
  return {
    ...e, priceSource, referralCategory, referral: fees.referral, fba, storage: fees.storage, returns: fees.returns,
    sizeKnown: !!dims && weightG != null, margin: marginBeforeAds(e), breakEvenAcos: breakEvenAcos(e), needs,
  };
}

/* ===================== the dashboard ===================== */

/** `lookAsins`: more products to find a title and image for (launches with no campaigns yet). */
export async function adsDashboard(lookAsins: string[] = []) {
  const all = await loadAll();
  const settings = await adsSettings();
  const figs = campaignFigures(all);
  const [products, targets, placementsRes, adsRes, kwRes, negRes] = await Promise.all([
    db().from("ads_products").select("asin, title, image, price, landed_cost, referral_category, weight_g, dims, fba_fee, phase, pl_candidate_id, optimise, target_tacos"),
    db().from("ads_targets").select("asin, target_acos_launch, target_acos_steady"),
    db().from("ads_placements").select("campaign, placement, percentage, date_from, date_to, impressions, clicks, cost, orders, sales, units"),
    db().from("ads_product_ads").select("campaign, sku, asin, state"),
    db().from("ads_keywords").select("campaign, state"),
    db().from("ads_negative_keywords").select("campaign"),
  ]);
  const placementRows = must(placementsRes, "placements") as Record<string, unknown>[];
  const productAds = must(adsRes, "product ads") as { campaign: string; sku: string | null; asin: string | null; state: string | null }[];
  const keywordRows = must(kwRes, "keywords") as { campaign: string; state: string | null }[];
  const negativeRows = must(negRes, "negative keywords") as { campaign: string }[];
  const PLACEMENT_ORDER = ["top", "rest of search", "product page", "amazon business"];
  const prod = new Map((must(products, "ads products") as AdsProduct[]).map((p) => [p.asin, { ...p, price: n(p.price), landed_cost: n(p.landed_cost), fba_fee: n(p.fba_fee) }]));
  const tgt = new Map((must(targets, "ads targets") as { asin: string; target_acos_launch: number | null; target_acos_steady: number | null }[]).map((t) => [t.asin, t]));
  const targetFor = (asin: string | null) => {
    const p = asin ? prod.get(asin) : undefined;
    const t = asin ? tgt.get(asin) : undefined;
    const phase = p?.phase ?? "launch";
    const v = phase === "steady" ? t?.target_acos_steady : t?.target_acos_launch;
    return { phase, target: (v != null ? Number(v) : settings.targetAcos) / 100 };
  };

  // Per ASIN.
  const asins = [...new Set(all.campaigns.map((c) => c.asin).filter((x): x is string => !!x))];
  const asinRows: {
    asin: string; title: string | null; campaigns: number; totals: Totals; ratios: ReturnType<typeof ratios>; economics: AsinEconomics;
    phase: "launch" | "steady"; targetAcos: number; profitAfterAds: ReturnType<typeof profitAfterAds>; from: string | null; to: string | null;
    /** TACoS, organic share, TACoS mode and listing health. */
    insights?: Insights;
  }[] = [];
  const econByAsin = new Map<string, AsinEconomics>();
  for (const asin of asins) {
    const mine = figs.filter((f) => f.campaign.asin === asin && f.totals);
    const t = mine.reduce<Totals>((a, f) => add(a, f.totals!), ZERO);
    const avg = t.units ? t.sales / t.units : t.orders ? t.sales / t.orders : null;
    const e = await economics(prod.get(asin), asin, avg != null ? Math.round(avg * 100) / 100 : null);
    econByAsin.set(asin, e);
    const { phase, target } = targetFor(asin);
    asinRows.push({
      asin, title: prod.get(asin)?.title ?? null, campaigns: mine.length, totals: t, ratios: ratios(t), economics: e, phase, targetAcos: target,
      profitAfterAds: profitAfterAds(t, e),
      from: mine.map((f) => f.from).filter(Boolean).sort()[0] ?? null, to: mine.map((f) => f.to).filter(Boolean).sort().at(-1) ?? null,
    });
  }

  // Beyond ACoS: the sales split, TACoS mode's target and listing health. In TACoS mode the product's
  // ACoS target is the one its TACoS target allows, so the chips and the rules follow it.
  const insights = await insightsFor(asinRows, {
    daily: (all.daily as Record<string, unknown>[]).map((r) => ({ campaign: r.campaign as string, date: r.date as string, impressions: n(r.impressions), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), sales: Number(r.sales) })),
    campaignAsin: new Map(all.campaigns.map((c) => [c.id, c.asin])), products: prod, ctrBenchmark: settings.ctrBenchmark / 100,
  });
  for (const r of asinRows) {
    const i = insights[r.asin];
    r.insights = i;
    if (i?.acosForTacos) r.targetAcos = i.acosForTacos.acos;
  }
  const effectiveTarget = (asin: string | null) => (asin ? asinRows.find((r) => r.asin === asin)?.targetAcos ?? targetFor(asin).target : targetFor(asin).target);

  // Per campaign.
  const campaigns = figs.map((f) => {
    const e = f.campaign.asin ? econByAsin.get(f.campaign.asin) : undefined;
    const placements = placementRows.filter((p) => p.campaign === f.campaign.id).map((p) => {
      const t = toTotals(p);
      return { placement: p.placement as string, percentage: n(p.percentage), totals: t, ratios: ratios(t), from: p.date_from as string | null, to: p.date_to as string | null };
    }).sort((a, b) => PLACEMENT_ORDER.indexOf(a.placement.toLowerCase()) - PLACEMENT_ORDER.indexOf(b.placement.toLowerCase()));
    const advertised = [...new Set(productAds.filter((a) => a.campaign === f.campaign.id && a.asin).map((a) => a.asin!))];
    return {
      ...f.campaign, totals: f.totals, ratios: f.totals ? ratios(f.totals) : null, source: f.source, from: f.from, to: f.to, placements, advertised,
      keywords: keywordRows.filter((k) => k.campaign === f.campaign.id).length, negatives: negativeRows.filter((k) => k.campaign === f.campaign.id).length,
      breakEvenAcos: e?.breakEvenAcos ?? null, targetAcos: effectiveTarget(f.campaign.asin),
      profitAfterAds: f.totals && e ? profitAfterAds(f.totals, e) : null,
    };
  }).sort((a, b) => (b.totals?.cost ?? 0) - (a.totals?.cost ?? 0));

  // Search terms: per campaign and term, over every range imported.
  // Each term lists the keywords that matched it (from bulk exports), with their clicks and spend.
  type Matched = { text: string; matchType: string | null; clicks: number; cost: number; orders: number };
  const byTerm = new Map<string, { campaign: string; term: string; totals: Totals; from: string; to: string; matched: Matched[] }>();
  for (const r of all.terms) {
    const k = `${r.campaign}|${r.term}`;
    const cur = byTerm.get(k);
    const t = toTotals(r);
    const m: Matched[] = r.keyword_text ? [{ text: r.keyword_text as string, matchType: (r.match_type as string | null) ?? null, clicks: t.clicks, cost: t.cost, orders: t.orders }] : [];
    if (cur) Object.assign(cur, { totals: add(cur.totals, t), from: [cur.from, r.date_from as string].sort()[0], to: [cur.to, r.date_to as string].sort()[1], matched: [...cur.matched, ...m] });
    else byTerm.set(k, { campaign: r.campaign as string, term: r.term as string, totals: t, from: r.date_from as string, to: r.date_to as string, matched: m });
  }
  for (const x of byTerm.values()) x.matched.sort((a, b) => b.cost - a.cost);
  const campById = new Map(all.campaigns.map((c) => [c.id, c]));
  const terms = [...byTerm.values()].map((x) => {
    const c = campById.get(x.campaign)!;
    const e = c.asin ? econByAsin.get(c.asin) : undefined;
    const { target } = targetFor(c.asin);
    const s = termStatus(x.totals, target, e?.price ?? null);
    return { ...x, campaignName: c.name, asin: c.asin, ratios: ratios(x.totals), status: s.status, why: s.why, breakEvenAcos: e?.breakEvenAcos ?? null, targetAcos: target };
  }).sort((a, b) => b.totals.cost - a.totals.cost);

  // Each product's title and image: the Ads product, else the app's other records (free).
  const lookFor = [...new Set([...asins, ...lookAsins])];
  const [extraProds, wholesale, hunted, archived] = await Promise.all([
    db().from("ads_products").select("asin, title, image, pl_candidate_id").in("asin", lookFor.length ? lookFor : [""]),
    db().from("products").select("asin, title, image_url").in("asin", lookFor.length ? lookFor : [""]),
    db().from("pl_hunt_asins").select("asin, title, image").in("asin", lookFor.length ? lookFor : [""]),
    db().from("ads_campaigns").select("id, name, campaign_id, state").eq("archived", true).order("name"),
  ]);
  const looks: Record<string, { title: string | null; image: string | null; candidate?: string | null }> = {};
  for (const asin of lookFor) {
    const p = (prod.get(asin) ?? (extraProds.data as { asin: string; title: string | null; image: string | null }[] | null)?.find((x) => x.asin === asin)) as { title: string | null; image?: string | null; pl_candidate_id?: string | null } | undefined;
    const w = (wholesale.data as { asin: string; title: string | null; image_url: string | null }[] | null)?.find((x) => x.asin === asin);
    const h = (hunted.data as { asin: string; title: string | null; image: string | null }[] | null)?.find((x) => x.asin === asin);
    looks[asin] = { title: p?.title ?? w?.title ?? h?.title ?? null, image: p?.image ?? w?.image_url ?? h?.image ?? null, candidate: p?.pl_candidate_id ?? null };
  }
  return { settings, asins: asinRows, campaigns, terms, imports: (await listImports()).length, looks, archived: (archived.data ?? []) as { id: string; name: string; campaign_id: string | null; state: string | null }[] };
}

/* ===================== edits ===================== */

const isAsin = (s: unknown): s is string => typeof s === "string" && /^[A-Z0-9]{10}$/.test(s);

/** The ASIN a campaign advertises (null clears it, and a name's ASIN isn't taken again). */
export async function setCampaignAsin(id: string, asin: string | null) {
  if (asin != null && !isAsin(asin)) throw new Error("An ASIN is 10 letters and digits");
  must(await db().from("ads_campaigns").update({ asin, asin_source: asin ? "manual" : null }).eq("id", id), "set campaign ASIN");
}

/** Archive a campaign you don't care about (hidden from the dashboard and the rules), or bring it back. */
export async function setCampaignArchived(id: string, archived: boolean) {
  must(await db().from("ads_campaigns").update({ archived }).eq("id", id), "archive campaign");
}

export interface ProductMatch { asin: string; title: string | null; image: string | null; source: string }

/**
 * Products to assign a campaign to: by ASIN, or by words in the title, across the Ads products,
 * the app's wholesale products, private-label hunt snapshots and Keepa snapshots. Free: no Keepa call.
 */
export async function searchProducts(q: string): Promise<ProductMatch[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const d = db();
  const asin = /^[A-Z0-9]{10}$/i.test(term) ? term.toUpperCase() : null;
  // Words that start with what was typed ("pill" finds "Pill Box", not "Capillary").
  const w = term.replace(/[%_,()]/g, "");
  const words = `title.ilike.${w}%,title.ilike.% ${w}%`;
  const [ads, wholesale, hunted, snaps] = await Promise.all([
    asin ? d.from("ads_products").select("asin, title, image").eq("asin", asin) : d.from("ads_products").select("asin, title, image").or(words).not("asin", "is", null).limit(10),
    asin ? d.from("products").select("asin, title, image_url").eq("asin", asin) : d.from("products").select("asin, title, image_url").or(words).not("asin", "is", null).limit(10),
    asin ? d.from("pl_hunt_asins").select("asin, title, image").eq("asin", asin) : d.from("pl_hunt_asins").select("asin, title, image").or(words).not("asin", "is", null).limit(10),
    asin ? d.from("keepa_snapshots").select("asin").eq("asin", asin).limit(1) : Promise.resolve({ data: [] as { asin: string }[], error: null }),
  ]);
  const out = new Map<string, ProductMatch>();
  const add = (rows: unknown, src: string, img: string) => {
    for (const r of (rows ?? []) as Record<string, string | null>[]) {
      if (!r.asin) continue;
      const cur = out.get(r.asin!);
      out.set(r.asin!, { asin: r.asin!, title: cur?.title ?? r.title ?? null, image: cur?.image ?? r[img] ?? null, source: cur?.source ?? src });
    }
  };
  add(ads.data, "Ads products", "image");
  add(wholesale.data, "Wholesale products", "image_url");
  add(hunted.data, "Niche Hunt", "image");
  for (const r of (snaps.data ?? []) as { asin: string }[]) if (!out.has(r.asin)) out.set(r.asin, { asin: r.asin, title: null, image: null, source: "Keepa cache" });
  return [...out.values()].slice(0, 12);
}

export async function saveAdsProduct(asin: string, patch: Partial<Omit<AdsProduct, "asin">>) {
  if (!isAsin(asin)) throw new Error("An ASIN is 10 letters and digits");
  const row: Record<string, unknown> = { asin, updated_at: new Date().toISOString() };
  for (const k of ["title", "image", "price", "landed_cost", "referral_category", "weight_g", "dims", "fba_fee", "phase"] as const) if (patch[k] !== undefined) row[k] = patch[k];
  if (patch.optimise !== undefined) {
    if (!["acos", "tacos"].includes(String(patch.optimise))) throw new Error("Optimise for acos or tacos");
    row.optimise = patch.optimise;
  }
  if (patch.target_tacos !== undefined) {
    const v = patch.target_tacos == null || (patch.target_tacos as unknown) === "" ? null : Number(patch.target_tacos);
    if (v != null && !(v > 0 && v < 100)) throw new Error("Target TACoS must be between 0 and 100%");
    row.target_tacos = v;
  }
  must(await db().from("ads_products").upsert(row, { onConflict: "asin" }), "save product");
}

export async function saveAdsTarget(asin: string, launch: number | null, steady: number | null) {
  if (!isAsin(asin)) throw new Error("An ASIN is 10 letters and digits");
  for (const v of [launch, steady]) if (v != null && !(v > 0 && v < 100)) throw new Error("Target ACoS must be between 0 and 100%");
  must(await db().from("ads_targets").upsert({ asin, target_acos_launch: launch, target_acos_steady: steady, updated_at: new Date().toISOString() }, { onConflict: "asin" }), "save target");
}

/** The product's title, size and weight from Keepa (1 token, history only), for its FBA fee. */
export async function fetchAdsProductFromKeepa(asin: string): Promise<{ tokensUsed: number; found: boolean }> {
  if (!isAsin(asin)) throw new Error("An ASIN is 10 letters and digits");
  const keepa = getKeepa();
  if (!keepa.available) throw new Error("Keepa isn't set up (KEEPA_API_KEY)");
  const r = await keepa.lookupByAsins([asin], undefined, { buyBox: false });
  const k = r.byAsin.get(asin);
  if (!k) return { tokensUsed: r.tokensUsed, found: false };
  await saveSnapshot(k).catch(() => {});
  const cur = (must(await db().from("ads_products").select("title, image, weight_g, dims").eq("asin", asin), "product") as { title: string | null; image: string | null; weight_g: number | null; dims: unknown }[])[0];
  await saveAdsProduct(asin, {
    ...(cur?.title ? {} : { title: k.title }),
    ...(cur?.image ? {} : { image: k.imageUrl }),
    ...(cur?.weight_g != null ? {} : { weight_g: k.weightG }),
    ...(cur?.dims ? {} : { dims: k.dimsCm }),
  });
  return { tokensUsed: r.tokensUsed, found: true };
}
