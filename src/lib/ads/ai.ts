/**
 * Ads, phase 4: the research layer. Compact JSON contexts built from the app's own figures, the
 * structured answers asked of the model (tools with a fixed schema), what a call costs, and the
 * checks on what comes back: every number cited must be in the data, targets must make sense, and
 * recommendations map to a rule or a manual action. The model never sets a bid or a budget: it
 * writes narrative and proposes targets; changes still come from the rules. Pure.
 */
import { RULES, RULE_IDS } from "./rules";

/* ===================== models and cost ===================== */

export interface AiModel { id: string; label: string; inUsd: number; outUsd: number }
/**
 * Price per million tokens (USD) to start from: check anthropic.com/pricing and edit them in
 * Settings → Ads if they differ. Cache reads cost 10% of input, cache writes 125%.
 */
export const AI_MODELS: AiModel[] = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (balanced, default)", inUsd: 3, outUsd: 15 },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest, cheapest)", inUsd: 1, outUsd: 5 },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most capable)", inUsd: 5, outUsd: 25 },
];
export const DEFAULT_AI_MODEL = "claude-sonnet-5-5";
/** £ per $1, to show costs in pounds (editable). */
export const DEFAULT_USD_GBP = 0.79;

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function costOf(u: Usage, price: { inUsd: number; outUsd: number }, gbpPerUsd: number): { usd: number; gbp: number } {
  const usd = (u.input_tokens * price.inUsd + u.output_tokens * price.outUsd + (u.cache_read_input_tokens ?? 0) * price.inUsd * 0.1 + (u.cache_creation_input_tokens ?? 0) * price.inUsd * 1.25) / 1_000_000;
  return { usd: Math.round(usd * 1e6) / 1e6, gbp: Math.round(usd * gbpPerUsd * 1e6) / 1e6 };
}

/** "£0.04"; under a penny, "under £0.01". */
export const costTxt = (gbp: number) => (gbp < 0.005 ? "under £0.01" : `£${gbp.toFixed(2)}`);

/** About 4 characters a token for JSON. */
export const estimateTokens = (x: unknown) => Math.ceil(JSON.stringify(x).length / 4);
/** The context cap: about 20k tokens. */
export const CONTEXT_TOKEN_CAP = 20_000;

/** Shorten the context's lists, longest first, until it fits the cap. */
export function fitContext<T extends Record<string, unknown>>(ctx: T, lists: (keyof T)[], cap = CONTEXT_TOKEN_CAP): T & { trimmed?: string[] } {
  const out = { ...ctx } as T & { trimmed?: string[] };
  const trimmed: string[] = [];
  let guard = 0;
  while (estimateTokens(out) > cap && guard++ < 200) {
    const k = [...lists].sort((a, b) => ((out[b] as unknown[])?.length ?? 0) - ((out[a] as unknown[])?.length ?? 0))[0];
    const arr = out[k] as unknown[];
    if (!arr || arr.length <= 1) break;
    (out as Record<string, unknown>)[k as string] = arr.slice(0, Math.max(1, Math.floor(arr.length * 0.7)));
    if (!trimmed.includes(String(k))) trimmed.push(String(k));
  }
  if (trimmed.length) out.trimmed = trimmed;
  return out;
}

const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const pct1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 10);

/* ===================== the guardrails ===================== */

export const SYSTEM_PROMPT = [
  "You are an Amazon Sponsored Products analyst for a UK seller (prices in £, British English).",
  "Use only the JSON you are given. Every figure you state must come from it (you may round, and say \"about\"): no outside benchmarks, no invented numbers.",
  "Never propose a specific bid or budget, and never tell the seller to set one. Changes to bids, budgets, negatives and keywords come from the app's rules, which raise proposals for the seller to approve: point to a rule (by its id) or call it a manual action.",
  "Percentages in the data are already percentages (12.5 means 12.5%). Money is in pounds.",
  "Be specific and short. Answer only through the tool.",
].join(" ");

/* ===================== 1. Explain this product ===================== */

