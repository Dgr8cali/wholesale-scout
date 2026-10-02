import "server-only";
import { describeChange, writeBulkFile, type BulkChange } from "../ads/bulk";
import { ngramTable } from "../ads/ngrams";
import { restoresFor } from "../ads/snapshot";
import { countByRule, DEFAULT_RULES, mergeRules, RULE_IDS, runRules, type Proposal, type RuleConfig, type RuleId, type RulesConfig, type RulesInput, type RuleTerm } from "../ads/rules";
import { adsDashboard, loadAll } from "./ads";
import { createBatch, entityState, guardsByAsin, launchPlans, rankHistory, stockByAsin } from "./adsOps";
import { chunks, db, must } from "./db";

/* ===================== rule settings ===================== */

export async function rulesConfig(): Promise<RulesConfig> {
  const res = await db().from("ads_rules").select("rule, enabled, mode, thresholds");
  if (res.error) return DEFAULT_RULES; // before the migration
  return mergeRules(Object.fromEntries((res.data as { rule: string; enabled: boolean; mode: string; thresholds: Record<string, number> }[]).map((r) => [r.rule, r as unknown as Partial<RuleConfig>])));
}

export async function saveRule(rule: string, patch: Partial<RuleConfig>): Promise<RulesConfig> {
  if (!RULE_IDS.includes(rule as RuleId)) throw new Error(`No rule "${rule}"`);
  const cur = (await rulesConfig())[rule as RuleId];
  const next = mergeRules({ [rule]: { ...cur, ...patch, thresholds: { ...cur.thresholds, ...(patch.thresholds ?? {}) } } })[rule as RuleId];
  must(await db().from("ads_rules").upsert({ rule, ...next, updated_at: new Date().toISOString() }, { onConflict: "rule" }), "save rule");
  return rulesConfig();
}

/* ===================== the rules' input ===================== */

const n = (v: unknown) => (v == null ? null : Number(v));
const perf = (r: Record<string, unknown>) => ({ impressions: n(r.impressions), clicks: Number(r.clicks ?? 0), cost: Number(r.cost ?? 0), orders: Number(r.orders ?? 0), sales: Number(r.sales ?? 0) });

/**
 * Everything the rules read: each product's price and target ACoS (as the dashboard has them),
 * each campaign's figures over the latest bulk export's range (else its best figures), and the
 * entities from the bulk export.
 */
