/**
 * Ads Phase 2: the rules that turn imported performance into proposed changes (negatives, harvested
 * keywords, bids, pauses, placements, budgets). Each proposal names the entity by Amazon's IDs,
 * the current and proposed value, the reason in real numbers, a confidence and the bulk-sheet rows
 * that make the change (src/lib/ads/bulk.ts). Pure: the server feeds it data, the tests feed it the
 * pill box account's bulk export.
 */
import type { BulkChange } from "./bulk";
import { dailySignals, windowOf, type DailyRow, type DailySignals } from "./daily";
import { chooseRanges } from "./metrics";
import { ngramTable, termHasGram, type GramTerm } from "./ngrams";

export type RuleId = "harvest" | "negative" | "bid_down" | "bid_up" | "pause" | "placement" | "budget" | "revive"
  | "ngram_negative" | "ngram_winner" | "stock_guard" | "ranked" | "slipping";
export type Confidence = "low" | "medium" | "high";
export type RuleMode = "propose" | "auto";

export interface Threshold { key: string; label: string; unit: "count" | "times" | "pct" | "gbp" | "days" | "points"; default: number }
export interface RuleMeta { id: RuleId; label: string; summary: string; thresholds: Threshold[] }

export const RULES: RuleMeta[] = [
  {
    id: "harvest", label: "Harvest",
    summary: "A search term with orders at or under the target ACoS, found by an auto, broad or phrase target, becomes an exact keyword in the product's Exact campaign, and a negative exact where it was found.",
    thresholds: [
      { key: "minOrders", label: "Orders at least", unit: "count", default: 2 },
      { key: "cpcMultiplier", label: "Bid = the term's CPC ×", unit: "times", default: 1.1 },
    ],
  },
  {
    id: "negative", label: "Negative",
    summary: "A search term with no order after enough clicks, or after spending a share of the price, becomes a negative exact in its campaign. (Words wasting across several terms: N-gram negative.)",
    thresholds: [
      { key: "minClicks", label: "Clicks with no order", unit: "count", default: 15 },
      { key: "spendOfPrice", label: "Or spend with no order, % of price", unit: "pct", default: 50 },
      { key: "windowDays", label: "Over the last", unit: "days", default: 60 },
    ],
  },
  {
    id: "bid_down", label: "Bid down",
    summary: "A keyword or target with enough clicks and ACoS well over the target gets the bid that would hit the target at its conversion rate.",
    thresholds: [
      { key: "minClicks", label: "Clicks at least", unit: "count", default: 10 },
      { key: "overTarget", label: "ACoS over target ×", unit: "times", default: 1.2 },
      { key: "floor", label: "Lowest bid", unit: "gbp", default: 0.1 },
    ],
  },
  {
    id: "bid_up", label: "Bid up",
    summary: "A keyword converting well under the target, in a campaign held back (out of budget on several days, or its impressions falling week on week), gets a higher bid. Needs the daily Campaign report.",
    thresholds: [
      { key: "underTarget", label: "ACoS under target ×", unit: "times", default: 0.7 },
      { key: "minOrders", label: "Orders at least", unit: "count", default: 2 },
      { key: "impressionsFall", label: "Or impressions down week on week by", unit: "pct", default: 10 },
      { key: "step", label: "Raise by", unit: "pct", default: 15 },
      { key: "cap", label: "Highest bid", unit: "gbp", default: 1.5 },
    ],
  },
  {
    id: "pause", label: "Pause",
    summary: "A keyword with many clicks and no order is paused.",
    thresholds: [
      { key: "minClicks", label: "Clicks with no order", unit: "count", default: 25 },
      { key: "windowDays", label: "Over the last", unit: "days", default: 60 },
    ],
  },
  {
    id: "placement", label: "Placement",
    summary: "A placement whose ACoS is clearly better than the campaign's, and itself near the target, gets a higher bid adjustment; clearly worse, a lower one.",
    thresholds: [
      { key: "margin", label: "Better or worse than the campaign by", unit: "pct", default: 25 },
      { key: "raiseMaxOverTarget", label: "Raise only if its ACoS at most target ×", unit: "times", default: 1.2 },
      { key: "step", label: "Change the adjustment by", unit: "points", default: 20 },
      { key: "max", label: "Highest adjustment", unit: "pct", default: 100 },
      { key: "minClicks", label: "Placement clicks at least", unit: "count", default: 10 },
    ],
  },
  {
    id: "budget", label: "Budget",
    summary: "A campaign that keeps running out of budget at or under the target ACoS gets more budget; one far over the target for two weeks gets less. Needs the daily Campaign report.",
    thresholds: [
      { key: "hitDays", label: "Days out of budget at least", unit: "count", default: 3 },
      { key: "windowDays", label: "Of the last", unit: "days", default: 7 },
      { key: "up", label: "Raise by", unit: "pct", default: 20 },
      { key: "overTarget", label: "Cut when ACoS over target ×", unit: "times", default: 1.5 },
      { key: "overDays", label: "For", unit: "days", default: 14 },
      { key: "down", label: "Cut by", unit: "pct", default: 25 },
    ],
  },
  {
    id: "revive", label: "Revive",
    summary: "An exact keyword that has sold before but had no impressions lately gets a higher bid: its campaign had none in the daily Campaign report, or it had none in a recent short bulk export.",
    thresholds: [
      { key: "minOrders", label: "Lifetime orders at least", unit: "count", default: 3 },
      { key: "quietDays", label: "No impressions for", unit: "days", default: 14 },
      { key: "step", label: "Raise by", unit: "pct", default: 10 },
    ],
  },
  {
    id: "ngram_negative", label: "N-gram negative",
    summary: "A word or word pair with many clicks (or the price spent) and no order, across several search terms and in none with an order, becomes a negative phrase in every ad group where it has served for that product.",
    thresholds: [
      { key: "minClicks", label: "Clicks with no order", unit: "count", default: 20 },
      { key: "spendOfPrice", label: "Or spend with no order, % of price", unit: "pct", default: 100 },
      { key: "minTerms", label: "In distinct search terms at least", unit: "count", default: 3 },
    ],
  },
  {
    id: "ngram_winner", label: "N-gram winner",
    summary: "A word or word pair selling at or under the target ACoS across several terms puts its best terms forward for harvest, even when each alone is under the harvest threshold.",
    thresholds: [
      { key: "minOrders", label: "Orders at least", unit: "count", default: 5 },
      { key: "minTerms", label: "Across terms with an order, at least", unit: "count", default: 3 },
      { key: "topTerms", label: "Terms to harvest", unit: "count", default: 5 },
    ],
  },
  {
    id: "stock_guard", label: "Stock guard",
    summary: "Low FBA stock slows a product's ads before it runs out: budgets and bids cut, then campaigns paused; once stock is back, the values from before are restored.",
    thresholds: [
      { key: "slowDays", label: "Slow down under (days of cover)", unit: "days", default: 10 },
      { key: "budgetCut", label: "Budget cut", unit: "pct", default: 50 },
      { key: "bidCut", label: "Bid cut", unit: "pct", default: 30 },
      { key: "pauseDays", label: "Pause under (days of cover)", unit: "days", default: 3 },
      { key: "restoreDays", label: "Restore over (days of cover)", unit: "days", default: 21 },
    ],
  },
  {
    id: "ranked", label: "Ranked — ease off",
    summary: "A keyword the product already ranks for organically, near the top, on the last few rank checks gets a lower bid: the ad pays for a slot it already holds.",
    thresholds: [
      { key: "maxPosition", label: "Organic position at most", unit: "count", default: 8 },
      { key: "checks", label: "On the last checks", unit: "count", default: 3 },
      { key: "step", label: "Lower by", unit: "pct", default: 20 },
    ],
  },
  {
    id: "slipping", label: "Slipping",
    summary: "A keyword whose organic position fell sharply between two rank checks, while its ads sell under the target ACoS, gets a higher bid.",
    thresholds: [
      { key: "drop", label: "Places lost at least", unit: "count", default: 10 },
      { key: "step", label: "Raise by", unit: "pct", default: 10 },
    ],
  },
];

