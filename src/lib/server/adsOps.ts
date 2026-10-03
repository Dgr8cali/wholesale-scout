import "server-only";
import { bulkRows, describeChange, type BulkChange } from "../ads/bulk";
import { buildLaunch, type LaunchInput } from "../ads/launch";
import { diffSnapshot, restoresFor, revertChanges, takeSnapshot, type EntityState, type Snapshot } from "../ads/snapshot";
import { SpApiError, getSpApi } from "../spapi/client";
import { priorConversion } from "../ads/smooth";
import { adsDashboard, adsSettings, saveAdsProduct } from "./ads";
import { keywordBank, listsByAsin } from "./adsKeywords";
import { stockByAsinAllBuckets } from "./stock";
import { syncStock } from "./amazonSync";
import { chunks, db, must } from "./db";

const n = (v: unknown) => (v == null ? null : Number(v));
const DAY = 86_400_000;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/* ===================== the account as imported ===================== */

/** Every campaign, ad group, keyword, target, placement and negative by Amazon's IDs, from the latest import. */
export async function entityState(): Promise<EntityState> {
  const d = db();
  const [camps, groups, kws, tgs, pls, negs] = await Promise.all([
    d.from("ads_campaigns").select("id, campaign_id, name, budget, state, bidding_strategy").not("campaign_id", "is", null),
    d.from("ads_ad_groups").select("campaign, ad_group_id, default_bid, state"),
    d.from("ads_keywords").select("campaign, ad_group_id, keyword_id, keyword_text, match_type, bid, state"),
    d.from("ads_product_targets").select("campaign, ad_group_id, target_id, expression, bid, state"),
    d.from("ads_placements").select("campaign, placement, percentage"),
    d.from("ads_negative_keywords").select("campaign, ad_group_id, keyword_id, keyword_text, match_type, state"),
  ]);
  const c = must(camps, "campaigns") as { id: string; campaign_id: string; name: string; budget: number | null; state: string | null; bidding_strategy: string | null }[];
  const cid = new Map(c.map((x) => [x.id, x.campaign_id]));
  const rows = (r: { data: unknown; error: { message: string } | null }, what: string) => (must(r as never, what) as Record<string, unknown>[]).filter((x) => cid.has(x.campaign as string));
  return {
    campaigns: c.map((x) => ({ campaignId: x.campaign_id, name: x.name, budget: n(x.budget), state: x.state, biddingStrategy: x.bidding_strategy })),
    adGroups: rows(groups, "ad groups").map((x) => ({ campaignId: cid.get(x.campaign as string)!, adGroupId: x.ad_group_id as string, defaultBid: n(x.default_bid), state: x.state as string | null })),
    keywords: rows(kws, "keywords").map((x) => ({ campaignId: cid.get(x.campaign as string)!, adGroupId: x.ad_group_id as string, keywordId: x.keyword_id as string, text: x.keyword_text as string, matchType: x.match_type as string, bid: n(x.bid), state: x.state as string | null })),
    targets: rows(tgs, "targets").map((x) => ({ campaignId: cid.get(x.campaign as string)!, adGroupId: x.ad_group_id as string, targetId: x.target_id as string, expression: (x.expression as string) ?? "", bid: n(x.bid), state: x.state as string | null })),
    placements: rows(pls, "placements").map((x) => ({ campaignId: cid.get(x.campaign as string)!, placement: x.placement as string, percentage: n(x.percentage) })),
    negatives: rows(negs, "negatives").map((x) => ({ campaignId: cid.get(x.campaign as string)!, adGroupId: x.ad_group_id as string | null, keywordId: x.keyword_id as string, text: x.keyword_text as string, matchType: x.match_type as string, state: x.state as string | null })),
  };
}

/* ===================== batches ===================== */

export type BatchKind = "proposals" | "revert" | "restore" | "launch";