async function rulesInput(): Promise<RulesInput> {
  const d = db();
  const [dash, all, lastBulk, ranges, daily, groups, kws, kwRanges, targets, placements, negatives, productAds] = await Promise.all([
    adsDashboard(), loadAll(),
    d.from("ads_imports").select("date_from, date_to").eq("report_type", "bulk").order("imported_at", { ascending: false }).limit(1),
    d.from("ads_campaign_ranges").select("campaign, date_from, date_to, impressions, clicks, cost, orders, sales").eq("source", "bulk"),
    d.from("ads_campaign_daily").select("campaign, date, impressions, clicks, cost, orders, sales"),
    d.from("ads_ad_groups").select("ad_group_id, campaign, default_bid, state"),
    d.from("ads_keywords").select("keyword_id, campaign, ad_group_id, keyword_text, match_type, bid, state, impressions, clicks, cost, orders, sales"),
    d.from("ads_keyword_ranges").select("keyword_id, date_from, date_to, impressions, orders"),
    d.from("ads_product_targets").select("target_id, campaign, ad_group_id, expression, bid, state, impressions, clicks, cost, orders, sales"),
    d.from("ads_placements").select("campaign, placement, percentage, impressions, clicks, cost, orders, sales"),
    d.from("ads_negative_keywords").select("campaign, ad_group_id, keyword_text, match_type"),
    d.from("ads_product_ads").select("asin, sku, state"),
  ]);
  const last = (must(lastBulk, "imports") as { date_from: string | null; date_to: string | null }[])[0];
  const range = last?.date_from && last.date_to ? { from: last.date_from, to: last.date_to } : null;
  const bulkRanges = must(ranges, "ranges") as Record<string, unknown>[];
  const dailyRows = must(daily, "daily") as Record<string, unknown>[];
  const ads = must(productAds, "product ads") as { asin: string | null; sku: string | null; state: string | null }[];
  const history = new Map<string, { from: string; to: string; impressions: number | null; orders: number }[]>();
  for (const r of must(kwRanges, "keyword ranges") as Record<string, unknown>[]) {
    const k = r.keyword_id as string;
    history.set(k, [...(history.get(k) ?? []), { from: r.date_from as string, to: r.date_to as string, impressions: n(r.impressions), orders: Number(r.orders) }]);
  }

  // Stock (days of cover), stock-guard values to restore, launch plans and rank checks.
  const adsUnits = new Map(dash.asins.map((a) => {
    const days = a.from && a.to ? (Date.parse(a.to) - Date.parse(a.from)) / 86_400_000 + 1 : null;
    const units = a.totals.units ?? a.totals.orders;
    return [a.asin, days ? units / days : null] as const;
  }));
  const [stock, guards, plans, ranks] = await Promise.all([stockByAsin(dash.asins.map((a) => a.asin), adsUnits), guardsByAsin(), launchPlans(), rankHistory()]);
  const products: RulesInput["products"] = {};
  for (const a of dash.asins) {
    const sku = ads.find((p) => p.asin === a.asin && !/archived/i.test(p.state ?? ""))?.sku ?? null;
    products[a.asin] = {
      asin: a.asin, price: a.economics.priceSource ? a.economics.price : null, targetAcos: a.targetAcos, sku,
      stock: stock[a.asin] ?? null, guard: guards[a.asin] ?? null, launchStart: plans.find((p) => p.asin === a.asin)?.start_date ?? null,
    };
  }

  // Search terms per campaign and term, over the ranges counted (no overlaps), with the match types that found them.
  const terms = new Map<string, RuleTerm>();
  for (const r of all.terms) {
    const k = `${r.campaign}|${r.term}`;
    const t = terms.get(k) ?? { campaign: r.campaign as string, term: r.term as string, adGroupIds: [], matchTypes: [], impressions: null, clicks: 0, cost: 0, orders: 0, sales: 0 };
    const p = perf(r);
    t.clicks += p.clicks; t.cost += p.cost; t.orders += p.orders; t.sales += p.sales;
    t.impressions = p.impressions == null ? t.impressions : (t.impressions ?? 0) + p.impressions;
    if (r.ad_group_id && !t.adGroupIds.includes(r.ad_group_id as string)) t.adGroupIds.push(r.ad_group_id as string);
    if (r.keyword_id) t.matchTypes.push((r.match_type as string | null) ?? null);
    terms.set(k, t);
  }

  return {
    products,
    campaigns: dash.campaigns.map((c) => {
      const b = bulkRanges.find((r) => r.campaign === c.id && range && r.date_from === range.from && r.date_to === range.to);
      const t = b ? perf(b) : c.totals ? { impressions: c.totals.impressions, clicks: c.totals.clicks, cost: c.totals.cost, orders: c.totals.orders, sales: c.totals.sales } : { impressions: null, clicks: 0, cost: 0, orders: 0, sales: 0 };
      return {
        id: c.id, campaignId: c.campaign_id, name: c.name, asin: c.asin, targeting: c.targeting, state: c.state, budget: n(c.budget), biddingStrategy: c.bidding_strategy, ...t,
        daily: dailyRows.filter((r) => r.campaign === c.id).map((r) => ({ date: r.date as string, impressions: n(r.impressions), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), sales: Number(r.sales) })),
      };
    }),
    adGroups: (must(groups, "ad groups") as Record<string, unknown>[]).map((g) => ({ adGroupId: g.ad_group_id as string, campaign: g.campaign as string, defaultBid: n(g.default_bid), state: g.state as string | null })),
    keywords: (must(kws, "keywords") as Record<string, unknown>[]).map((k) => ({
      keywordId: k.keyword_id as string, campaign: k.campaign as string, adGroupId: k.ad_group_id as string, text: k.keyword_text as string, matchType: k.match_type as string,
      bid: n(k.bid), state: k.state as string | null, ...perf(k), history: history.get(k.keyword_id as string) ?? [],
    })),
    targets: (must(targets, "product targets") as Record<string, unknown>[]).map((t) => ({
      targetId: t.target_id as string, campaign: t.campaign as string, adGroupId: t.ad_group_id as string, expression: (t.expression as string) ?? "", bid: n(t.bid), state: t.state as string | null, ...perf(t),
    })),
    placements: (must(placements, "placements") as Record<string, unknown>[]).map((p) => ({ campaign: p.campaign as string, placement: p.placement as string, percentage: n(p.percentage), ...perf(p) })),
    terms: [...terms.values()],
    negatives: (must(negatives, "negatives") as Record<string, unknown>[]).map((x) => ({ campaign: x.campaign as string, adGroupId: x.ad_group_id as string | null, text: x.keyword_text as string, matchType: x.match_type as string })),
    ranks: Object.fromEntries(Object.entries(ranks).map(([asin, ks]) => [asin, Object.fromEntries(Object.entries(ks).map(([k, hs]) => [k, hs.map((h) => ({ position: h.position, checkedAt: h.checkedAt }))]))])),
    range, today: new Date().toISOString().slice(0, 10),
  };
}