export interface ExplainInput {
  asin: string; title: string | null; period: { from: string | null; to: string | null };
  phase: "launch" | "steady"; targetAcos: number; breakEvenAcos: number | null; price: number | null;
  totals: { impressions: number | null; clicks: number; cost: number; orders: number; sales: number; units: number | null };
  profitAfterAds: number | null;
  /** All of the product's sales (Amazon's orders) over the same period, for TACoS. */
  totalSales: { revenue: number; units: number } | null;
  terms: { term: string; campaign: string; clicks: number; cost: number; orders: number; sales: number; status: string }[];
  placements: { placement: string; clicks: number; cost: number; orders: number; sales: number }[];
  campaigns: { name: string; state: string | null; budget: number | null; clicks: number; cost: number; orders: number; sales: number }[];
  /** Days out of budget in the last 7 (daily report); null without daily data. */
  budgetLimitedDays: number | null;
  /** Open, approved, and exported but not yet uploaded: the changes in flight. */
  proposals: { rule: string; entity: string; current: string | null; proposed: string | null; reason: string; confidence: string; status: string }[];
  stock: { total: number; daysOfCover: number | null } | null;
}

/** Days of cover as the model should read it: a number, "no sales in the last 14 days", or unknown. */
const coverOf = (d: number | null | undefined) => (d == null ? "unknown" : d >= 9999 ? "no sales in the last 14 days" : Math.round(d));

const acos = (cost: number, sales: number) => (sales > 0 ? pct1(cost / sales) : null);

export function buildExplainContext(x: ExplainInput) {
  const t = x.totals;
  const term = (s: ExplainInput["terms"][number]) => ({ term: s.term, campaign: s.campaign, clicks: s.clicks, spend: r2(s.cost), orders: s.orders, sales: r2(s.sales), acos_pct: acos(s.cost, s.sales) });
  const ctx = {
    product: { asin: x.asin, title: x.title, phase: x.phase, price: r2(x.price) },
    period: x.period,
    figures: {
      spend: r2(t.cost), ad_sales: r2(t.sales), orders: t.orders, units: t.units, clicks: t.clicks, impressions: t.impressions,
      acos_pct: acos(t.cost, t.sales), target_acos_pct: pct1(x.targetAcos), break_even_acos_pct: pct1(x.breakEvenAcos),
      tacos_pct: x.totalSales && x.totalSales.revenue > 0 ? pct1(t.cost / x.totalSales.revenue) : null,
      total_sales_all_channels: x.totalSales ? r2(x.totalSales.revenue) : null, total_units_all_channels: x.totalSales?.units ?? null,
      profit_after_ads: r2(x.profitAfterAds), cpc: t.clicks ? r2(t.cost / t.clicks) : null, conversion_pct: t.clicks ? pct1(t.orders / t.clicks) : null,
      cost_per_order: t.orders ? r2(t.cost / t.orders) : null,
    },
    wasting_terms: x.terms.filter((s) => s.orders === 0 && s.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 10).map(term),
    converting_terms: x.terms.filter((s) => s.orders > 0).sort((a, b) => b.orders - a.orders || b.sales - a.sales).slice(0, 10).map(term),
    placements: x.placements.map((p) => ({ placement: p.placement, clicks: p.clicks, spend: r2(p.cost), orders: p.orders, sales: r2(p.sales), acos_pct: acos(p.cost, p.sales), share_of_spend_pct: t.cost ? pct1(p.cost / t.cost) : null })),
    campaigns: x.campaigns.sort((a, b) => b.cost - a.cost).slice(0, 8).map((c) => ({ name: c.name, state: c.state, daily_budget: r2(c.budget), clicks: c.clicks, spend: r2(c.cost), orders: c.orders, sales: r2(c.sales), acos_pct: acos(c.cost, c.sales) })),
    budget_limited_days_last_7: x.budgetLimitedDays,
    open_proposals: x.proposals.slice(0, 20),
    stock: x.stock ? { units: x.stock.total, days_of_cover: coverOf(x.stock.daysOfCover) } : null,
    notes: [
      ...(x.budgetLimitedDays == null ? ["No daily campaign data: days out of budget are unknown."] : []),
      ...(x.breakEvenAcos == null ? ["Break-even ACoS unknown (landed cost or fees missing)."] : []),
      ...(x.totalSales ? [] : ["No Amazon order data for the period: TACoS unknown."]),
    ],
  };
  return fitContext(ctx, ["wasting_terms", "converting_terms", "open_proposals", "campaigns"]);
}

