import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import {
  AI_MODELS, DEFAULT_AI_MODEL, DEFAULT_USD_GBP, EXPLAIN_TOOL, REVIEW_TOOL, SYSTEM_PROMPT, TARGETS_TOOL,
  buildExplainContext, buildReviewContext, buildTargetsContext, checkReview, checkTargets, costOf, estimateTokens, uncitedNumbers,
  type ExplainInput, type ExplainResult, type ReviewInput, type ReviewResult, type TargetsInput, type TargetsResult, type Usage, type Window14,
} from "../ads/ai";
import { dailySignals, windowOf, type DailyRow } from "../ads/daily";
import type { BulkChange } from "../ads/bulk";
import { RULE_LABEL, type RuleId } from "../ads/rules";
import { adsDashboard, adsSettings, loadAll } from "./ads";
import { stockByAsin } from "./adsOps";
import { db, must } from "./db";

/* ===================== settings ===================== */

export interface AiSettings { model: string; inUsd: number; outUsd: number; gbpPerUsd: number; reviewSchedule: boolean; keySet: boolean }

export async function aiSettings(): Promise<AiSettings> {
  const res = await db().from("ads_ai_settings").select("key, value");
  const v: Record<string, string> = res.error ? {} : Object.fromEntries((res.data as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const model = v.model || DEFAULT_AI_MODEL;
  const base = AI_MODELS.find((m) => m.id === model) ?? AI_MODELS[0];
  const num = (s: string | undefined, d: number) => (s != null && Number.isFinite(Number(s)) ? Number(s) : d);
  return {
    model, inUsd: num(v[`priceIn:${model}`], base.inUsd), outUsd: num(v[`priceOut:${model}`], base.outUsd),
    gbpPerUsd: num(v.gbpPerUsd, DEFAULT_USD_GBP), reviewSchedule: v.reviewSchedule === "1", keySet: !!process.env.ANTHROPIC_API_KEY,
  };
}

export async function saveAiSettings(x: Partial<{ model: string; inUsd: number; outUsd: number; gbpPerUsd: number; reviewSchedule: boolean }>): Promise<AiSettings> {
  const cur = await aiSettings();
  const model = x.model?.trim() || cur.model;
  if (!/^claude-[a-z0-9.-]+$/.test(model)) throw new Error("A Claude model id, e.g. claude-sonnet-5-5");
  const rows: { key: string; value: string }[] = [{ key: "model", value: model }];
  for (const [k, v, lo, hi] of [["inUsd", x.inUsd, 0, 1000], ["outUsd", x.outUsd, 0, 1000], ["gbpPerUsd", x.gbpPerUsd, 0.1, 5]] as const) {
    if (v === undefined) continue;
    if (!(Number(v) >= lo && Number(v) <= hi)) throw new Error(`${k} must be ${lo}–${hi}`);
    rows.push({ key: k === "inUsd" ? `priceIn:${model}` : k === "outUsd" ? `priceOut:${model}` : k, value: String(v) });
  }
  if (x.reviewSchedule !== undefined) rows.push({ key: "reviewSchedule", value: x.reviewSchedule ? "1" : "0" });
  must(await db().from("ads_ai_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "key" }), "save AI settings");
  return aiSettings();
}

/* ===================== the call ===================== */

type MessagesClient = { messages: { create: (body: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message> } };
let testClient: MessagesClient | null = null;
/** Tests swap the API for a fake. */
export function __setAnthropicForTests(c: MessagesClient | null) { testClient = c; }
function client(): MessagesClient {
  if (testClient) return testClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY isn't set (.env.local and Vercel)");
  return new Anthropic({ apiKey });
}

/** What a call was for: the Ads features, and Private label's review summary. */
export type AiFeature = "explain" | "review" | "targets" | "pl_reviews";

export interface AiRun<T> {
  result: T; cached: boolean; model: string; at: string; costGbp: number; costUsd: number;
  tokens: { input: number; output: number }; contextTokens: number;
}

/**
 * Structured outputs' schema rules: every object closed (additionalProperties false) with every
 * property required, and no minItems/maxItems above 1 (the checks after the call enforce counts).
 */
export function strictSchema(x: unknown): Record<string, unknown> {
  if (Array.isArray(x)) return x.map(strictSchema) as never;
  if (!x || typeof x !== "object") return x as never;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if ((k === "minItems" && Number(v) > 1) || k === "maxItems") continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, d]) => [p, strictSchema(d)])) : strictSchema(v);
  }
  if (out.type === "object" && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

const hashOf = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 32);

/**
 * Ask the model once for JSON in a fixed schema (structured outputs: the answer is structured,
 * never free text). The same context (hash) for the same feature and subject returns the stored answer unless
 * `force`. Every call, failed ones too, is logged with its tokens and cost.
 */
export async function askModel<T>(x: {
  feature: AiFeature; subject: string; context: unknown; instruction: string;
  /** The system prompt: the Ads analyst's unless given. */
  system?: string;
  tool: { name: string; description: string; input_schema: Anthropic.Tool.InputSchema };
  force?: boolean; trigger?: "user" | "schedule"; maxTokens?: number;
}): Promise<AiRun<T>> {
  const s = await aiSettings();
  const dataHash = hashOf({ context: x.context, tool: x.tool.name, model: s.model, v: 1 });
  const d = db();
  if (!x.force) {
    const hit = (must(await d.from("ads_ai_calls").select("*").eq("feature", x.feature).eq("subject", x.subject).eq("data_hash", dataHash).is("error", null).order("created_at", { ascending: false }).limit(1), "cache") as Record<string, unknown>[])[0];
    if (hit) return { result: hit.result as T, cached: true, model: String(hit.model), at: String(hit.created_at), costGbp: Number(hit.cost_gbp), costUsd: Number(hit.cost_usd), tokens: { input: Number(hit.input_tokens), output: Number(hit.output_tokens) }, contextTokens: estimateTokens(x.context) };
  }
  const base = { feature: x.feature, subject: x.subject, data_hash: dataHash, model: s.model, trigger: x.trigger ?? "user" };
  let msg: Anthropic.Message;
  try {
    msg = await client().messages.create({
      model: s.model, max_tokens: x.maxTokens ?? 2000,
      system: x.system ?? SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: strictSchema(x.tool.input_schema) } },
      messages: [{ role: "user", content: `${x.instruction}\n\nData (JSON):\n${JSON.stringify(x.context)}` }],
    });
  } catch (e) {
    must(await d.from("ads_ai_calls").insert({ ...base, error: (e as Error).message.slice(0, 500) }), "log failed call");
    throw new Error(`The AI call failed: ${(e as Error).message}`);
  }
  const use = msg.usage as Usage;
  const cost = costOf(use, s, s.gbpPerUsd);
  const text = msg.content.filter((c) => c.type === "text").map((c) => (c as Anthropic.TextBlock).text).join("");
  let result: T | null = null;
  try { result = text ? (JSON.parse(text) as T) : null; } catch { result = null; }
  const row = {
    ...base, input_tokens: use.input_tokens, output_tokens: use.output_tokens, cache_read_tokens: use.cache_read_input_tokens ?? 0, cache_write_tokens: use.cache_creation_input_tokens ?? 0,
    cost_usd: cost.usd, cost_gbp: cost.gbp, result, error: result ? null : `No structured answer (stop: ${msg.stop_reason})`,
  };
  const saved = must(await d.from("ads_ai_calls").insert(row).select("created_at").single(), "log call") as { created_at: string };
  if (!result) throw new Error(row.error!);
  return { result, cached: false, model: s.model, at: saved.created_at, costGbp: cost.gbp, costUsd: cost.usd, tokens: { input: use.input_tokens, output: use.output_tokens }, contextTokens: estimateTokens(x.context) };
}