/** A bulk sheet: its changes, the values its updates replace (for reverting it), and notes. */
export async function createBatch(kind: BatchKind, changes: BulkChange[], opts: { before?: BulkChange[]; notes?: string[]; reverts?: string | null; proposals?: number } = {}) {
  const d = db();
  const day = today();
  const sameDay = must(await d.from("ads_export_batches").select("id").gte("created_at", `${day}T00:00:00Z`), "batches") as { id: string }[];
  const label = `${day} #${sameDay.length + 1}`;
  const before = opts.before ?? restoresFor(changes, await entityState()).restores;
  const row = must(await d.from("ads_export_batches").insert({
    kind, label, changes, before, notes: opts.notes ?? [], reverts: opts.reverts ?? null, proposals: opts.proposals ?? 0, rows: changes.flatMap(bulkRows).length,
  }).select("id, label, rows").single(), "batch") as { id: string; label: string; rows: number };
  return row;
}

/** Undo a batch: its saved values back, what it created paused (keywords, campaigns) or archived (negatives). */
export async function revertBatch(id: string) {
  const b = must(await db().from("ads_export_batches").select("id, label, changes, before").eq("id", id).maybeSingle(), "batch") as { id: string; label: string; changes: BulkChange[]; before: BulkChange[] } | null;
  if (!b) throw new Error("No such batch");
  const state = await entityState();
  const r = revertChanges(b.changes, b.before ?? [], state);
  if (!r.changes.length) throw new Error(r.unresolved.length ? r.unresolved.join(". ") : "Nothing to revert");
  return { ...(await createBatch("revert", r.changes, { before: restoresFor(r.changes, state).restores, notes: [`Reverts ${b.label}`, ...r.unresolved], reverts: b.id })), unresolved: r.unresolved };
}

/* ===================== snapshots ===================== */

const KEEP_SNAPSHOTS = 20;

export async function takeSnapshotNow(label: string) {
  const s = takeSnapshot(await entityState());
  const counts = { campaigns: s.campaigns.length, adGroups: s.adGroups.length, keywords: s.keywords.length, targets: s.targets.length, placements: s.placements.length };
  const row = must(await db().from("ads_snapshots").insert({ label: label.trim().slice(0, 120) || `Snapshot ${today()}`, state: s, counts }).select("id, label, created_at, counts").single(), "snapshot");
  const all = must(await db().from("ads_snapshots").select("id").order("created_at", { ascending: false }), "snapshots") as { id: string }[];
  const old = all.slice(KEEP_SNAPSHOTS).map((x) => x.id);
  for (const c of chunks(old)) if (c.length) must(await db().from("ads_snapshots").delete().in("id", c), "prune snapshots");
  return row;
}

export async function listSnapshots() {
  return must(await db().from("ads_snapshots").select("id, label, created_at, counts").order("created_at", { ascending: false }), "snapshots") as { id: string; label: string; created_at: string; counts: Record<string, number> }[];
}

/** The bulk sheet that takes the account (as last imported) back to a snapshot. */
export async function restoreSnapshot(id: string) {
  const s = must(await db().from("ads_snapshots").select("label, state").eq("id", id).maybeSingle(), "snapshot") as { label: string; state: Snapshot } | null;
  if (!s) throw new Error("No such snapshot");
  const state = await entityState();
  const changes = diffSnapshot(s.state, state);
  if (!changes.length) throw new Error(`Nothing differs from "${s.label}" in the data last imported`);
  return createBatch("restore", changes, { before: restoresFor(changes, state).restores, notes: [`Restores snapshot "${s.label}"`] });
}

/* ===================== FBA stock and days of cover ===================== */

export interface Stock {
  fulfillable: number; inbound: number;
  /** Your own stock (Stock workspace): self-ship and TikTok FBT. */
  home: number; tiktok_fbt: number;
  /** FBA + self-ship + TikTok: what days of cover counts. */
  total: number;
  unitsPerDay: number | null; daysOfCover: number | null; source: string; updatedAt: string | null;
}
/** "No end": stock and no sales. */
export const NO_END = 9999;

/**
 * Stock per ASIN across every bucket: Amazon's FBA inventory (synced nightly with the orders and
 * on demand) plus your own self-ship and TikTok stock (the Stock workspace), and days of cover =
 * that total ÷ units a day over the last 14 days. Units come from the orders sync when it ran in
 * the last two days (it includes ad sales), plus the sales recorded in Stock; else from the ads'
 * own units over the imported range, and the source says so.
 */