export const EXPLAIN_TOOL = {
  name: "explain_product",
  description: "Explain how the product's ads did over the period, from the data given.",
  input_schema: {
    type: "object" as const,
    properties: {
      narrative: { type: "string", description: "150–250 words: what happened (spend, ad sales, ACoS against break-even and target, TACoS, profit after ads), citing the figures." },
      drivers: {
        type: "array", minItems: 2, maxItems: 3, description: "The two or three biggest drivers: top wasting terms, top converting terms, the placement split, days out of budget.",
        items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string", description: "One or two sentences with the figures." } }, required: ["title", "detail"] },
      },
      proposals_effect: { type: "string", description: "What the proposals in flight (open, approved, or exported and awaiting upload) would change, in a sentence or two; say there are none if so." },
      numbers_cited: { type: "array", items: { type: "string" }, description: "Every figure used in the narrative, as written." },
    },
    required: ["narrative", "drivers", "proposals_effect", "numbers_cited"],
  },
};

export interface ExplainResult { narrative: string; drivers: { title: string; detail: string }[]; proposals_effect: string; numbers_cited: string[] }

/* ===================== 2. Monthly review ===================== */

export interface ReviewInput {
  month: string;
  products: {
    asin: string; title: string | null; phase: string; targetAcos: number; breakEvenAcos: number | null;
    /** The ad figures that cover the month, and how well (daily rows in the month, or a wider range). */
    ads: { spend: number; sales: number; orders: number; clicks: number; from: string | null; to: string | null; coverage: string };
    amazonMonth: { revenue: number; units: number } | null;
    profitAfterAds: number | null;
    /** Proposals in flight: counts by status and by rule. */
    proposals: { open: number; approved: number; exportedAwaitingUpload: number; byRule: Record<string, number> };
    /** Search terms over the imported range (the search-term data doesn't split by month). */
    terms: { term: string; clicks: number; cost: number; orders: number; sales: number }[];
  }[];
  batches: { label: string; uploadedAt: string; changes: number; rules: string[]; before: Window14 | null; after: Window14 | null; measurable: boolean; why: string | null }[];
}
export interface Window14 { from: string; to: string; spend: number; sales: number; orders: number; clicks: number }

export function buildReviewContext(x: ReviewInput) {
  const w = (v: Window14 | null) => (v ? { from: v.from, to: v.to, spend: r2(v.spend), sales: r2(v.sales), orders: v.orders, clicks: v.clicks, acos_pct: acos(v.spend, v.sales) } : null);
  const ctx = {
    month: x.month,
    products: x.products.map((p) => ({
      asin: p.asin, title: p.title, phase: p.phase, target_acos_pct: pct1(p.targetAcos), break_even_acos_pct: pct1(p.breakEvenAcos),
      ads: { spend: r2(p.ads.spend), ad_sales: r2(p.ads.sales), orders: p.ads.orders, clicks: p.ads.clicks, acos_pct: acos(p.ads.spend, p.ads.sales), from: p.ads.from, to: p.ads.to, coverage: p.ads.coverage },
      amazon_sales_in_month: p.amazonMonth ? { revenue: r2(p.amazonMonth.revenue), units: p.amazonMonth.units } : null,
      cpc: p.ads.clicks ? r2(p.ads.spend / p.ads.clicks) : null, conversion_pct: p.ads.clicks ? pct1(p.ads.orders / p.ads.clicks) : null, cost_per_order: p.ads.orders ? r2(p.ads.spend / p.ads.orders) : null,
      profit_after_ads: r2(p.profitAfterAds),
      proposals: { open: p.proposals.open, approved: p.proposals.approved, exported_awaiting_upload: p.proposals.exportedAwaitingUpload, by_rule: p.proposals.byRule },
      search_terms_note: "over the whole imported range, not split by month",
      top_wasting_terms: p.terms.filter((t) => t.orders === 0 && t.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 5).map((t) => ({ term: t.term, clicks: t.clicks, spend: r2(t.cost) })),
      top_converting_terms: p.terms.filter((t) => t.orders > 0).sort((a, b) => b.orders - a.orders || b.sales - a.sales).slice(0, 5).map((t) => ({ term: t.term, clicks: t.clicks, spend: r2(t.cost), orders: t.orders, sales: r2(t.sales), acos_pct: acos(t.cost, t.sales) })),
    })),
    applied_batches: x.batches.map((b) => ({ label: b.label, uploaded: b.uploadedAt.slice(0, 10), changes: b.changes, rules: b.rules, measurable: b.measurable, why_not: b.why, before_14_days: w(b.before), after_14_days: w(b.after) })),
    rules: RULES.map((r) => ({ id: r.id, label: r.label, does: r.summary })),
  };
  return fitContext(ctx, ["products", "applied_batches"]);
}