/* ===================== the inputs ===================== */

const n = (v: unknown) => (v == null ? null : Number(v));
type Dash = Awaited<ReturnType<typeof adsDashboard>>;

async function amazonSalesBetween(asin: string, from: string | null, to: string | null) {
  if (!from || !to) return null;
  const rows = (await db().from("amazon_sales").select("units, revenue").eq("asin", asin).gte("day", from).lte("day", to)).data as { units: number; revenue: number }[] | null;
  if (!rows?.length) return null;
  return { revenue: rows.reduce((a, r) => a + Number(r.revenue), 0), units: rows.reduce((a, r) => a + Number(r.units), 0) };
}

async function openProposals(asin: string) {
  const rows = must(await db().from("ads_proposals").select("rule, entity, current_value, proposed_value, reason, confidence, status").eq("asin", asin).in("status", ["open", "approved", "exported"]), "proposals") as { rule: RuleId; entity: { label: string; type: string }; current_value: string | null; proposed_value: string | null; reason: string; confidence: string; status: string }[];
  return rows.map((p) => ({ rule: RULE_LABEL[p.rule] ?? p.rule, entity: `${p.entity.type}: ${p.entity.label}`, current: p.current_value, proposed: p.proposed_value, reason: p.reason, confidence: p.confidence, status: p.status === "exported" ? "exported, awaiting upload" : p.status }));
}