export const RULE_LABEL = Object.fromEntries(RULES.map((r) => [r.id, r.label])) as Record<RuleId, string>;
export const RULE_IDS = RULES.map((r) => r.id);

export interface RuleConfig { enabled: boolean; mode: RuleMode; thresholds: Record<string, number> }
export type RulesConfig = Record<RuleId, RuleConfig>;

export const DEFAULT_RULES: RulesConfig = Object.fromEntries(RULES.map((r) => [r.id, {
  enabled: true, mode: "propose", thresholds: Object.fromEntries(r.thresholds.map((t) => [t.key, t.default])),
}])) as RulesConfig;

/** Saved settings over the defaults: unknown keys dropped, missing ones defaulted. */
export function mergeRules(saved: Partial<Record<string, Partial<RuleConfig>>>): RulesConfig {
  return Object.fromEntries(RULES.map((r) => {
    const s = saved[r.id] ?? {};
    const thresholds = Object.fromEntries(r.thresholds.map((t) => {
      const v = Number(s.thresholds?.[t.key]);
      return [t.key, Number.isFinite(v) && v >= 0 ? v : t.default];
    }));
    return [r.id, { enabled: s.enabled ?? true, mode: s.mode === "auto" ? "auto" : "propose", thresholds }];
  })) as RulesConfig;
}

/* ===================== input ===================== */

export interface Perf { impressions: number | null; clicks: number; cost: number; orders: number; sales: number }

export interface RuleProduct {
  asin: string; price: number | null; /** Fraction (0.3). */ targetAcos: number; sku: string | null;
  /** FBA stock and days of cover (Stock guard); null when unknown. */
  stock?: { fulfillable: number; unitsPerDay: number | null; daysOfCover: number | null; source: string; total?: number; home?: number; tiktok_fbt?: number } | null;
  /** The values a stock-guard batch changed, to put back once stock recovers. */
  guard?: { label: string; restores: BulkChange[] } | null;
  /** Launch plan start: weeks 1–2 are harvest only. */
  launchStart?: string | null;
}
export interface RuleCampaign extends Perf {
  id: string; campaignId: string | null; name: string; asin: string | null; targeting: string | null; state: string | null;
  budget: number | null; biddingStrategy: string | null;
  /** Daily rows (from a daily campaign report), for the budget rules; usually empty. */
  daily: DailyRow[];
}
export interface RuleAdGroup { adGroupId: string; campaign: string; defaultBid: number | null; state: string | null }
export interface RuleKeyword extends Perf {
  keywordId: string; campaign: string; adGroupId: string; text: string; matchType: string; bid: number | null; state: string | null;
  /** Its performance per imported range (for Revive's lifetime orders and recent impressions). */
  history: { from: string; to: string; impressions: number | null; orders: number }[];
}
export interface RuleTarget extends Perf { targetId: string; campaign: string; adGroupId: string; expression: string; bid: number | null; state: string | null }
export interface RulePlacement extends Perf { campaign: string; placement: string; percentage: number | null }
export interface RuleTerm extends Perf {
  campaign: string; term: string; adGroupIds: string[];
  /** The match types of the keywords that matched it; null for product targeting (auto). Empty when the report doesn't say. */
  matchTypes: (string | null)[];
}
export interface RuleNegative { campaign: string; adGroupId: string | null; text: string; matchType: string }

export interface RulesInput {
  products: Record<string, RuleProduct>;
  campaigns: RuleCampaign[]; adGroups: RuleAdGroup[]; keywords: RuleKeyword[]; targets: RuleTarget[];
  placements: RulePlacement[]; terms: RuleTerm[]; negatives: RuleNegative[];
  /** Organic rank checks per product and keyword (lower case), oldest first; position null = not in the top 48. */
  ranks?: Record<string, Record<string, { position: number | null; checkedAt: string }[]>>;
  /** The range the entity figures cover (the latest bulk export). */
  range: { from: string; to: string } | null;
  today: string;
}

/* ===================== output ===================== */

export interface Proposal {
  rule: RuleId;
  /** One open proposal per rule and key. */
  key: string;
  asin: string | null;
  campaign: string; campaignName: string; campaignState: string | null;
  entity: { type: "keyword" | "target" | "search term" | "word" | "gram" | "placement" | "campaign" | "product"; label: string; campaignId: string | null; adGroupId: string | null; keywordId: string | null; targetId: string | null };
  current: string; proposed: string; reason: string; confidence: Confidence; effect: string | null;
  changes: BulkChange[];
  /** "word-level" negatives are listed apart from term-level ones. */
  group: string | null;
  clicks: number; orders: number;
}
export interface RulesResult { proposals: Proposal[]; notes: Partial<Record<RuleId, string[]>> }

/* ===================== helpers ===================== */

/** Low under 10 clicks, medium 10–29, high from 30 clicks or 3 orders. */
export function confidence(clicks: number, orders: number): Confidence {
  if (orders >= 3 || clicks >= 30) return "high";
  if (clicks >= 10) return "medium";
  return "low";
}