export const REVIEW_TOOL = {
  name: "monthly_review",
  description: "Review the month's advertising, per product then account-wide, and recommend three changes.",
  input_schema: {
    type: "object" as const,
    properties: {
      products: { type: "array", items: { type: "object", properties: { asin: { type: "string" }, narrative: { type: "string", description: "80–150 words with the figures; say plainly when the data doesn't split by month." } }, required: ["asin", "narrative"] } },
      account_narrative: { type: "string", description: "80–150 words across all products." },
      batches: {
        type: "array", description: "One per applied batch: did it work? Compare the 14 days before and after; if not measurable, say why.",
        items: { type: "object", properties: { label: { type: "string" }, verdict: { type: "string", enum: ["worked", "did not work", "too early", "not measurable"] }, detail: { type: "string" } }, required: ["label", "verdict", "detail"] },
      },
      recommendations: {
        type: "array", minItems: 3, maxItems: 3, description: "Three, ranked by expected profit impact (largest first). Never a specific bid or budget.",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer" }, title: { type: "string" }, detail: { type: "string" },
            expected_profit_gbp_month: { type: ["number", "null"], description: "Only when the data supports an estimate; else null." },
            maps_to: { type: "string", enum: [...RULE_IDS, "manual"], description: "The app rule that would make this change, or manual." },
          },
          required: ["rank", "title", "detail", "expected_profit_gbp_month", "maps_to"],
        },
      },
    },
    required: ["products", "account_narrative", "batches", "recommendations"],
  },
};

export interface ReviewResult {
  products: { asin: string; narrative: string }[]; account_narrative: string;
  batches: { label: string; verdict: string; detail: string }[];
  recommendations: { rank: number; title: string; detail: string; expected_profit_gbp_month: number | null; maps_to: string }[];
}

/** Recommendations in rank order, each mapped to a known rule (else manual). */
export function checkReview(r: ReviewResult): ReviewResult {
  const recs = [...(r.recommendations ?? [])].sort((a, b) => a.rank - b.rank).slice(0, 3).map((x, i) => ({ ...x, rank: i + 1, maps_to: RULE_IDS.includes(x.maps_to as never) ? x.maps_to : "manual" }));
  return { ...r, recommendations: recs };
}

/* ===================== 3. Target ACoS ===================== */

export interface TargetsInput {
  asin: string; title: string | null; phase: "launch" | "steady"; price: number | null; breakEvenAcos: number | null;
  reviews: number | null; rank: number | null; avgRank90d: number | null; daysOfCover: number | null;
  current: { launch: number | null; steady: number | null; default: number };
  product: { clicks: number; cost: number; orders: number; sales: number };
  account: { cpc: number | null; clicks: number; orders: number; cost: number; sales: number };
}