function proposalCounts(ps: Awaited<ReturnType<typeof openProposals>>): ReviewInput["products"][number]["proposals"] {
  const byRule: Record<string, number> = {};
  for (const p of ps) byRule[p.rule] = (byRule[p.rule] ?? 0) + 1;
  return { open: ps.filter((p) => p.status === "open").length, approved: ps.filter((p) => p.status === "approved").length, exportedAwaitingUpload: ps.filter((p) => p.status === "exported, awaiting upload").length, byRule };
}

/** Everything "Explain this product" sends, from the dashboard's own figures. */
export async function explainInput(asin: string, dash?: Dash): Promise<ExplainInput> {
  const dsh = dash ?? (await adsDashboard());
  const a = dsh.asins.find((x) => x.asin === asin);
  if (!a) throw new Error(`No ad data for ${asin}`);
  const camps = dsh.campaigns.filter((c) => c.asin === asin);
  const placements = new Map<string, { placement: string; clicks: number; cost: number; orders: number; sales: number }>();
  for (const c of camps) for (const p of c.placements) {
    const cur = placements.get(p.placement) ?? { placement: p.placement, clicks: 0, cost: 0, orders: 0, sales: 0 };
    cur.clicks += p.totals.clicks; cur.cost += p.totals.cost; cur.orders += p.totals.orders; cur.sales += p.totals.sales;
    placements.set(p.placement, cur);
  }
  // Days out of budget: the most of any campaign's last 7 days (daily report), else unknown.
  const all = await loadAll();
  let limited: number | null = null;
  for (const c of camps) {
    const rows: DailyRow[] = all.daily.filter((r) => r.campaign === c.id).map((r) => ({ date: r.date as string, impressions: n(r.impressions), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), sales: Number(r.sales) }));
    const sg = dailySignals(rows, n(c.budget), new Date().toISOString().slice(0, 10));
    if (sg) limited = Math.max(limited ?? 0, sg.budgetLimitedDays);
  }
  const adsUnits = new Map([[asin, null as number | null]]);
  const stock = (await stockByAsin([asin], adsUnits))[asin] ?? null;
  return {
    asin, title: a.title ?? (dsh.looks?.[asin]?.title ?? null), period: { from: a.from, to: a.to }, phase: a.phase, targetAcos: a.targetAcos,
    breakEvenAcos: a.economics.breakEvenAcos, price: a.economics.priceSource ? a.economics.price : null,
    totals: a.totals, profitAfterAds: a.profitAfterAds, totalSales: await amazonSalesBetween(asin, a.from, a.to),
    terms: dsh.terms.filter((t) => t.asin === asin).map((t) => ({ term: t.term, campaign: t.campaignName, clicks: t.totals.clicks, cost: t.totals.cost, orders: t.totals.orders, sales: t.totals.sales, status: t.status })),
    placements: [...placements.values()],
    campaigns: camps.map((c) => ({ name: c.name, state: c.state, budget: n(c.budget), clicks: c.totals?.clicks ?? 0, cost: c.totals?.cost ?? 0, orders: c.totals?.orders ?? 0, sales: c.totals?.sales ?? 0 })),
    budgetLimitedDays: limited, proposals: await openProposals(asin),
    stock: stock ? { total: stock.total, daysOfCover: stock.daysOfCover } : null,
  };
}

