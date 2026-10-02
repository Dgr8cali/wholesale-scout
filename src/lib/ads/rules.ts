/**
 * Ads Phase 2: the rules that turn imported performance into proposed changes (negatives, harvested
 * keywords, bids, pauses, placements, budgets). Each proposal names the entity by Amazon's IDs,
 * the current and proposed value, the reason in real numbers, a confidence and the bulk-sheet rows
 * that make the change (src/lib/ads/bulk.ts). Pure: the server feeds it data, the tests feed it the
 * pill box account's bulk export.
 */
import type { BulkChange } from "./bulk";
import { chooseRanges } from "./metrics";

export type RuleId = "harvest" | "negative" | "bid_down" | "bid_up" | "pause" | "placement" | "budget" | "revive";
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
    summary: "A search term with no order after enough clicks, or after spending a share of the price, becomes a negative exact in its campaign. A word in several wasting terms and in none with an order becomes a campaign negative phrase (word-level).",
    thresholds: [
      { key: "minClicks", label: "Clicks with no order", unit: "count", default: 15 },
      { key: "spendOfPrice", label: "Or spend with no order, % of price", unit: "pct", default: 50 },
      { key: "windowDays", label: "Over the last", unit: "days", default: 60 },
      { key: "wordMinTerms", label: "Word-level: wasting terms with the word", unit: "count", default: 3 },
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
    summary: "A keyword converting well under the target, in a campaign held back by impression share or budget, gets a higher bid.",
    thresholds: [
      { key: "underTarget", label: "ACoS under target ×", unit: "times", default: 0.7 },
      { key: "minOrders", label: "Orders at least", unit: "count", default: 2 },
      { key: "impressionShare", label: "Impression share under", unit: "pct", default: 50 },
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
    summary: "A placement whose ACoS is clearly better than the campaign's gets a higher bid adjustment; clearly worse, a lower one.",
    thresholds: [
      { key: "margin", label: "Better or worse than the campaign by", unit: "pct", default: 25 },
      { key: "step", label: "Change the adjustment by", unit: "points", default: 20 },
      { key: "max", label: "Highest adjustment", unit: "pct", default: 100 },
      { key: "minClicks", label: "Placement clicks at least", unit: "count", default: 10 },
    ],
  },
  {
    id: "budget", label: "Budget",
    summary: "A campaign that keeps running out of budget at or under the target ACoS gets more budget; one far over the target for two weeks gets less.",
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
    summary: "An exact keyword that has sold before but had no impressions lately gets a higher bid.",
    thresholds: [
      { key: "minOrders", label: "Lifetime orders at least", unit: "count", default: 3 },
      { key: "quietDays", label: "No impressions for", unit: "days", default: 14 },
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

export interface RuleProduct { asin: string; price: number | null; /** Fraction (0.3). */ targetAcos: number; sku: string | null }
export interface RuleCampaign extends Perf {
  id: string; campaignId: string | null; name: string; asin: string | null; targeting: string | null; state: string | null;
  budget: number | null; biddingStrategy: string | null;
  /** Daily rows (from a daily campaign report), for the budget rules; usually empty. */
  daily: { date: string; clicks: number; cost: number; orders: number; sales: number }[];
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
  entity: { type: "keyword" | "target" | "search term" | "word" | "placement" | "campaign"; label: string; campaignId: string | null; adGroupId: string | null; keywordId: string | null; targetId: string | null };
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
  const wasting = new Map<string, RuleTerm[]>();
  if (on("negative")) {
    const t = th("negative");
    for (const term of input.terms) {
      const c = campaign.get(term.campaign);
      if (!c || term.orders > 0) continue;
      const price = product(c)?.price ?? null;
      const byClicks = term.clicks >= t.minClicks;
      const bySpend = price != null && price > 0 && term.cost >= (price * t.spendOfPrice) / 100;
      if (!byClicks && !bySpend) continue;
      wasting.set(c.id, [...(wasting.get(c.id) ?? []), term]);
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
    // Word-level: a word in several wasting terms of a campaign and in none of its terms with an order.
    for (const [cid, terms] of wasting) {
      const c = campaign.get(cid)!;
      if (!c.campaignId) continue;
      const converting = input.terms.filter((x) => x.campaign === cid && x.orders > 0);
      const words = new Map<string, RuleTerm[]>();
      for (const term of terms) for (const w of new Set(term.term.split(/\s+/))) if (w.length >= 3 && !/^\d+$/.test(w)) words.set(w, [...(words.get(w) ?? []), term]);
      for (const [w, ts] of words) {
        if (ts.length < t.wordMinTerms || converting.some((x) => x.term.split(/\s+/).includes(w))) continue;
        if (negativesIn(cid).some((n) => /phrase/i.test(n.matchType) && n.text.trim().toLowerCase() === w)) continue;
        const sum = ts.reduce((a, x) => ({ clicks: a.clicks + x.clicks, cost: a.cost + x.cost }), { clicks: 0, cost: 0 });
        out.push({
          ...base("negative", c), key: `word:${cid}:${w}`, group: "word-level",
          entity: { type: "word", label: w, campaignId: c.campaignId, adGroupId: null, keywordId: null, targetId: null },
          current: "showing", proposed: "campaign negative phrase",
          reason: `"${w}" is in ${ts.length} wasting terms (${ts.slice(0, 3).map((x) => `"${x.term}"`).join(", ")}${ts.length > 3 ? "…" : ""}: ${plural(sum.clicks, "click")}, ${gbp(sum.cost)} spent, 0 orders) and in no term with an order${rangeTxt}.`,
          confidence: confidence(sum.clicks, 0), effect: perMonth(sum.cost) != null ? `Saves about ${gbp(perMonth(sum.cost)!)} a month at this rate` : null,
          changes: [{ kind: "create_negative", campaignId: c.campaignId, adGroupId: null, text: w, matchType: "Negative phrase" }],
          clicks: sum.clicks, orders: 0,
        });
      }
    }
  }

  /* ---- Harvest ---- */
  if (on("harvest")) {
    const t = th("harvest");
    const kwIn = (cid: string) => input.keywords.filter((k) => k.campaign === cid && notArchived(k.state));
    const exactCampaign = (asin: string, not: string) => input.campaigns
      .filter((c) => c.asin === asin && c.id !== not && notArchived(c.state) && !/auto/i.test(c.targeting ?? "") && kwIn(c.id).length > 0 && kwIn(c.id).every((k) => isExact(k.matchType)))
      .sort((a, b) => kwIn(b.id).length - kwIn(a.id).length)[0] ?? null;
    const newCampaigns = new Map<string, { p: RuleProduct; c: RuleCampaign; items: { term: RuleTerm; c: RuleCampaign; bid: number }[] }>();
    for (const term of input.terms) {
      const c = campaign.get(term.campaign);
      if (!c || term.orders < t.minOrders) continue;
      const p = needsPrice("harvest", c);
      if (!p) continue;
      const a = acosOf(term);
      if (a == null || a > p.targetAcos) continue;
      const fromNonExact = /auto/i.test(c.targeting ?? "") || term.matchTypes.some((m) => !isExact(m))
        || (term.matchTypes.length === 0 && kwIn(c.id).some((k) => !isExact(k.matchType)));
      if (!fromNonExact || unexportable("harvest", c)) continue;
      const conv = term.orders / term.clicks;
      const cpc = term.cost / term.clicks;
      const cap = p.targetAcos * p.price! * conv;
      const bid = Math.max(0.02, round2(Math.min(cpc * t.cpcMultiplier, cap)));
      const found = term.matchTypes.length ? [...new Set(term.matchTypes.map((m) => (m ? m.toLowerCase() : "auto targeting")))].join("/") : (c.targeting ?? "").toLowerCase();
      const why = `"${term.term}": ${perfTxt(term)} = ${pct(a)} ACoS, at or under the ${pct(p.targetAcos, 0)} target${rangeTxt}, found by ${found} in ${c.name}.`;
      const target = exactCampaign(p.asin, c.id);
      const negate = !negatedExact(c.id, term.term);
      if (!target) {
        if (!p.sku) { note("harvest", `${p.asin} has no Exact campaign, and no SKU from a product ad to create one with`); continue; }
        const g = newCampaigns.get(p.asin) ?? { p, c, items: [] };
        g.items.push({ term, c, bid });
        newCampaigns.set(p.asin, g);
        continue;
      }
      const group = input.adGroups.find((g) => g.campaign === target.id && notArchived(g.state));
      const exists = input.keywords.some((k) => k.campaign === target.id && isExact(k.matchType) && k.text.trim().toLowerCase() === term.term);
      if ((exists || !group || !target.campaignId) && !negate) continue;
      const changes: BulkChange[] = [];
      if (!exists && group && target.campaignId) changes.push({ kind: "create_keyword", campaignId: target.campaignId, adGroupId: group.adGroupId, text: term.term, matchType: "Exact", bid });
      if (negate) changes.push({ kind: "create_negative", campaignId: c.campaignId!, adGroupId: term.adGroupIds.length === 1 ? term.adGroupIds[0] : null, text: term.term, matchType: "Negative exact" });
      out.push({
        ...base("harvest", c), key: `term:${c.id}:${term.term}`,
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
    }
    for (const [asin, g] of newCampaigns) {
      const name = `${asin} Exact`;
      const clicks = g.items.reduce((a, x) => a + x.term.clicks, 0), orders = g.items.reduce((a, x) => a + x.term.orders, 0);
      out.push({
        ...base("harvest", g.c), key: `exact-campaign:${asin}`,
        entity: { type: "campaign", label: name, campaignId: null, adGroupId: null, keywordId: null, targetId: null },
        current: `no Exact campaign for ${asin}`, proposed: `create "${name}" with ${plural(g.items.length, "exact keyword")}`,
        reason: `${g.items.map((x) => `"${x.term.term}" (${plural(x.term.orders, "order")}, ${pct(acosOf(x.term))} ACoS in ${x.c.name})`).join("; ")} qualify for harvest, and ${asin} has no campaign of exact keywords to put them in.`,
        confidence: confidence(clicks, orders), effect: "Converting terms get their own exact bids",
        changes: [
          { kind: "create_campaign", name, dailyBudget: g.c.budget ?? 5, biddingStrategy: "Dynamic bids - down only", startDate: input.today, adGroupName: "Exact", defaultBid: Math.max(...g.items.map((x) => x.bid)), sku: g.p.sku!, keywords: g.items.map((x) => ({ text: x.term.term, matchType: "Exact" as const, bid: x.bid })) },
          ...g.items.filter((x) => !negatedExact(x.c.id, x.term.term) && x.c.campaignId).map((x): BulkChange => ({ kind: "create_negative", campaignId: x.c.campaignId!, adGroupId: x.term.adGroupIds.length === 1 ? x.term.adGroupIds[0] : null, text: x.term.term, matchType: "Negative exact" })),
        ],
        clicks, orders,
      });
    }
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

  /* ---- Budget-limited days (Budget and Bid up) ---- */
  const bt = th("budget");
  const lastDays = (c: RuleCampaign, n: number) => {
    if (!c.daily.length) return [];
    const last = c.daily.map((d) => d.date).sort().at(-1)!;
    const from = new Date(Date.parse(last) - (n - 1) * DAY).toISOString().slice(0, 10);
    return c.daily.filter((d) => d.date >= from);
  };
  const hitDays = (c: RuleCampaign) => (c.budget ? lastDays(c, bt.windowDays).filter((d) => d.cost >= c.budget! * 0.95).length : 0);
  const anyDaily = input.campaigns.some((c) => c.daily.length);

  /* ---- Bid up ---- */
  if (on("bid_up")) {
    const t = th("bid_up");
    if (!anyDaily) note("bid_up", "Needs impression share or days out of budget: neither is in the bulk export. Import a daily campaign report to use the budget signal");
    for (const k of input.keywords) {
      const c = campaign.get(k.campaign);
      if (!c || !live(k.state) || k.orders < t.minOrders || k.bid == null) continue;
      const p = needsPrice("bid_up", c);
      const a = acosOf(k);
      if (!p || a == null || a >= p.targetAcos * t.underTarget) continue;
      const hits = hitDays(c);
      if (hits < bt.hitDays || unexportable("bid_up", c)) continue;
      const bid = Math.min(t.cap, round2(k.bid * (1 + t.step / 100)));
      if (bid <= k.bid) continue;
      out.push({
        ...base("bid_up", c), key: `kw:${k.keywordId}`,
        entity: { type: "keyword", label: `${k.text} (${k.matchType.toLowerCase()})`, campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, targetId: null },
        current: gbp(k.bid), proposed: gbp(bid),
        reason: `${perfTxt(k)} = ${pct(a)} ACoS, under ${t.underTarget} × the ${pct(p.targetAcos, 0)} target${rangeTxt}, and ${c.name} ran out of budget on ${hits} of the last ${bt.windowDays} days.`,
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
        const next = better ? Math.min(t.max, cur + t.step) : worse ? Math.max(0, cur - t.step) : cur;
        if (next === cur) continue;
        const diff = Number.isFinite(pa) ? Math.round(Math.abs(1 - pa / ca) * 100) : null;
        const name = pl.placement[0].toUpperCase() + pl.placement.slice(1);
        out.push({
          ...base("placement", c), key: `pl:${c.id}:${pl.placement.toLowerCase()}`,
          entity: { type: "placement", label: name, campaignId: c.campaignId, adGroupId: null, keywordId: null, targetId: null },
          current: `+${cur}%`, proposed: `+${next}%`,
          reason: `${name}: ${perfTxt(pl)}: ${acosTxt(pa)} against the campaign's ${pct(ca)}${diff != null ? `: ${diff}% ${better ? "better" : "worse"}` : ""}${rangeTxt}.`,
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
    if (!anyDaily) note("budget", "Needs daily figures: the bulk export has totals only. Import a daily campaign report");
    for (const c of input.campaigns) {
      if (!c.daily.length || !c.budget || !c.campaignId) continue;
      const p = product(c);
      if (!p) { note("budget", `"${c.name}" has no ASIN, so no target ACoS`); continue; }
      const week = lastDays(c, bt.windowDays);
      const wk = week.reduce((a, d) => ({ clicks: a.clicks + d.clicks, cost: a.cost + d.cost, orders: a.orders + d.orders, sales: a.sales + d.sales, impressions: null }), { clicks: 0, cost: 0, orders: 0, sales: 0, impressions: null } as Perf);
      const hits = hitDays(c);
      const wa = acosOf(wk);
      const span = lastDays(c, bt.overDays);
      const sp = span.reduce((a, d) => ({ clicks: a.clicks + d.clicks, cost: a.cost + d.cost, orders: a.orders + d.orders, sales: a.sales + d.sales, impressions: null }), { clicks: 0, cost: 0, orders: 0, sales: 0, impressions: null } as Perf);
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
    let candidates = 0;
    for (const k of input.keywords) {
      const c = campaign.get(k.campaign);
      if (!c || !isExact(k.matchType) || !notArchived(k.state) || k.bid == null) continue;
      const lifetime = chooseRanges(k.history.map((h) => ({ ...h, rank: 0 }))).reduce((a, h) => a + h.orders, 0);
      if (lifetime < t.minOrders) continue;
      candidates++;
      const recent = recentOf(k);
      if (!recent || (recent.impressions ?? 0) > 0 || unexportable("revive", c)) continue;
      const bid = round2(k.bid * (1 + t.step / 100));
      out.push({
        ...base("revive", c), key: `kw:${k.keywordId}`,
        entity: { type: "keyword", label: `${k.text} (exact)`, campaignId: c.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, targetId: null },
        current: gbp(k.bid), proposed: gbp(bid),
        reason: `${plural(lifetime, "order")} imported in all, but no impressions ${dayTxt(recent.from)} – ${dayTxt(recent.to)}.`,
        confidence: confidence(0, lifetime), effect: "Back into the auction for a keyword that has sold",
        changes: [{ kind: "keyword_bid", campaignId: c.campaignId!, adGroupId: k.adGroupId, keywordId: k.keywordId, bid }],
        clicks: k.clicks, orders: lifetime,
      });
    }
    if (candidates && !input.keywords.some((k) => recentOf(k))) note("revive", `Needs a bulk export of just the last ${t.quietDays} days (as well as a longer one) to see which keywords have gone quiet`);
  }

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