export async function stockByAsin(asins: string[], adsUnitsPerDay: Map<string, number | null>): Promise<Record<string, Stock>> {
  if (!asins.length) return {};
  const d = db();
  const since = new Date(Date.now() - 14 * DAY).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const [own, ownSales] = await Promise.all([stockByAsinAllBuckets(asins), stockSalesByAsin(asins, since)]);
  const [inv, sales, sync] = await Promise.all([
    d.from("amazon_inventory").select("asin, fulfillable, inbound, updated_at").in("asin", asins),
    d.from("amazon_sales").select("asin, units").in("asin", asins).eq("channel", "Amazon").gte("day", since),
    d.from("amazon_sync").select("finished_at").eq("id", 1).maybeSingle(),
  ]);
  if (inv.error) return {};
  const synced = (sync.data as { finished_at: string | null } | null)?.finished_at ?? null;
  const salesCurrent = !!synced && Date.now() - Date.parse(synced) < 2 * DAY && !sales.error;
  const out: Record<string, Stock> = {};
  for (const asin of asins) {
    const rows = (inv.data as { asin: string; fulfillable: number; inbound: number; updated_at: string }[]).filter((r) => r.asin === asin);
    const mine = own.get(asin) ?? { home: 0, tiktok_fbt: 0 };
    if (!rows.length && !own.has(asin)) continue;
    const fulfillable = rows.reduce((a, r) => a + Number(r.fulfillable), 0);
    const total = fulfillable + Math.max(0, mine.home) + Math.max(0, mine.tiktok_fbt);
    let unitsPerDay: number | null, source: string;
    if (salesCurrent) {
      unitsPerDay = ((sales.data as { asin: string; units: number }[]).filter((s) => s.asin === asin).reduce((a, s) => a + Number(s.units), 0) + (ownSales.get(asin) ?? 0)) / 14;
      source = ownSales.get(asin) ? "Amazon orders and Stock's other sales, last 14 days" : "Amazon orders, last 14 days";
    } else {
      unitsPerDay = adsUnitsPerDay.get(asin) ?? null;
      source = "ads units only: no current orders data";
    }
    const daysOfCover = unitsPerDay && unitsPerDay > 0 ? total / unitsPerDay : total === 0 ? 0 : NO_END;
    out[asin] = { fulfillable, inbound: rows.reduce((a, r) => a + Number(r.inbound), 0), home: mine.home, tiktok_fbt: mine.tiktok_fbt, total, unitsPerDay, daysOfCover, source, updatedAt: rows[0]?.updated_at ?? null };
  }
  return out;
}

/** Units sold outside Amazon (Stock → Sales) per ASIN since a day. */
async function stockSalesByAsin(asins: string[], since: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const res = await db().from("stock_sales").select("quantity, returned_quantity, item:stock_items(asin)").gte("date", since);
  if (res.error) return out;
  for (const r of res.data as unknown as { quantity: number; returned_quantity: number; item: { asin: string | null } | null }[]) {
    const a = r.item?.asin;
    if (a && asins.includes(a)) out.set(a, (out.get(a) ?? 0) + r.quantity - r.returned_quantity);
  }
  return out;
}

/** Fetch FBA inventory from SP-API now (getInventorySummaries); the nightly sync does the same. */
export async function refreshInventory(): Promise<{ ok: boolean; skus: number; error: string | null }> {
  if (!getSpApi()) return { ok: false, skus: 0, error: "SP-API isn't set up" };
  try {
    await syncStock();
    const r = must(await db().from("amazon_inventory").select("sku"), "stock") as unknown[];
    return { ok: true, skus: r.length, error: null };
  } catch (e) {
    const status = e instanceof SpApiError ? e.status : null;
    return { ok: false, skus: 0, error: status === 403 ? "Amazon refused (403): the SP-API app needs the Inventory and Order Tracking role for FBA inventory" : (e as Error).message };
  }
}