/** Everything the monthly review sends: each product's month, and the batches applied around it. */
export async function reviewInput(month: string): Promise<ReviewInput> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("A month as YYYY-MM");
  const start = `${month}-01`;
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const prevStart = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const dsh = await adsDashboard();
  const all = await loadAll();
  const dailyOf = (campaignIds: string[]) => all.daily.filter((r) => campaignIds.includes(r.campaign as string)).map((r) => ({ date: r.date as string, impressions: n(r.impressions), clicks: Number(r.clicks), cost: Number(r.cost), orders: Number(r.orders), sales: Number(r.sales) }));
  const products: ReviewInput["products"] = [];
  for (const a of dsh.asins) {
    const ids = dsh.campaigns.filter((c) => c.asin === a.asin).map((c) => c.id);
    const inMonth = dailyOf(ids).filter((r) => r.date >= start && r.date <= end);
    const overlaps = a.from && a.to && a.from <= end && a.to >= start;
    const ads = inMonth.length
      ? { spend: inMonth.reduce((x, r) => x + r.cost, 0), sales: inMonth.reduce((x, r) => x + r.sales, 0), orders: inMonth.reduce((x, r) => x + r.orders, 0), clicks: inMonth.reduce((x, r) => x + r.clicks, 0), from: start, to: end, coverage: `${new Set(inMonth.map((r) => r.date)).size} days of daily data in the month` }
      : overlaps
        ? { spend: a.totals.cost, sales: a.totals.sales, orders: a.totals.orders, clicks: a.totals.clicks, from: a.from, to: a.to, coverage: `the imported range ${a.from} to ${a.to}, which doesn't split by month (import the daily Campaign report for monthly figures)` }
        : { spend: 0, sales: 0, orders: 0, clicks: 0, from: null, to: null, coverage: "no ad data imported for this month" };
    products.push({
      asin: a.asin, title: a.title ?? dsh.looks?.[a.asin]?.title ?? null, phase: a.phase, targetAcos: a.targetAcos, breakEvenAcos: a.economics.breakEvenAcos,
      ads, amazonMonth: await amazonSalesBetween(a.asin, start, end), profitAfterAds: a.profitAfterAds,
      proposals: proposalCounts(await openProposals(a.asin)),
      terms: dsh.terms.filter((t) => t.asin === a.asin).map((t) => ({ term: t.term, clicks: t.totals.clicks, cost: t.totals.cost, orders: t.totals.orders, sales: t.totals.sales })),
    });
  }
  // Batches uploaded last month or this one: 14 days before and after, from the daily report.
  const batches = must(await db().from("ads_export_batches").select("id, label, uploaded_at, changes").not("uploaded_at", "is", null).gte("uploaded_at", prevStart).lte("uploaded_at", `${end}T23:59:59Z`), "batches") as { id: string; label: string; uploaded_at: string; changes: BulkChange[] }[];
  const props = batches.length ? must(await db().from("ads_proposals").select("batch_id, rule").in("batch_id", batches.map((b) => b.id)), "batch rules") as { batch_id: string; rule: RuleId }[] : [];
  const byAmazonId = new Map(dsh.campaigns.filter((c) => c.campaign_id).map((c) => [c.campaign_id!, c.id]));
  const out: ReviewInput["batches"] = batches.map((b) => {
    const ids = [...new Set(b.changes.map((c) => ("campaignId" in c ? byAmazonId.get(c.campaignId) : undefined)).filter((x): x is string => !!x))];
    const rows = dailyOf(ids);
    const up = b.uploaded_at.slice(0, 10);
    const dayBefore = new Date(Date.parse(up) - 86_400_000).toISOString().slice(0, 10);
    const after14 = new Date(Date.parse(up) + 14 * 86_400_000).toISOString().slice(0, 10);
    const before = windowOf(rows, dayBefore, 14), after = windowOf(rows, after14, 14);
    const measurable = before.days >= 10 && after.days >= 10;
    const w = (x: typeof before): Window14 => ({ from: x.from!, to: x.to!, spend: x.cost, sales: x.sales, orders: x.orders, clicks: x.clicks });
    return {
      label: b.label, uploadedAt: b.uploaded_at, changes: b.changes.length, rules: [...new Set(props.filter((p) => p.batch_id === b.id).map((p) => RULE_LABEL[p.rule] ?? p.rule))],
      before: before.days ? w(before) : null, after: after.days ? w(after) : null, measurable,
      why: measurable ? null : !rows.length ? "no daily Campaign report for its campaigns" : Date.parse(after14) > Date.now() ? "fewer than 14 days since the upload" : "the daily report doesn't cover both 14-day windows",
    };
  });
  return { month, products, batches: out };
}