/** The n-gram table per product over the counted search terms, with what Rules 9 and 10 make of it. */
export async function ngramReport() {
  const input = await rulesInput();
  const camp = new Map(input.campaigns.map((c) => [c.id, c]));
  const rows = ngramTable(input.terms.flatMap((t) => {
    const c = camp.get(t.campaign);
    return c?.asin ? [{ asin: c.asin, campaign: c.id, adGroupIds: t.adGroupIds, term: t.term, impressions: t.impressions, clicks: t.clicks, cost: t.cost, orders: t.orders, sales: t.sales }] : [];
  }));
  const r = runRules(input, mergeRules({ ...Object.fromEntries(RULE_IDS.map((id) => [id, { enabled: id === "ngram_negative" || id === "ngram_winner" }])) }));
  const cfg = await rulesConfig();
  const triggers: Record<string, string> = {};
  for (const p of r.proposals) {
    if (p.rule === "ngram_negative") triggers[`${p.asin}|${p.entity.label}`] = "negative";
    if (p.rule === "ngram_winner") { const g = p.reason.match(/^"([^"]+)" sells/)?.[1]; if (g) triggers[`${p.asin}|${g}`] = "winner"; }
  }
  return {
    range: input.range,
    products: Object.values(input.products).map((p) => ({ asin: p.asin, price: p.price, targetAcos: p.targetAcos })),
    thresholds: { negative: cfg.ngram_negative.thresholds, winner: cfg.ngram_winner.thresholds },
    rows: rows.map(({ servedIn, ...g }) => ({ ...g, acos: g.acos != null && Number.isFinite(g.acos) ? g.acos : null, campaigns: servedIn.length, trigger: triggers[`${g.asin}|${g.gram}`] ?? null })),
  };
}

/** What the rules would propose now with these settings, per rule and product (nothing saved). */
export async function dryRun(config?: Partial<Record<string, Partial<RuleConfig>>>) {
  const cfg = config ? mergeRules(config) : await rulesConfig();
  // A dry run counts every rule, on or off.
  const r = runRules(await rulesInput(), mergeRules(Object.fromEntries(RULE_IDS.map((id) => [id, { ...cfg[id], enabled: true }]))));
  return { counts: countByRule(r), notes: r.notes };
}

/* ===================== proposals ===================== */