export function buildTargetsContext(x: TargetsInput) {
  return {
    product: { asin: x.asin, title: x.title, phase: x.phase, price: r2(x.price), break_even_acos_pct: pct1(x.breakEvenAcos), reviews: x.reviews, sales_rank_now: x.rank, sales_rank_avg_90d: x.avgRank90d, days_of_cover: coverOf(x.daysOfCover) },
    current_targets_pct: { launch: x.current.launch, steady: x.current.steady, account_default: x.current.default },
    product_ads: { clicks: x.product.clicks, spend: r2(x.product.cost), orders: x.product.orders, ad_sales: r2(x.product.sales), acos_pct: acos(x.product.cost, x.product.sales), conversion_pct: x.product.clicks ? pct1(x.product.orders / x.product.clicks) : null },
    account_ads: { cpc: r2(x.account.cpc), clicks: x.account.clicks, orders: x.account.orders, acos_pct: acos(x.account.cost, x.account.sales), conversion_pct: x.account.clicks ? pct1(x.account.orders / x.account.clicks) : null },
    guidance: [
      "Launch targets may run above break-even for a limited time to buy rank and reviews; steady targets should sit below break-even so ad sales make money.",
      "Few reviews and a weak rank argue for a launch target that buys visibility; little stock cover argues for restraint.",
    ],
  };
}

export const TARGETS_TOOL = {
  name: "target_acos",
  description: "Propose launch and steady target ACoS for the product.",
  input_schema: {
    type: "object" as const,
    properties: {
      launch_target_pct: { type: "number", description: "Launch target ACoS, %." },
      steady_target_pct: { type: "number", description: "Steady-state target ACoS, %." },
      justification: { type: "string", description: "One paragraph citing the figures: break-even, reviews, rank, cover, conversion." },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["launch_target_pct", "steady_target_pct", "justification", "confidence"],
  },
};

export interface TargetsResult { launch_target_pct: number; steady_target_pct: number; justification: string; confidence: "low" | "medium" | "high"; warnings?: string[] }

/** Targets kept to 1–99% (whole tenths), steady at or under launch; a steady target over break-even is flagged. */
export function checkTargets(r: TargetsResult, breakEvenAcos: number | null): TargetsResult {
  const clamp = (v: number) => Math.min(99, Math.max(1, Math.round(Number(v) * 10) / 10));
  const launch = clamp(r.launch_target_pct), steady = Math.min(clamp(r.steady_target_pct), launch);
  const warnings: string[] = [];
  if (steady !== clamp(r.steady_target_pct)) warnings.push("The steady target was above the launch target: lowered to it");
  if (breakEvenAcos != null && steady > breakEvenAcos * 100) warnings.push(`The steady target (${steady}%) is above break-even (${(breakEvenAcos * 100).toFixed(1)}%): ad sales would lose money`);
  return { ...r, launch_target_pct: launch, steady_target_pct: steady, warnings };
}

/* ===================== citations ===================== */

/** Every number in a nested value (and, for fractions, as a percentage). */
function numbersIn(x: unknown, out: number[] = []): number[] {
  // Signs drop in prose ("a loss of £45.90" for −45.9): the magnitude counts too.
  if (typeof x === "number" && Number.isFinite(x)) { out.push(x, Math.abs(x)); if (Math.abs(x) <= 1) out.push(x * 100, Math.abs(x) * 100); }
  else if (Array.isArray(x)) for (const v of x) numbersIn(v, out);
  else if (x && typeof x === "object") for (const v of Object.values(x)) numbersIn(v, out);
  else if (typeof x === "string") for (const m of x.match(/-?\d[\d,]*(\.\d+)?/g) ?? []) out.push(Number(m.replace(/,/g, "")));
  return out;
}

/**
 * The figures in a text that aren't in the data (within rounding): the model is told to cite only
 * the data, and this checks it. Counts of one to three ("two or three drivers") and years are ignored.
 */
export function uncitedNumbers(text: string, context: unknown): string[] {
  const known = numbersIn(context);
  const out: string[] = [];
  // Dates aren't figures: "10 Aug", "2 October", "2026-08-10".
  const plain = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi, " ");
  for (const m of plain.matchAll(/(£)?(-?\d[\d,]*(?:\.\d+)?)(%)?/g)) {
    const raw = m[0], v = Number(m[2].replace(/,/g, ""));
    if (!m[1] && !m[3] && Number.isInteger(v) && (v <= 3 || (v >= 2000 && v <= 2100))) continue;
    const ok = known.some((k) => Math.abs(k - v) <= Math.max(0.051, Math.abs(k) * 0.006) || Math.abs(Math.round(k) - v) < 0.5 && Math.abs(k - v) < 1);
    if (!ok && !out.includes(raw)) out.push(raw);
  }
  return out;
}