/** Everything the target recommender sends. */
export async function targetsInput(asin: string): Promise<TargetsInput> {
  const dsh = await adsDashboard();
  const a = dsh.asins.find((x) => x.asin === asin);
  if (!a) throw new Error(`No ad data for ${asin}`);
  const d = db();
  const [snap, tgt, settings] = await Promise.all([
    d.from("keepa_snapshots").select("summary, review_count_series").eq("asin", asin).order("fetched_at", { ascending: false }).limit(1),
    d.from("ads_targets").select("target_acos_launch, target_acos_steady").eq("asin", asin).maybeSingle(),
    adsSettings(),
  ]);
  const s = ((snap.data ?? []) as { summary: Record<string, unknown> | null; review_count_series: [number, number | null][] | null }[])[0];
  const reviews = s?.review_count_series?.filter((p) => p[1] != null && p[1] >= 0).at(-1)?.[1] ?? null;
  const t = tgt.data as { target_acos_launch: number | null; target_acos_steady: number | null } | null;
  const stock = (await stockByAsin([asin], new Map([[asin, null]])))[asin] ?? null;
  const acct = dsh.asins.reduce((x, p) => ({ clicks: x.clicks + p.totals.clicks, orders: x.orders + p.totals.orders, cost: x.cost + p.totals.cost, sales: x.sales + p.totals.sales }), { clicks: 0, orders: 0, cost: 0, sales: 0 });
  return {
    asin, title: a.title ?? dsh.looks?.[asin]?.title ?? null, phase: a.phase, price: a.economics.priceSource ? a.economics.price : null, breakEvenAcos: a.economics.breakEvenAcos,
    reviews, rank: n(s?.summary?.rankNow), avgRank90d: n(s?.summary?.avgRank90d), daysOfCover: stock?.daysOfCover ?? null,
    current: { launch: n(t?.target_acos_launch), steady: n(t?.target_acos_steady), default: settings.targetAcos },
    product: { clicks: a.totals.clicks, cost: a.totals.cost, orders: a.totals.orders, sales: a.totals.sales },
    account: { cpc: settings.cpc, ...acct },
  };
}

/* ===================== the three features ===================== */