interface ProposalRow {
  id: string; rule: RuleId; entity_key: string; asin: string | null; campaign: string | null; campaign_name: string | null; campaign_state: string | null;
  entity: Proposal["entity"]; current_value: string | null; proposed_value: string | null; reason: string; confidence: Proposal["confidence"]; effect: string | null;
  changes: BulkChange[]; grp: string | null; clicks: number; orders: number; status: string; hold_until: string | null; batch_id: string | null; decided_at: string | null; created_at: string; updated_at: string;
}
const COLS = "id, rule, entity_key, asin, campaign, campaign_name, campaign_state, entity, current_value, proposed_value, reason, confidence, effect, changes, grp, clicks, orders, status, hold_until, batch_id, decided_at, created_at, updated_at";

const fields = (p: Proposal) => ({
  asin: p.asin, campaign: p.campaign, campaign_name: p.campaignName, campaign_state: p.campaignState, entity: p.entity, current_value: p.current, proposed_value: p.proposed,
  reason: p.reason, confidence: p.confidence, effect: p.effect, changes: p.changes, grp: p.group, clicks: p.clicks, orders: p.orders, updated_at: new Date().toISOString(),
});

/**
 * Run the rules and bring the list up to date: an open proposal is refreshed with the latest
 * numbers, or dropped when its rule no longer fires; a new one is raised unless the same rule and
 * entity was skipped or snoozed (until then), is in a batch not yet uploaded, or was uploaded in the
 * last 30 days. Approved proposals stay as approved.
 */