/** The values a stock guard changed (uploaded, not yet restored), per ASIN. */
export async function guardsByAsin(): Promise<Record<string, { label: string; restores: BulkChange[] }>> {
  const d = db();
  const res = await d.from("ads_proposals").select("entity_key, asin, status, before, batch_id, updated_at").eq("rule", "stock_guard");
  if (res.error) return {};
  const rows = res.data as { entity_key: string; asin: string | null; status: string; before: BulkChange[] | null; batch_id: string | null; updated_at: string }[];
  const batches = must(await d.from("ads_export_batches").select("id, label"), "batches") as { id: string; label: string }[];
  const out: Record<string, { label: string; restores: BulkChange[]; at: string }> = {};
  for (const r of rows.filter((x) => x.status === "uploaded" && x.entity_key.startsWith("stock:") && x.asin)) {
    const restored = rows.some((x) => x.entity_key === `stock-restore:${r.asin}` && ["exported", "uploaded"].includes(x.status) && x.updated_at > r.updated_at);
    if (restored) continue;
    const cur = out[r.asin!] ?? { label: batches.find((b) => b.id === r.batch_id)?.label ?? "a stock-guard batch", restores: [], at: r.updated_at };
    cur.restores.push(...(r.before ?? []));
    out[r.asin!] = cur;
  }
  return Object.fromEntries(Object.entries(out).map(([a, g]) => [a, { label: g.label, restores: g.restores }]));
}

/* ===================== organic rank checks ===================== */

/** The products to check, each with its tracked keywords: every exact keyword plus any you added. */
export async function rankTargets() {
  const d = db();
  const [camps, kws, extra, plans, prods] = await Promise.all([
    d.from("ads_campaigns").select("id, asin, state"),
    d.from("ads_keywords").select("campaign, keyword_text, match_type, state"),
    d.from("ads_rank_keywords").select("asin, keyword"),
    d.from("ads_launch_plans").select("asin, input"),
    d.from("ads_products").select("asin, title"),
  ]);
  const c = must(camps, "campaigns") as { id: string; asin: string | null; state: string | null }[];
  const asinOf = new Map(c.map((x) => [x.id, x.asin]));
  const out = new Map<string, Set<string>>();
  const add = (asin: string, k: string) => { const s = out.get(asin) ?? new Set<string>(); s.add(k.trim().toLowerCase()); out.set(asin, s); };
  for (const a of c) if (a.asin && !out.has(a.asin)) out.set(a.asin, new Set());
  for (const k of must(kws, "keywords") as { campaign: string; keyword_text: string; match_type: string; state: string | null }[]) {
    const asin = asinOf.get(k.campaign);
    if (asin && /^exact$/i.test(k.match_type) && !/archived/i.test(k.state ?? "")) add(asin, k.keyword_text);
  }
  for (const p of must(plans, "plans") as { asin: string; input: { headTerms?: string[] } }[]) for (const t of p.input.headTerms ?? []) add(p.asin, t);
  const manual = must(extra, "rank keywords") as { asin: string; keyword: string }[];
  for (const m of manual) add(m.asin, m.keyword);
  const titles = new Map((must(prods, "products") as { asin: string; title: string | null }[]).map((p) => [p.asin, p.title]));
  return [...out.entries()].map(([asin, ks]) => ({ asin, title: titles.get(asin) ?? null, keywords: [...ks].sort(), manual: manual.filter((m) => m.asin === asin).map((m) => m.keyword) }));
}

export const RANK_RUN_CAP = 30;

export async function recordRanks(asin: string, runId: string | null, results: { keyword: string; position: number | null; page: number | null; checkedAt?: string }[]) {
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("An ASIN is 10 letters and digits");
  const rows = results.slice(0, RANK_RUN_CAP).filter((r) => typeof r.keyword === "string" && r.keyword.trim()).map((r) => ({
    asin, keyword: r.keyword.trim().toLowerCase().slice(0, 200), run_id: runId && /^[0-9a-f-]{36}$/i.test(runId) ? runId : null,
    position: Number.isInteger(r.position) && r.position! >= 1 && r.position! <= 48 ? r.position : null,
    page: Number.isInteger(r.page) && r.page! >= 1 && r.page! <= 10 ? r.page : null,
    checked_at: r.checkedAt && !Number.isNaN(Date.parse(r.checkedAt)) ? r.checkedAt : new Date().toISOString(),
  }));
  if (rows.length) must(await db().from("ads_rank_checks").insert(rows), "save rank checks");
  return { saved: rows.length };
}