export async function explainProduct(asin: string, opts: { force?: boolean } = {}) {
  const context = buildExplainContext(await explainInput(asin));
  const run = await askModel<ExplainResult>({
    feature: "explain", subject: asin, context, force: opts.force, maxTokens: 4000, tool: EXPLAIN_TOOL,
    instruction: "Explain this product's Sponsored Products results over the period in the data: what happened, the two or three biggest drivers, and what the open proposals would change. Cite the figures you use.",
  });
  const text = [run.result.narrative, ...run.result.drivers.map((x) => x.detail), run.result.proposals_effect].join(" ");
  return { ...run, context, uncited: uncitedNumbers(text, context) };
}

export async function monthlyReview(month: string, opts: { force?: boolean; trigger?: "user" | "schedule" } = {}) {
  const context = buildReviewContext(await reviewInput(month));
  const run = await askModel<ReviewResult>({
    feature: "review", subject: month, context, force: opts.force, trigger: opts.trigger, maxTokens: 8000, tool: REVIEW_TOOL,
    instruction: `Review ${month}: per product, then account-wide; for each applied batch, did it work (14 days before against 14 after); then three recommendations ranked by expected profit impact, each mapped to one of the app's rules (by id) or "manual".`,
  });
  const result = checkReview(run.result);
  const text = [result.account_narrative, ...result.products.map((p) => p.narrative), ...result.recommendations.map((r) => r.detail)].join(" ");
  return { ...run, result, context, uncited: uncitedNumbers(text, context) };
}

export async function recommendTargets(asin: string, opts: { force?: boolean } = {}) {
  const input = await targetsInput(asin);
  const context = buildTargetsContext(input);
  const run = await askModel<TargetsResult>({
    feature: "targets", subject: asin, context, force: opts.force, maxTokens: 3000, tool: TARGETS_TOOL,
    instruction: "Propose a launch and a steady-state target ACoS (%) for this product, with a one-paragraph justification citing the figures and a confidence.",
  });
  const result = checkTargets(run.result, input.breakEvenAcos);
  return { ...run, result, context, uncited: uncitedNumbers(result.justification, { context, proposed: [result.launch_target_pct, result.steady_target_pct] }) };
}

/* ===================== reading back ===================== */

/** The latest answer per feature and subject (without calling the API), and what the AI has cost. */
export async function latestAi(feature: AiFeature, subject: string) {
  const r = (must(await db().from("ads_ai_calls").select("*").eq("feature", feature).eq("subject", subject).is("error", null).order("created_at", { ascending: false }).limit(1), "latest") as Record<string, unknown>[])[0];
  return r ? { result: r.result, model: r.model, at: r.created_at, costGbp: Number(r.cost_gbp), tokens: { input: Number(r.input_tokens), output: Number(r.output_tokens) } } : null;
}

export async function aiSpend() {
  const rows = must(await db().from("ads_ai_calls").select("feature, cost_gbp, created_at, trigger, error"), "AI spend") as { feature: string; cost_gbp: number; created_at: string; trigger: string; error: string | null }[];
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const last30 = rows.filter((r) => r.created_at >= since30);
  return { calls: rows.length, totalGbp: rows.reduce((a, r) => a + Number(r.cost_gbp), 0), last30Gbp: last30.reduce((a, r) => a + Number(r.cost_gbp), 0), last30Calls: last30.length };
}

/** The scheduled review (1st of the month, 06:00): only when you've turned it on. */
export async function scheduledReview(now = new Date()) {
  const s = await aiSettings();
  if (!s.reviewSchedule) return { skipped: "The monthly review schedule is off (Settings → Ads)" };
  if (!s.keySet) return { skipped: "ANTHROPIC_API_KEY isn't set" };
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const r = await monthlyReview(prev, { trigger: "schedule" });
  return { month: prev, costGbp: r.costGbp, cached: r.cached };
}