export async function refreshProposals(): Promise<{ notes: Partial<Record<RuleId, string[]>> }> {
  const d = db();
  const result = runRules(await rulesInput(), await rulesConfig());
  const existing = must(await d.from("ads_proposals").select("id, rule, entity_key, status, hold_until"), "proposals") as Pick<ProposalRow, "id" | "rule" | "entity_key" | "status" | "hold_until">[];
  const now = Date.now();
  const byKey = new Map<string, typeof existing>();
  for (const e of existing) byKey.set(`${e.rule}|${e.entity_key}`, [...(byKey.get(`${e.rule}|${e.entity_key}`) ?? []), e]);
  const seen = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  for (const p of result.proposals) {
    const k = `${p.rule}|${p.key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const rows = byKey.get(k) ?? [];
    const live = rows.find((r) => r.status === "open" || r.status === "approved");
    if (live) { must(await d.from("ads_proposals").update(fields(p)).eq("id", live.id), "refresh proposal"); continue; }
    const held = rows.some((r) => r.status === "exported" || (["skipped", "snoozed", "uploaded"].includes(r.status) && r.hold_until && Date.parse(r.hold_until) > now));
    if (!held) inserts.push({ rule: p.rule, entity_key: p.key, status: "open", ...fields(p) });
  }
  for (const c of chunks(inserts, 200)) if (c.length) must(await d.from("ads_proposals").insert(c), "add proposals");
  const gone = existing.filter((e) => e.status === "open" && !seen.has(`${e.rule}|${e.entity_key}`)).map((e) => e.id);
  for (const c of chunks(gone)) must(await d.from("ads_proposals").delete().in("id", c), "drop stale proposals");
  return { notes: result.notes };
}

export async function listProposals() {
  const { notes } = await refreshProposals();
  const rows = must(await db().from("ads_proposals").select(COLS).in("status", ["open", "approved"]).order("created_at"), "proposals") as ProposalRow[];
  const held = must(await db().from("ads_proposals").select("status").in("status", ["skipped", "snoozed"]).gt("hold_until", new Date().toISOString()), "held") as { status: string }[];
  const pending = must(await db().from("ads_export_batches").select("id").is("uploaded_at", null), "batches") as { id: string }[];
  return { proposals: rows, notes, held: { skipped: held.filter((h) => h.status === "skipped").length, snoozed: held.filter((h) => h.status === "snoozed").length }, batchesAwaitingUpload: pending.length };
}

const DAY = 86_400_000;

/** Approve, skip (not raised again for 30 days), snooze (14 days) or reopen. */
export async function decide(ids: string[], action: "approve" | "skip" | "snooze" | "reopen") {
  if (!ids.length) return;
  const now = new Date();
  const patch = action === "approve" ? { status: "approved", hold_until: null }
    : action === "skip" ? { status: "skipped", hold_until: new Date(now.getTime() + 30 * DAY).toISOString() }
    : action === "snooze" ? { status: "snoozed", hold_until: new Date(now.getTime() + 14 * DAY).toISOString() }
    : { status: "open", hold_until: null };
  for (const c of chunks(ids)) must(await db().from("ads_proposals").update({ ...patch, decided_at: now.toISOString(), updated_at: now.toISOString() }).in("id", c).in("status", ["open", "approved"]), "decide");
}

/* ===================== export batches ===================== */

/**
 * Approved proposals into one bulk sheet: a batch, its proposals marked exported. Before it's
 * written, the current value of everything it changes is saved (the batch's and each proposal's
 * `before`), so the batch can be reverted and a stock guard restored.
 */
export async function exportApproved(): Promise<{ id: string; label: string; rows: number; proposals: number }> {
  const d = db();
  const approved = must(await d.from("ads_proposals").select(COLS).eq("status", "approved").order("asin").order("rule"), "approved") as ProposalRow[];
  if (!approved.length) throw new Error("Nothing approved to export");
  const seen = new Set<string>();
  const changes: BulkChange[] = [];
  for (const p of approved) for (const c of p.changes) { const k = JSON.stringify(c); if (!seen.has(k)) { seen.add(k); changes.push(c); } }
  const state = await entityState();
  const batch = await createBatch("proposals", changes, { before: restoresFor(changes, state).restores, proposals: approved.length });
  for (const p of approved) {
    must(await d.from("ads_proposals").update({ status: "exported", batch_id: batch.id, before: restoresFor(p.changes, state).restores, updated_at: new Date().toISOString() }).eq("id", p.id), "mark exported");
  }
  return { ...batch, proposals: approved.length };
}

export async function listBatches() {
  const d = db();
  const batches = must(await d.from("ads_export_batches").select("id, kind, label, created_at, uploaded_at, proposals, rows, reverts, notes, changes, before").order("created_at", { ascending: false }).limit(100), "batches") as
    { id: string; kind: string; label: string; created_at: string; uploaded_at: string | null; proposals: number; rows: number; reverts: string | null; notes: string[]; changes: BulkChange[]; before: BulkChange[] }[];
  const ids = batches.map((b) => b.id);
  const items = ids.length ? must(await d.from("ads_proposals").select("batch_id, rule, asin, campaign_name, entity, current_value, proposed_value, confidence").in("batch_id", ids), "batch proposals") as Record<string, unknown>[] : [];
  return batches.map(({ changes, before, ...b }) => ({
    ...b, items: items.filter((i) => i.batch_id === b.id), changes: changes.map(describeChange), saved: before.length,
    revertedBy: batches.find((x) => x.reverts === b.id)?.label ?? null, revertsLabel: batches.find((x) => x.id === b.reverts)?.label ?? null,
  }));
}

export async function batchFile(id: string): Promise<{ label: string; data: Uint8Array }> {
  const b = must(await db().from("ads_export_batches").select("label, changes").eq("id", id).maybeSingle(), "batch") as { label: string; changes: BulkChange[] } | null;
  if (!b) throw new Error("No such batch");
  return { label: b.label, data: writeBulkFile(b.changes) };
}

/** You uploaded the sheet in Amazon Ads: its changes aren't proposed again for 30 days. */
export async function markUploaded(id: string, uploaded = true) {
  const now = new Date();
  must(await db().from("ads_export_batches").update({ uploaded_at: uploaded ? now.toISOString() : null }).eq("id", id), "mark uploaded");
  must(await db().from("ads_proposals").update(uploaded
    ? { status: "uploaded", hold_until: new Date(now.getTime() + 30 * DAY).toISOString(), updated_at: now.toISOString() }
    : { status: "exported", hold_until: null, updated_at: now.toISOString() }).eq("batch_id", id), "mark batch proposals");
}