/** Rank checks over the last 120 days: product → keyword → checks, oldest first. */
export async function rankHistory(): Promise<Record<string, Record<string, { position: number | null; page: number | null; checkedAt: string }[]>>> {
  const since = new Date(Date.now() - 120 * DAY).toISOString();
  const res = await db().from("ads_rank_checks").select("asin, keyword, position, page, checked_at").gte("checked_at", since).order("checked_at");
  if (res.error) return {};
  const out: Record<string, Record<string, { position: number | null; page: number | null; checkedAt: string }[]>> = {};
  for (const r of res.data as { asin: string; keyword: string; position: number | null; page: number | null; checked_at: string }[]) {
    ((out[r.asin] ??= {})[r.keyword] ??= []).push({ position: r.position, page: r.page, checkedAt: r.checked_at });
  }
  return out;
}

export async function setRankKeyword(asin: string, keyword: string, on: boolean) {
  const k = keyword.trim().toLowerCase();
  if (!/^[A-Z0-9]{10}$/.test(asin) || !k) throw new Error("An ASIN and a keyword");
  if (on) must(await db().from("ads_rank_keywords").upsert({ asin, keyword: k }, { onConflict: "asin,keyword" }), "add rank keyword");
  else must(await db().from("ads_rank_keywords").delete().eq("asin", asin).eq("keyword", k), "remove rank keyword");
}

/* ===================== the launcher ===================== */

/** What the launcher starts from: an Ads product, or a private-label candidate's gates. */
export async function launchDefaults(opts: { asin?: string | null; candidateId?: string | null; price?: number | null }) {
  const d = db();
  const settings = await adsSettings();
  const notes: string[] = [];
  let headTerms: string[] = [], competitorAsins: string[] = [], dailyBudget: number | null = null, price: number | null = opts.price ?? null, sku = "", title: string | null = null;
  const asin = opts.asin?.toUpperCase() ?? null;
  if (opts.candidateId) {
    const [snap, asins, fields] = await Promise.all([
      d.from("pl_poe_snapshots").select("search_terms, captured_at").eq("candidate_id", opts.candidateId).order("captured_at", { ascending: false }).limit(1),
      d.from("pl_candidate_asins").select("asin, position, is_reference").eq("candidate_id", opts.candidateId).order("position"),
      d.from("pl_candidate_fields").select("key, value").eq("candidate_id", opts.candidateId),
    ]);
    const terms = ((must(snap, "capture") as { search_terms: { term: string; volume: number }[] | null }[])[0]?.search_terms ?? []);
    headTerms = [...terms].sort((a, b) => b.volume - a.volume).slice(0, 8).map((t) => t.term);
    if (!headTerms.length) notes.push("The candidate has no Opportunity Explorer capture: type the head terms");
    competitorAsins = (must(asins, "page one") as { asin: string; is_reference: boolean }[]).filter((a) => !a.is_reference).map((a) => a.asin).slice(0, 10);
    const f = Object.fromEntries((must(fields, "fields") as { key: string; value: string }[]).map((x) => [x.key, x.value]));
    if (f.launchAds && Number(f.launchAds) > 0) dailyBudget = Math.round((Number(f.launchAds) / 60) * 100) / 100;
    else notes.push("Gate 7 has no launch advertising figure: set the daily budget");
    if (price == null && f.sell) price = Number(f.sell);
  }
  let targetAcos = settings.targetAcos / 100, steady: number | null = null;
  if (asin) {
    const [ads, inv, prod, tgt] = await Promise.all([
      d.from("ads_product_ads").select("sku").eq("asin", asin).limit(1),
      d.from("amazon_inventory").select("sku").eq("asin", asin).limit(1),
      d.from("ads_products").select("title, price").eq("asin", asin).maybeSingle(),
      d.from("ads_targets").select("target_acos_launch, target_acos_steady").eq("asin", asin).maybeSingle(),
    ]);
    sku = ((ads.data as { sku: string | null }[] | null)?.[0]?.sku ?? (inv.data as { sku: string }[] | null)?.[0]?.sku ?? "");
    const p = prod.data as { title: string | null; price: number | null } | null;
    title = p?.title ?? null;
    if (price == null && p?.price != null) price = Number(p.price);
    const t = tgt.data as { target_acos_launch: number | null; target_acos_steady: number | null } | null;
    if (t?.target_acos_launch != null) targetAcos = Number(t.target_acos_launch) / 100;
    if (t?.target_acos_steady != null) steady = Number(t.target_acos_steady) / 100;
    if (sku) notes.push(`SKU ${sku} is the one Amazon has for ${asin}: change it if this launch is a different listing (a new pack size has its own SKU)`);
  }
  const start = new Date(Date.now() + DAY).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  // The product's own lists and keyword bank: the blacklist goes in as negative phrases, and the bank
  // fills the head terms when the candidate gave none.
  let negatives: string[] = [];
  if (asin) {
    negatives = (await listsByAsin([asin]))[asin]?.blacklist ?? [];
    if (!headTerms.length) {
      const bank = await keywordBank(asin).catch(() => null);
      if (bank?.headTerms.length) { headTerms = bank.headTerms; notes.push(`Head terms from the keyword bank (${bank.rows.length} terms): Opportunity Explorer's biggest, then what sells, then yours`); }
    }
  }
  // Starting bid: the target ACoS × price × the smoothed conversion. A new launch has no clicks, so
  // that's the prior: the product's conversion, else the account's, else 7%.
  let startingBid = Math.round(settings.cpc * 0.8 * 100) / 100;
  const dash = await adsDashboard();
  const mine = asin ? dash.asins.find((x) => x.asin === asin) : null;
  // No price typed: the dashboard's (Keepa's Buy Box, else the ads' average sale price).
  if (price == null && mine?.economics.priceSource) price = mine.economics.price;
  if (price) {
    const acct = dash.asins.reduce((s, x) => ({ clicks: s.clicks + x.totals.clicks, orders: s.orders + x.totals.orders }), { clicks: 0, orders: 0 });
    const prior = priorConversion(mine ? { clicks: mine.totals.clicks, orders: mine.totals.orders } : null, acct, settings.smoothingK);
    const bid = Math.max(0.1, Math.round(targetAcos * price * prior.value * 100) / 100);
    notes.push(`Starting bid £${bid.toFixed(2)} = ${Math.round(targetAcos * 100)}% target × £${price.toFixed(2)} × ${(prior.value * 100).toFixed(1)}% conversion (${prior.source === "product" ? "the product's" : prior.source === "account" ? "the account's" : "the 7% default: no clicks yet"}, which smoothing starts every keyword from). Settings → Ads CPC × 0.8 would be £${startingBid.toFixed(2)}`);
    startingBid = bid;
  }
  return {
    asin, title, sku, price, headTerms, competitorAsins, dailyBudget: dailyBudget ?? 10, targetAcos, steadyTargetAcos: steady,
    startingBid, startDate: start, notes, negatives,
  };
}