const acosOf = (p: Pick<Perf, "cost" | "sales">) => (p.sales > 0 ? p.cost / p.sales : p.cost > 0 ? Infinity : null);
const gbp = (v: number) => `£${v.toFixed(2)}`;
const pct = (v: number | null, dp = 1) => (v == null ? "—" : Number.isFinite(v) ? `${(v * 100).toFixed(dp)}%` : "no sales");
/** To the penny, without float noise (0.5 × 1.15 is 0.57499…). */
/** "54.4% ACoS", or "no sales" when there's spend and no sale. */
const acosTxt = (a: number | null) => (a != null && !Number.isFinite(a) ? "no sales" : `${pct(a)} ACoS`);
const round2 = (v: number) => Math.round(Number((v * 100).toFixed(6))) / 100;
const DAY = 86_400_000;
const dayTxt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const perfTxt = (p: Perf) => `${plural(p.clicks, "click")}, ${plural(p.orders, "order")}, ${gbp(p.cost)} spent${p.sales ? `, ${gbp(p.sales)} sales` : ""}`;
const isExact = (m: string | null | undefined) => /^exact$/i.test(m ?? "");
const live = (state: string | null | undefined) => !/archived|paused/i.test(state ?? "");
const notArchived = (state: string | null | undefined) => !/archived/i.test(state ?? "");
/** Does a negative phrase (its words, in order) occur in the term? */
const containsPhrase = (term: string, phrase: string) => ` ${term.toLowerCase()} `.includes(` ${phrase.toLowerCase().trim()} `);

const RULE_ORDER = Object.fromEntries(RULE_IDS.map((r, i) => [r, i])) as Record<RuleId, number>;
const CONF_ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/* ===================== the rules ===================== */