export function previewLaunch(input: LaunchInput) {
  const l = buildLaunch(input);
  return { ...l, describe: l.changes.map(describeChange), rows: l.changes.flatMap(bulkRows).length };
}

/** The launch sheet as a batch, the plan saved, and the product put in its launch phase. */
export async function createLaunch(input: LaunchInput) {
  if (!/^[A-Z0-9]{10}$/.test(input.asin)) throw new Error("An ASIN is 10 letters and digits");
  const l = buildLaunch(input);
  if (!input.sku.trim()) throw new Error("The SKU is needed for the product ads");
  const batch = await createBatch("launch", l.changes, { before: [], notes: [`Launch of ${input.asin} at £${input.price.toFixed(2)}, ${l.campaigns.length} campaigns`, ...l.warnings] });
  must(await db().from("ads_launch_plans").upsert({ asin: input.asin, start_date: input.startDate, input, campaigns: l.campaigns, plan: l.plan, batch_id: batch.id }, { onConflict: "asin" }), "save launch plan");
  await saveAdsProduct(input.asin, { phase: "launch" });
  return { batch, ...l };
}

export async function launchPlans() {
  const res = await db().from("ads_launch_plans").select("asin, start_date, input, campaigns, plan, batch_id, created_at");
  return res.error ? [] : (res.data as { asin: string; start_date: string; input: LaunchInput; campaigns: unknown[]; plan: { from: string; to: string | null; title: string; detail: string }[]; batch_id: string | null; created_at: string }[]);
}