export function runRules(input: RulesInput, config: RulesConfig = DEFAULT_RULES): RulesResult {
  const out: Proposal[] = [];
  const notes: Partial<Record<RuleId, string[]>> = {};
  const note = (r: RuleId, s: string) => { const list = (notes[r] ??= []); if (!list.includes(s)) list.push(s); };
  const on = (r: RuleId) => config[r]?.enabled !== false;
  const th = (r: RuleId) => config[r]?.thresholds ?? DEFAULT_RULES[r].thresholds;
  const campaign = new Map(input.campaigns.map((c) => [c.id, c]));
  const product = (c: RuleCampaign) => (c.asin ? input.products[c.asin] ?? null : null);
  const rangeDays = input.range ? Math.round((Date.parse(input.range.to) - Date.parse(input.range.from)) / DAY) + 1 : null;
  const rangeTxt = input.range ? ` (${dayTxt(input.range.from)} – ${dayTxt(input.range.to)})` : "";
  const perMonth = (cost: number) => (rangeDays ? (cost / rangeDays) * 30 : null);
  const negativesIn = (cid: string) => input.negatives.filter((n) => n.campaign === cid);
  const negatedExact = (cid: string, term: string) => negativesIn(cid).some((n) =>
    (/exact/i.test(n.matchType) && n.text.trim().toLowerCase() === term) || (/phrase/i.test(n.matchType) && containsPhrase(term, n.text)));
  const base = (rule: RuleId, c: RuleCampaign) => ({ rule, asin: c.asin, campaign: c.id, campaignName: c.name, campaignState: c.state, group: null });
  const unexportable = (r: RuleId, c: RuleCampaign) => { if (!c.campaignId) { note(r, `"${c.name}" has no Amazon campaign ID yet (import a bulk export)`); return true; } return false; };
  const needsPrice = (r: RuleId, c: RuleCampaign) => {
    const p = product(c);
    if (!p?.price) { if (c.clicks) note(r, c.asin ? `${c.asin} has no price yet (set it on the dashboard)` : `"${c.name}" has no ASIN: set one on the dashboard`); return null; }
    return p;
  };
  for (const r of ["negative", "pause"] as const) {
    if (on(r) && rangeDays && rangeDays > th(r).windowDays + 2) note(r, `The latest bulk export covers ${rangeDays} days, more than the ${th(r).windowDays}-day window: export the last ${th(r).windowDays} days for this rule`);
  }

  /* ---- Negative (term-level and word-level) ---- */
  if (on("negative")) {
    const t = th("negative");
    for (const term of input.terms) {
      const c = campaign.get(term.campaign);
      if (!c || term.orders > 0) continue;
      const price = product(c)?.price ?? null;
      const byClicks = term.clicks >= t.minClicks;
      const bySpend = price != null && price > 0 && term.cost >= (price * t.spendOfPrice) / 100;
      if (!byClicks && !bySpend) continue;
      if (negatedExact(c.id, term.term) || unexportable("negative", c)) continue;
      const adGroupId = term.adGroupIds.length === 1 ? term.adGroupIds[0] : null;
      const saved = perMonth(term.cost);
      out.push({
        ...base("negative", c), key: `term:${c.id}:${term.term}`,
        entity: { type: "search term", label: term.term, campaignId: c.campaignId, adGroupId, keywordId: null, targetId: null },
        current: "showing", proposed: `negative exact${adGroupId ? "" : " (campaign)"}`,
        reason: `${perfTxt(term)}${price ? ` = ${Math.round((term.cost / price) * 100)}% of the ${gbp(price)} price` : ""}${rangeTxt}. No order after ${byClicks ? `${t.minClicks}+ clicks` : `spending ${t.spendOfPrice}% of the price`}.`,
        confidence: confidence(term.clicks, term.orders),
        effect: saved != null ? `Saves about ${gbp(saved)} a month at this rate` : null,
        changes: [{ kind: "create_negative", campaignId: c.campaignId!, adGroupId, text: term.term, matchType: "Negative exact" }],
        clicks: term.clicks, orders: 0,
      });
    }
  }

  /* ---- Harvest (Rule 1), and Rule 10's candidates through the same path ---- */
  const kwIn = (cid: string) => input.keywords.filter((k) => k.campaign === cid && notArchived(k.state));
  const exactCampaign = (asin: string, not: string) => input.campaigns
    .filter((c) => c.asin === asin && c.id !== not && notArchived(c.state) && !/auto/i.test(c.targeting ?? "") && kwIn(c.id).length > 0 && kwIn(c.id).every((k) => isExact(k.matchType)))
    .sort((a, b) => kwIn(b.id).length - kwIn(a.id).length)[0] ?? null;
  const newCampaigns = new Map<string, { p: RuleProduct; c: RuleCampaign; items: { term: RuleTerm; c: RuleCampaign; bid: number; rule: RuleId }[] }>();
  const harvested = new Set<string>();
  const fromNonExact = (term: RuleTerm, c: RuleCampaign) => /auto/i.test(c.targeting ?? "") || term.matchTypes.some((m) => !isExact(m))
    || (term.matchTypes.length === 0 && kwIn(c.id).some((k) => !isExact(k.matchType)));
  /** A term into the product's Exact campaign, and a negative exact where it was found. */
  const harvestTerm = (rule: "harvest" | "ngram_winner", term: RuleTerm, c: RuleCampaign, p: RuleProduct, lead: string) => {
    const t = th("harvest");
    const key = `term:${c.id}:${term.term}`;
    if (harvested.has(key) || unexportable(rule, c)) return;
    const a = acosOf(term);
    const conv = term.orders / term.clicks;
    const cpc = term.cost / term.clicks;
    const cap = p.targetAcos * p.price! * conv;
    const bid = Math.max(0.02, round2(Math.min(cpc * t.cpcMultiplier, cap)));
    const found = term.matchTypes.length ? [...new Set(term.matchTypes.map((m) => (m ? m.toLowerCase() : "auto targeting")))].join("/") : (c.targeting ?? "").toLowerCase();
    const why = `${lead}"${term.term}": ${perfTxt(term)} = ${acosTxt(a)}${rule === "harvest" ? `, at or under the ${pct(p.targetAcos, 0)} target` : ""}${rangeTxt}, found by ${found} in ${c.name}.`;
    const target = exactCampaign(p.asin, c.id);
    const negate = !negatedExact(c.id, term.term);
    if (!target) {
      if (!p.sku) { note(rule, `${p.asin} has no Exact campaign, and no SKU from a product ad to create one with`); return; }
      const g = newCampaigns.get(p.asin) ?? { p, c, items: [] };
      g.items.push({ term, c, bid, rule });
      newCampaigns.set(p.asin, g);
      harvested.add(key);
      return;
    }
    const group = input.adGroups.find((g) => g.campaign === target.id && notArchived(g.state));
    const exists = input.keywords.some((k) => k.campaign === target.id && isExact(k.matchType) && k.text.trim().toLowerCase() === term.term);
    if ((exists || !group || !target.campaignId) && !negate) return;
    const changes: BulkChange[] = [];
    if (!exists && group && target.campaignId) changes.push({ kind: "create_keyword", campaignId: target.campaignId, adGroupId: group.adGroupId, text: term.term, matchType: "Exact", bid });
    if (negate) changes.push({ kind: "create_negative", campaignId: c.campaignId!, adGroupId: term.adGroupIds.length === 1 ? term.adGroupIds[0] : null, text: term.term, matchType: "Negative exact" });
    harvested.add(key);
    out.push({
      ...base(rule, c), key,
      entity: { type: "search term", label: term.term, campaignId: c.campaignId, adGroupId: term.adGroupIds[0] ?? null, keywordId: null, targetId: null },
      current: `${found} in ${c.name}`,
      proposed: [changes.some((x) => x.kind === "create_keyword") ? `exact in ${target.name} at ${gbp(bid)}` : `already exact in ${target.name}`, negate ? `negative exact in ${c.name}` : null].filter(Boolean).join(" + "),
      reason: changes.some((x) => x.kind === "create_keyword")
        ? `${why} Bid: the term's ${gbp(cpc)} CPC × ${t.cpcMultiplier}, capped at ${pct(p.targetAcos, 0)} × ${gbp(p.price!)} × ${pct(conv)} conversion = ${gbp(cap)}.`
        : `${why} ${target.name} already has it as an exact keyword, so only the negative is needed.`,
      confidence: confidence(term.clicks, term.orders),
      effect: "The term gets its own exact bid; the negative stops the broader target buying the same clicks",
      changes, clicks: term.clicks, orders: term.orders,
    });
  };
  if (on("harvest")) {
    const t = th("harvest");
    for (const term of input.terms) {
      const c = campaign.get(term.campaign);
      if (!c || term.orders < t.minOrders) continue;
      const p = needsPrice("harvest", c);
      if (!p) continue;
      const a = acosOf(term);
      if (a == null || a > p.targetAcos || !fromNonExact(term, c)) continue;
      harvestTerm("harvest", term, c, p, "");
    }
  }

  /* ---- N-grams (Rules 9 and 10) ---- */
  const gramTerms: GramTerm[] = input.terms.flatMap((t) => {
    const c = campaign.get(t.campaign);
    return c?.asin ? [{ asin: c.asin, campaign: c.id, adGroupIds: t.adGroupIds, term: t.term, impressions: t.impressions, clicks: t.clicks, cost: t.cost, orders: t.orders, sales: t.sales }] : [];
  });
  const gramRows = ngramTable(gramTerms);
  if (on("ngram_negative")) {
    const t = th("ngram_negative");
    for (const g of gramRows) {
      const p = input.products[g.asin];
      const bySpend = p?.price != null && p.price > 0 && g.cost >= p.price * t.spendOfPrice / 100;
      if (g.orders > 0 || g.convertingTerms > 0 || g.terms < t.minTerms || (g.clicks < t.minClicks && !bySpend)) continue;
      const changes: BulkChange[] = [];
      const where: string[] = [];
      for (const sv of g.servedIn) {
        const c = campaign.get(sv.campaign);
        if (!c?.campaignId) continue;
        const has = (ag: string | null) => negativesIn(c.id).some((n) => /phrase/i.test(n.matchType) && n.text.trim().toLowerCase() === g.gram && (n.adGroupId == null || n.adGroupId === ag));
        const groups = sv.adGroupIds.filter((ag) => ag && !has(ag));
        for (const ag of groups) changes.push({ kind: "create_negative", campaignId: c.campaignId, adGroupId: ag, text: g.gram, matchType: "Negative phrase" });
        if (groups.length) where.push(c.name);
      }
      if (!changes.length) continue;
      const first = campaign.get(g.servedIn[0].campaign)!;
      out.push({
        ...base("ngram_negative", first), key: `ngram:${g.asin}:${g.gram}`, group: null,
        entity: { type: "gram", label: g.gram, campaignId: null, adGroupId: null, keywordId: null, targetId: null },
        current: `in ${plural(g.terms, "search term")}`, proposed: `negative phrase in ${plural(changes.length, "ad group")} (${where.join(", ")})`,
        reason: `"${g.gram}" is in ${g.terms} search terms (${g.examples.slice(0, 3).map((x) => `"${x}"`).join(", ")}${g.terms > 3 ? "…" : ""}): ${perfTxt(g)}${p?.price ? ` = ${Math.round((g.cost / p.price) * 100)}% of the ${gbp(p.price)} price` : ""}${rangeTxt}, and in no term with an order.`,
        confidence: confidence(g.clicks, 0), effect: perMonth(g.cost) != null ? `Saves about ${gbp(perMonth(g.cost)!)} a month at this rate` : null,
        changes, clicks: g.clicks, orders: 0,
      });
    }
  }
  if (on("ngram_winner")) {
    const t = th("ngram_winner");
    for (const g of gramRows) {
      const p = input.products[g.asin];
      if (!p?.price || g.orders < t.minOrders || g.convertingTerms < t.minTerms || g.acos == null || g.acos > p.targetAcos) continue;
      const cands = input.terms
        .filter((x) => x.orders > 0 && termHasGram(x.term, g.gram) && campaign.get(x.campaign)?.asin === g.asin && fromNonExact(x, campaign.get(x.campaign)!))
        .sort((a, b) => b.orders - a.orders || (acosOf(a) ?? 0) - (acosOf(b) ?? 0))
        .slice(0, t.topTerms);
      for (const term of cands) harvestTerm("ngram_winner", term, campaign.get(term.campaign)!, p, `"${g.gram}" sells across ${g.convertingTerms} terms (${plural(g.orders, "order")}, ${acosTxt(g.acos)}, target ${pct(p.targetAcos, 0)}). `);
    }
  }

  for (const [asin, g] of newCampaigns) {
    const name = `${asin} Exact`;
    const clicks = g.items.reduce((a, x) => a + x.term.clicks, 0), orders = g.items.reduce((a, x) => a + x.term.orders, 0);
    out.push({
      ...base(g.items.some((x) => x.rule === "harvest") ? "harvest" : "ngram_winner", g.c), key: `exact-campaign:${asin}`,
      entity: { type: "campaign", label: name, campaignId: null, adGroupId: null, keywordId: null, targetId: null },
      current: `no Exact campaign for ${asin}`, proposed: `create "${name}" with ${plural(g.items.length, "exact keyword")}`,
      reason: `${g.items.map((x) => `"${x.term.term}" (${plural(x.term.orders, "order")}, ${acosTxt(acosOf(x.term))} in ${x.c.name})`).join("; ")} qualify for harvest, and ${asin} has no campaign of exact keywords to put them in.`,
      confidence: confidence(clicks, orders), effect: "Converting terms get their own exact bids",
      changes: [
        { kind: "create_campaign", name, dailyBudget: g.c.budget ?? 5, biddingStrategy: "Dynamic bids - down only", startDate: input.today, adGroupName: "Exact", defaultBid: Math.max(...g.items.map((x) => x.bid)), sku: g.p.sku!, keywords: g.items.map((x) => ({ text: x.term.term, matchType: "Exact" as const, bid: x.bid })) },
        ...g.items.filter((x) => !negatedExact(x.c.id, x.term.term) && x.c.campaignId).map((x): BulkChange => ({ kind: "create_negative", campaignId: x.c.campaignId!, adGroupId: x.term.adGroupIds.length === 1 ? x.term.adGroupIds[0] : null, text: x.term.term, matchType: "Negative exact" })),
      ],
      clicks, orders,
    });
  }

  /* ---- Pause ---- */
  const paused = new Set<string>();
  if (on("pause")) {
    const t = th("pause");
    for (const k of input.keywords) {
      const c = campaign.get(k.campaign);
      if (!c || !live(k.state) || k.orders > 0 || k.clicks < t.minClicks || unexportable("pause", c)) continue;
      paused.add(k.keywordId);
      out.push({
        ...base("pause", c), key: `kw:${k.keywordId}`,
        entity: { type: "keyword", label: `${k.text} (${k.matchType.toLowerCase()})`, campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, targetId: null },
        current: "enabled", proposed: "paused",
        reason: `${perfTxt(k)}${rangeTxt}: no order after ${t.minClicks}+ clicks.`,
        confidence: confidence(k.clicks, 0), effect: perMonth(k.cost) != null ? `Saves about ${gbp(perMonth(k.cost)!)} a month at this rate` : null,
        changes: [{ kind: "keyword_state", campaignId: c.campaignId!, adGroupId: k.adGroupId, keywordId: k.keywordId, state: "paused" }],
        clicks: k.clicks, orders: 0,
      });
    }
  }

  /* ---- Bid down (keywords and product targets) ---- */
  if (on("bid_down")) {
    const t = th("bid_down");
    const items = [
      ...input.keywords.map((k) => ({ x: k as Perf, id: k.keywordId, kind: "keyword" as const, label: `${k.text} (${k.matchType.toLowerCase()})`, campaign: k.campaign, adGroupId: k.adGroupId, bid: k.bid, state: k.state })),
      ...input.targets.map((k) => ({ x: k as Perf, id: k.targetId, kind: "target" as const, label: k.expression, campaign: k.campaign, adGroupId: k.adGroupId, bid: k.bid, state: k.state })),
    ];
    for (const it of items) {
      const c = campaign.get(it.campaign);
      if (!c || !live(it.state) || it.x.clicks < t.minClicks || paused.has(it.id)) continue;
      const a = acosOf(it.x);
      const p = a != null ? needsPrice("bid_down", c) : null;
      if (!p || a == null || a <= p.targetAcos * t.overTarget || unexportable("bid_down", c)) continue;
      const current = it.bid ?? input.adGroups.find((g) => g.adGroupId === it.adGroupId)?.defaultBid ?? null;
      if (current == null) continue;
      const conv = it.x.orders / it.x.clicks;
      const ideal = p.targetAcos * p.price! * conv;
      const bid = Math.max(t.floor, round2(ideal));
      if (bid >= current) continue;
      const cpc = it.x.cost / it.x.clicks;
      const saved = cpc > bid ? perMonth(it.x.clicks * (cpc - bid)) : null;
      out.push({
        ...base("bid_down", c), key: `${it.kind === "keyword" ? "kw" : "tg"}:${it.id}`,
        entity: { type: it.kind, label: it.label, campaignId: c.campaignId, adGroupId: it.adGroupId, keywordId: it.kind === "keyword" ? it.id : null, targetId: it.kind === "target" ? it.id : null },
        current: gbp(current), proposed: gbp(bid),
        reason: (Number.isFinite(a) ? `${perfTxt(it.x)} = ${pct(a)} ACoS, over ${t.overTarget} × the ${pct(p.targetAcos, 0)} target${rangeTxt}. ` : `${perfTxt(it.x)}, no sales${rangeTxt}. `) +
          (it.x.orders ? `The bid for ${pct(p.targetAcos, 0)} ACoS at ${gbp(p.price!)} and ${pct(conv)} conversion is ${gbp(ideal)}${ideal < t.floor ? `, so the ${gbp(t.floor)} floor` : ""}.` : `No order yet: down to the ${gbp(t.floor)} floor.`),
        confidence: confidence(it.x.clicks, it.x.orders),
        effect: saved != null ? `About ${gbp(saved)} a month less at the same clicks (CPC ${gbp(cpc)} → at most ${gbp(bid)})` : null,
        changes: [it.kind === "keyword"
          ? { kind: "keyword_bid", campaignId: c.campaignId!, adGroupId: it.adGroupId, keywordId: it.id, bid }
          : { kind: "target_bid", campaignId: c.campaignId!, adGroupId: it.adGroupId, targetId: it.id, bid }],
        clicks: it.x.clicks, orders: it.x.orders,
      });
    }
  }

  /* ---- Daily data (Bid up, Budget, Revive): the daily Campaign report ---- */
  const bt = th("budget");
  const signals = new Map<string, DailySignals | null>(input.campaigns.map((c) => [c.id, dailySignals(c.daily, c.budget, input.today, bt.windowDays)]));
  const anyDaily = input.campaigns.some((c) => c.daily.length);
  const DAILY_HOW = "Import the daily Campaign report (Sponsored Products, Campaign, time unit Daily) on Ads → Imports";
  /** A campaign's daily signals when recent enough; otherwise a note says why not. */
  const signalsFor = (r: RuleId, c: RuleCampaign) => {
    const sg = signals.get(c.id);
    if (!sg) return null;
    if (!sg.fresh) { note(r, `"${c.name}": its daily data ends ${dayTxt(sg.last)}, too old to act on. ${DAILY_HOW}`); return null; }
    return sg;
  };
  const pctChange = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

  /* ---- Bid up ---- */
  if (on("bid_up")) {
    const t = th("bid_up");
    if (!anyDaily) note("bid_up", `Needs days out of budget or the impressions trend: neither is in the bulk export. ${DAILY_HOW}`);
    else note("bid_up", "Impression share itself needs the Amazon Ads API: days out of budget and impressions falling week on week stand in for it");
    for (const k of input.keywords) {
      const c = campaign.get(k.campaign);
      if (!c || !live(k.state) || k.orders < t.minOrders || k.bid == null) continue;
      const p = needsPrice("bid_up", c);
      const a = acosOf(k);
      if (!p || a == null || a >= p.targetAcos * t.underTarget) continue;
      const sg = signalsFor("bid_up", c);
      if (!sg) continue;
      const limited = sg.budgetLimitedDays >= bt.hitDays;
      const falling = sg.impressionsChange != null && sg.impressionsChange <= -t.impressionsFall / 100;
      if ((!limited && !falling) || unexportable("bid_up", c)) continue;
      const bid = Math.min(t.cap, round2(k.bid * (1 + t.step / 100)));
      if (bid <= k.bid) continue;
      const why = [
        limited ? `${c.name} ran out of budget on ${sg.budgetLimitedDays} of the last ${bt.windowDays} days (to ${dayTxt(sg.last)})` : null,
        falling ? `its impressions fell ${pctChange(sg.impressionsChange!)} week on week (${sg.week.impressions.toLocaleString("en-GB")} against ${sg.prevWeek.impressions.toLocaleString("en-GB")})` : null,
      ].filter(Boolean).join(", and ");
      out.push({
        ...base("bid_up", c), key: `kw:${k.keywordId}`,
        entity: { type: "keyword", label: `${k.text} (${k.matchType.toLowerCase()})`, campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, targetId: null },
        current: gbp(k.bid), proposed: gbp(bid),
        reason: `${perfTxt(k)} = ${pct(a)} ACoS, under ${t.underTarget} × the ${pct(p.targetAcos, 0)} target${rangeTxt}, and ${why}.`,
        confidence: confidence(k.clicks, k.orders), effect: `Up to ${t.step}% more per click on a keyword selling at ${pct(a)} ACoS`,
        changes: [{ kind: "keyword_bid", campaignId: c.campaignId!, adGroupId: k.adGroupId, keywordId: k.keywordId, bid }],
        clicks: k.clicks, orders: k.orders,
      });
    }
  }

  /* ---- Placement ---- */
  if (on("placement")) {
    const t = th("placement");
    for (const c of input.campaigns) {
      const ca = acosOf(c);
      if (ca == null || !Number.isFinite(ca) || !c.campaignId) continue;
      for (const pl of input.placements.filter((x) => x.campaign === c.id && x.clicks >= t.minClicks)) {
        const pa = acosOf(pl);
        if (pa == null) continue;
        const cur = pl.percentage ?? 0;
        const better = pa <= ca * (1 - t.margin / 100), worse = pa >= ca * (1 + t.margin / 100);
        // Raise only a placement that is itself near the target: better than a bad campaign isn't good enough.
        const target = product(c)?.targetAcos ?? null;
        if (better && (target == null || pa > target * t.raiseMaxOverTarget)) {
          if (cur < t.max) note("placement", `${pl.placement[0].toUpperCase() + pl.placement.slice(1)} in ${c.name}: ${pct(pa)} ACoS beats the campaign's ${pct(ca)}, but ${target == null ? "the campaign has no ASIN, so no target" : `is over ${t.raiseMaxOverTarget} × the ${pct(target, 0)} target`}: not raised`);
          continue;
        }
        const next = better ? Math.min(t.max, cur + t.step) : worse ? Math.max(0, cur - t.step) : cur;
        if (next === cur) continue;
        const diff = Number.isFinite(pa) ? Math.round(Math.abs(1 - pa / ca) * 100) : null;
        const name = pl.placement[0].toUpperCase() + pl.placement.slice(1);
        out.push({
          ...base("placement", c), key: `pl:${c.id}:${pl.placement.toLowerCase()}`,
          entity: { type: "placement", label: name, campaignId: c.campaignId, adGroupId: null, keywordId: null, targetId: null },
          current: `+${cur}%`, proposed: `+${next}%`,
          reason: `${name}: ${perfTxt(pl)}: ${acosTxt(pa)} against the campaign's ${pct(ca)}${diff != null ? `: ${diff}% ${better ? "better" : "worse"}` : ""}${rangeTxt}.${better ? ` Within ${t.raiseMaxOverTarget} × the ${pct(product(c)!.targetAcos, 0)} target.` : ""}`,
          confidence: confidence(pl.clicks, pl.orders),
          effect: better ? `More of ${c.name}'s clicks from its best-converting placement` : `Fewer clicks from a placement converting worse than the rest`,
          changes: [{ kind: "placement", campaignId: c.campaignId, biddingStrategy: c.biddingStrategy ?? "Dynamic bids - down only", placement: pl.placement, percentage: next }],
          clicks: pl.clicks, orders: pl.orders,
        });
      }
    }
  }

  /* ---- Budget ---- */
  if (on("budget")) {
    if (!anyDaily) note("budget", `Needs days out of budget: the bulk export has totals only. ${DAILY_HOW}`);
    else note("budget", "When in the day a budget runs out needs hourly data: the Amazon Ads API");
    for (const c of input.campaigns) {
      if (!c.daily.length || !c.budget || !c.campaignId || !live(c.state)) continue;
      const p = product(c);
      if (!p) { note("budget", `"${c.name}" has no ASIN, so no target ACoS`); continue; }
      const sg = signalsFor("budget", c);
      if (!sg) continue;
      const wk: Perf = sg.week;
      const hits = sg.budgetLimitedDays;
      const wa = acosOf(wk);
      const spanW = windowOf(c.daily, sg.last, bt.overDays);
      const span = { length: spanW.days };
      const sp: Perf = spanW;
      const sa = acosOf(sp);
      let next: number | null = null, reason = "", conf: Perf = wk;
      if (hits >= bt.hitDays && wa != null && wa <= p.targetAcos) {
        next = round2(c.budget * (1 + bt.up / 100));
        reason = `Spent its ${gbp(c.budget)} budget on ${hits} of the last ${bt.windowDays} days at ${pct(wa)} ACoS (target ${pct(p.targetAcos, 0)}): ${perfTxt(wk)}.`;
      } else if (span.length >= bt.overDays && sa != null && sa > p.targetAcos * bt.overTarget) {
        next = round2(c.budget * (1 - bt.down / 100));
        reason = `${acosTxt(sa)} over the last ${bt.overDays} days, over ${bt.overTarget} × the ${pct(p.targetAcos, 0)} target: ${perfTxt(sp)}.`;
        conf = sp;
      }
      if (next == null || next === c.budget) continue;
      out.push({
        ...base("budget", c), key: `cp:${c.id}`,
        entity: { type: "campaign", label: c.name, campaignId: c.campaignId, adGroupId: null, keywordId: null, targetId: null },
        current: `${gbp(c.budget)}/day`, proposed: `${gbp(next)}/day`, reason, confidence: confidence(conf.clicks, conf.orders),
        effect: next > c.budget ? "More of the day's searches at an ACoS within target" : `Up to ${gbp((c.budget - next) * 30)} a month less on a campaign far over target`,
        changes: [{ kind: "campaign_budget", campaignId: c.campaignId, dailyBudget: next }],
        clicks: conf.clicks, orders: conf.orders,
      });
    }
  }

  /* ---- Revive ---- */
  if (on("revive")) {
    const t = th("revive");
    const latest = input.keywords.flatMap((k) => k.history.map((h) => h.to)).sort().at(-1) ?? null;
    const recentOf = (k: RuleKeyword) => k.history.find((h) => latest && h.to >= new Date(Date.parse(latest) - DAY).toISOString().slice(0, 10) && (Date.parse(h.to) - Date.parse(h.from)) / DAY + 1 <= t.quietDays + 1);
    let candidates = 0, seen = 0;
    for (const k of input.keywords) {
      const c = campaign.get(k.campaign);
      if (!c || !isExact(k.matchType) || !notArchived(k.state) || k.bid == null) continue;
      const lifetime = chooseRanges(k.history.map((h) => ({ ...h, rank: 0 }))).reduce((a, h) => a + h.orders, 0);
      if (lifetime < t.minOrders) continue;
      candidates++;
      // Quiet: its campaign (running) had no impressions over the last N days of the daily report,
      // or the keyword had none in a short bulk export.
      const sg = signals.get(c.id);
      const daily = sg && sg.fresh && live(c.state) && live(k.state) ? windowOf(c.daily, sg.last, t.quietDays) : null;
      const recent = recentOf(k);
      if (daily && daily.days >= t.quietDays - 1) seen++;
      else if (recent) seen++;
      const quiet = daily && daily.days >= t.quietDays - 1 && daily.impressions === 0
        ? { from: daily.from!, to: daily.to!, by: `${c.name} had no impressions` }
        : recent && (recent.impressions ?? 0) === 0 ? { from: recent.from, to: recent.to, by: "no impressions" } : null;
      if (!quiet || unexportable("revive", c)) continue;
      const bid = round2(k.bid * (1 + t.step / 100));
      out.push({
        ...base("revive", c), key: `kw:${k.keywordId}`,
        entity: { type: "keyword", label: `${k.text} (exact)`, campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, targetId: null },
        current: gbp(k.bid), proposed: gbp(bid),
        reason: `${plural(lifetime, "order")} imported in all, but ${quiet.by} ${dayTxt(quiet.from)} – ${dayTxt(quiet.to)}.`,
        confidence: confidence(0, lifetime), effect: "Back into the auction for a keyword that has sold",
        changes: [{ kind: "keyword_bid", campaignId: c.campaignId!, adGroupId: k.adGroupId, keywordId: k.keywordId, bid }],
        clicks: k.clicks, orders: lifetime,
      });
    }
    if (candidates && !seen) note("revive", `Needs the last ${t.quietDays} days: ${DAILY_HOW} (or a bulk export of just the last ${t.quietDays} days)`);
    else if (candidates) note("revive", "A keyword gone quiet inside a busy campaign needs keyword-level daily data: the Amazon Ads API");
  }

  /* ---- Stock guard (Rule 11) ---- */
  if (on("stock_guard")) {
    const t = th("stock_guard");
    for (const p of Object.values(input.products)) {
      const st = p.stock;
      if (!st || st.daysOfCover == null) continue;
      const cover = st.daysOfCover;
      const camps = input.campaigns.filter((c) => c.asin === p.asin && c.campaignId && notArchived(c.state));
      const held = st.total != null && st.total !== st.fulfillable
        ? `${st.total} in stock (FBA ${st.fulfillable}, self-ship ${st.home ?? 0}, TikTok ${st.tiktok_fbt ?? 0})`
        : `${st.fulfillable} in FBA stock`;
      const coverTxt = `${held}, selling ${st.unitsPerDay != null ? st.unitsPerDay.toFixed(1) : "0"} a day (${st.source}) = ${Number.isFinite(cover) ? `${cover.toFixed(1)} days` : "no end"} of cover`;
      if (cover < t.pauseDays) {
        for (const c of camps.filter((x) => live(x.state))) out.push({
          ...base("stock_guard", c), key: `stock:${c.id}`,
          entity: { type: "campaign", label: c.name, campaignId: c.campaignId, adGroupId: null, keywordId: null, targetId: null },
          current: c.state ?? "enabled", proposed: "paused",
          reason: `${coverTxt}: under ${t.pauseDays} days. Pause before the listing runs out and the ad spend turns into lost rank.`,
          confidence: "high", effect: "No ad spend on stock that's about to run out; restored when stock is back",
          changes: [{ kind: "campaign_state", campaignId: c.campaignId!, state: "paused" }], clicks: c.clicks, orders: c.orders,
        });
      } else if (cover < t.slowDays) {
        for (const c of camps.filter((x) => live(x.state))) {
          const changes: BulkChange[] = [];
          if (c.budget) changes.push({ kind: "campaign_budget", campaignId: c.campaignId!, dailyBudget: Math.max(1, round2(c.budget * (1 - t.budgetCut / 100))) });
          for (const k of input.keywords.filter((x) => x.campaign === c.id && live(x.state) && x.bid != null)) changes.push({ kind: "keyword_bid", campaignId: c.campaignId!, adGroupId: k.adGroupId, keywordId: k.keywordId, bid: Math.max(0.02, round2(k.bid! * (1 - t.bidCut / 100))) });
          for (const k of input.targets.filter((x) => x.campaign === c.id && live(x.state) && x.bid != null)) changes.push({ kind: "target_bid", campaignId: c.campaignId!, adGroupId: k.adGroupId, targetId: k.targetId, bid: Math.max(0.02, round2(k.bid! * (1 - t.bidCut / 100))) });
          if (!changes.length) continue;
          out.push({
            ...base("stock_guard", c), key: `stock:${c.id}`,
            entity: { type: "campaign", label: c.name, campaignId: c.campaignId, adGroupId: null, keywordId: null, targetId: null },
            current: c.budget ? `${gbp(c.budget)}/day` : "—", proposed: `budget −${t.budgetCut}%, ${plural(changes.length - (c.budget ? 1 : 0), "bid")} −${t.bidCut}%`,
            reason: `${coverTxt}: under ${t.slowDays} days. Slow the ads so the stock lasts until it's replenished.`,
            confidence: "high", effect: "Fewer ad sales while stock is short; the values are put back when it recovers",
            changes, clicks: c.clicks, orders: c.orders,
          });
        }
      } else if (cover > t.restoreDays && p.guard?.restores.length) {
        const c = camps[0] ?? input.campaigns.find((x) => x.asin === p.asin);
        if (!c) continue;
        out.push({
          ...base("stock_guard", c), key: `stock-restore:${p.asin}`,
          entity: { type: "product", label: p.asin, campaignId: null, adGroupId: null, keywordId: null, targetId: null },
          current: `slowed by ${p.guard.label}`, proposed: `restore ${plural(p.guard.restores.length, "value")} from before`,
          reason: `${coverTxt}: over ${t.restoreDays} days again. Put back the budgets, bids and states the stock guard changed in ${p.guard.label}.`,
          confidence: "high", effect: "The ads back where they were before stock ran low",
          changes: p.guard.restores, clicks: 0, orders: 0,
        });
      }
    }
  }

  /* ---- Organic rank (Rules 12 and 13) ---- */
  const ranksFor = (asin: string | null, text: string) => (asin ? input.ranks?.[asin]?.[text.trim().toLowerCase()] ?? [] : []);
  const posTxt = (x: number | null) => (x == null ? "not in the top 48" : `#${x}`);
  for (const k of input.keywords) {
    const c = campaign.get(k.campaign);
    if (!c?.campaignId || !c.asin || !live(k.state) || k.bid == null) continue;
    const hist = ranksFor(c.asin, k.text);
    if (!hist.length) continue;
    const label = `${k.text} (${k.matchType.toLowerCase()})`;
    const entity = { type: "keyword" as const, label, campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, targetId: null };
    if (on("ranked")) {
      const t = th("ranked");
      const last = hist.slice(-t.checks);
      if (last.length === t.checks && last.every((h) => h.position != null && h.position <= t.maxPosition)) {
        const bid = Math.max(0.02, round2(k.bid * (1 - t.step / 100)));
        out.push({
          ...base("ranked", c), key: `kw:${k.keywordId}`, entity, current: gbp(k.bid), proposed: gbp(bid),
          reason: `Organic ${last.map((h) => posTxt(h.position)).join(", ")} for "${k.text}" on the last ${t.checks} rank checks: the product already holds a page-one slot. Ads: ${perfTxt(k)}.`,
          confidence: confidence(k.clicks, k.orders), effect: `Up to ${t.step}% less per click on a search the listing wins organically`,
          changes: [{ kind: "keyword_bid", campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, bid }], clicks: k.clicks, orders: k.orders,
        });
      }
    }
    if (on("slipping") && hist.length >= 2) {
      const t = th("slipping");
      const [prev, last] = hist.slice(-2);
      const lost = (last.position ?? 49) - (prev.position ?? 49);
      const p = input.products[c.asin];
      const a = acosOf(k);
      if (lost >= t.drop && p && a != null && Number.isFinite(a) && a < p.targetAcos) {
        const bid = round2(k.bid * (1 + t.step / 100));
        out.push({
          ...base("slipping", c), key: `kw:${k.keywordId}`, entity, current: gbp(k.bid), proposed: gbp(bid),
          reason: `Organic rank for "${k.text}" fell from ${posTxt(prev.position)} to ${posTxt(last.position)} (${lost} places), while its ads sell at ${pct(a)} ACoS, under the ${pct(p.targetAcos, 0)} target: ${perfTxt(k)}.`,
          confidence: confidence(k.clicks, k.orders), effect: "More ad visibility while organic rank recovers",
          changes: [{ kind: "keyword_bid", campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, bid }], clicks: k.clicks, orders: k.orders,
        });
      }
    }
  }

  /* ---- One change per entity; stock and launch weeks come first ---- */
  const BID_PRIORITY: RuleId[] = ["pause", "bid_down", "ranked", "slipping", "bid_up", "revive"];
  const guarded = new Set(out.filter((p) => p.rule === "stock_guard").map((p) => p.campaign));
  const SAFE: RuleId[] = ["stock_guard", "harvest", "ngram_winner", "negative", "ngram_negative"];
  const launchWeeks = (asin: string | null) => {
    const start = asin ? input.products[asin]?.launchStart : null;
    if (!start) return false;
    const days = (Date.parse(input.today) - Date.parse(start)) / DAY;
    return days >= 0 && days < 14;
  };
  const best = new Map<string, Proposal>();
  const kept: Proposal[] = [];
  for (const p of out) {
    if (!SAFE.includes(p.rule) && guarded.has(p.campaign)) { note(p.rule, `"${p.campaignName}" is under the stock guard: its other changes wait`); continue; }
    if (!SAFE.includes(p.rule) && launchWeeks(p.asin)) { note(p.rule, `${p.asin} is in launch weeks 1–2: harvest and negatives only`); continue; }
    if (BID_PRIORITY.includes(p.rule) && p.key.startsWith("kw:")) {
      const cur = best.get(p.key);
      if (cur && BID_PRIORITY.indexOf(cur.rule) <= BID_PRIORITY.indexOf(p.rule)) continue;
      best.set(p.key, p);
      continue;
    }
    kept.push(p);
  }
  out.length = 0;
  out.push(...kept, ...best.values());

  out.sort((a, b) => (a.asin ?? "~").localeCompare(b.asin ?? "~") || RULE_ORDER[a.rule] - RULE_ORDER[b.rule] || CONF_ORDER[a.confidence] - CONF_ORDER[b.confidence] || b.clicks - a.clicks);
  return { proposals: out, notes };
}

/** Proposals per rule and product (the Rules page's dry run). */
export function countByRule(r: RulesResult): Record<RuleId, { total: number; byAsin: Record<string, number> }> {
  const out = Object.fromEntries(RULE_IDS.map((id) => [id, { total: 0, byAsin: {} as Record<string, number> }])) as Record<RuleId, { total: number; byAsin: Record<string, number> }>;
  for (const p of r.proposals) {
    out[p.rule].total++;
    const k = p.asin ?? "No ASIN";
    out[p.rule].byAsin[k] = (out[p.rule].byAsin[k] ?? 0) + 1;
  }
  return out;
}
