import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { RULE_LABEL, type RuleId } from "../ads/rules";
import { withAdsDefaults } from "../pl/adsDefaults";
import { evaluate } from "../pl/gatekeeper";
import { LAUNCH_STEPS } from "../pl/launch";
import { adsDashboard } from "./ads";
import { db, must, selectAll } from "./db";
import { listCandidates } from "./pl";
import { stockLevels } from "./stock";

/**
 * Ask Scout's tools: READ-ONLY lookups of your own data. Every one only selects (directly or through
 * the read helpers adsDashboard, stockLevels and listCandidates); none writes, deletes, uploads or
 * calls Amazon. `askScoutTools.test.ts` checks that against a recording database and this file's source.
 * Each answer carries `links`: the app pages the figures come from.
 */

type Link = { label: string; href: string };
export interface ToolResult { data: unknown; links: Link[] }

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const pct = (n: number | null | undefined) => (n == null ? null : Math.round(Number(n) * 1000) / 10);
const words = (q: string | undefined) => (q ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
/** Every word of the query appears in one of the texts (empty query: everything matches). */
const matches = (q: string | undefined, ...texts: (string | null | undefined)[]) => {
  const ws = words(q);
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return ws.every((w) => hay.includes(w));
};
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");

const text = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool.InputSchema =>
  ({ type: "object", properties, required, additionalProperties: false }) as Anthropic.Tool.InputSchema;

export const TOOLS: Anthropic.Tool[] = [
  { name: "find_products", description: "Find your products by name, ASIN or SKU across Ads, Stock, purchases and Private label candidates. Use it first when the question names a product in words (\"the seat belt\").",
    input_schema: obj({ query: text("Words from the product's name, or an ASIN / SKU") }, ["query"]) },
  { name: "product_metrics", description: "One ASIN's ad figures (spend, sales, orders, ACoS, break-even ACoS, profit after ads, price, landed cost, Amazon fees) over all imported ad data, plus Amazon orders and revenue per channel between two dates.",
    input_schema: obj({ asin: text("The ASIN"), from: text("First day, YYYY-MM-DD (optional; default 30 days ago)"), to: text("Last day, YYYY-MM-DD (optional; default today)") }, ["asin"]) },
  { name: "stock", description: "Stock items: units per bucket (self-ship, FBA, TikTok), sales per day, days of cover, the reorder point, suggested order and lead time, unit cost; and their purchases (ordered, received, costs).",
    input_schema: obj({ query: text("Words from the item's name, an ASIN or SKU; empty for every item") }) },
  { name: "candidates", description: "Private label candidates: status, Gatekeeper verdict and score, each gate's result, the chosen landed cost and the next launch checklist step.",
    input_schema: obj({ query: text("Words from the candidate's name; empty for all") }) },
  { name: "suppliers", description: "Suppliers: wholesale suppliers (terms, MOV, delivery days, rating), Alibaba leads for candidates (score, status new / contacted / quoted / rejected, when last changed) and quotes (price, MOQ, status).",
    input_schema: obj({ query: text("Words from the supplier's or the candidate's name; empty for all"), status: text("Only leads with this status: new, contacted, quoted or rejected (optional)") }) },
  { name: "proposals", description: "Open Ads proposals waiting for review: the rule, the product, current and proposed value, the reason and confidence.",
    input_schema: obj({ asin: text("Only this ASIN (optional)") }) },
];

/* ===================== the lookups ===================== */

async function findProducts(input: { query?: string }): Promise<ToolResult> {
  const q = str(input.query);
  const asin = q.toUpperCase().match(/\bB0[A-Z0-9]{8}\b|\b\d{9}[\dX]\b/)?.[0] ?? null;
  const d = db();
  const [ads, stock, cands, purchases] = await Promise.all([
    d.from("ads_products").select("asin, title"),
    d.from("stock_items").select("id, sku, name, asin, status").is("archived_at", null),
    d.from("pl_candidates").select("id, name, status, listing_asin"),
    d.from("purchases").select("asin, supplier_name, status").order("ordered_on", { ascending: false }).limit(200),
  ]);
  const out: { asin: string | null; name: string; where: string; href: string }[] = [];
  for (const p of must(ads, "ads products") as { asin: string; title: string | null }[]) {
    if (asin ? p.asin === asin : matches(q, p.title, p.asin)) out.push({ asin: p.asin, name: p.title ?? p.asin, where: "Ads product", href: `/ads/dashboard?asin=${p.asin}` });
  }
  for (const s of must(stock, "stock items") as { id: string; sku: string; name: string; asin: string | null; status: string }[]) {
    if (asin ? s.asin === asin : matches(q, s.name, s.sku, s.asin)) out.push({ asin: s.asin, name: s.name, where: `Stock item (SKU ${s.sku}, ${s.status})`, href: "/stock/levels" });
  }
  for (const c of must(cands, "candidates") as { id: string; name: string; status: string; listing_asin: string | null }[]) {
    if (asin ? c.listing_asin === asin : matches(q, c.name)) out.push({ asin: c.listing_asin, name: c.name, where: `Private label candidate (${c.status})`, href: `/pl/candidates?c=${c.id}` });
  }
  if (asin) for (const p of must(purchases, "purchases") as { asin: string; supplier_name: string | null; status: string }[]) {
    if (p.asin === asin && !out.some((o) => o.where.startsWith("Purchase"))) out.push({ asin, name: asin, where: `Purchase from ${p.supplier_name ?? "a supplier"} (${p.status})`, href: "/stock/purchases" });
  }
  return { data: { query: q, found: out.slice(0, 15), note: out.length ? undefined : "Nothing of yours matches." }, links: out.slice(0, 5).map((o) => ({ label: o.name, href: o.href })) };
}

async function productMetrics(input: { asin?: string; from?: string; to?: string }, now: Date): Promise<ToolResult> {
  const asin = str(input.asin).toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return { data: { error: "An ASIN is needed (10 letters and digits). Use find_products first." }, links: [] };
  const to = isDay(input.to) ? input.to : now.toISOString().slice(0, 10);
  const from = isDay(input.from) ? input.from : new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [dash, sales, prod, item] = await Promise.all([
    adsDashboard([asin]),
    db().from("amazon_sales").select("day, channel, units, orders, revenue").eq("asin", asin).gte("day", from).lte("day", to),
    db().from("ads_products").select("price, landed_cost, fba_fee").eq("asin", asin).maybeSingle(),
    db().from("stock_items").select("name, unit_cost").eq("asin", asin).is("archived_at", null).limit(1),
  ]);
  const p = (prod.data ?? null) as { price: number | null; landed_cost: number | null; fba_fee: number | null } | null;
  const stockItem = ((item.data ?? []) as { name: string; unit_cost: number | null }[])[0];
  const row = dash.asins.find((a) => a.asin === asin);
  const camps = dash.campaigns.filter((c) => c.asin === asin);
  const byChannel = new Map<string, { units: number; orders: number; revenue: number; days: number }>();
  for (const s of must(sales, "amazon sales") as { channel: string; units: number; orders: number; revenue: number }[]) {
    const x = byChannel.get(s.channel) ?? { units: 0, orders: 0, revenue: 0, days: 0 };
    byChannel.set(s.channel, { units: x.units + Number(s.units), orders: x.orders + Number(s.orders), revenue: r2(x.revenue + Number(s.revenue))!, days: x.days + 1 });
  }
  const e = row?.economics;
  return {
    data: {
      asin, title: row?.title ?? dash.looks[asin]?.title ?? null,
      ads: row ? {
        dataFrom: row.from, dataTo: row.to, campaigns: row.campaigns, phase: row.phase, targetAcosPct: pct(row.targetAcos),
        spend: r2(row.totals.cost), sales: r2(row.totals.sales), orders: row.totals.orders, units: row.totals.units, clicks: row.totals.clicks, impressions: row.totals.impressions,
        acosPct: pct(row.ratios.acos), cpc: r2(row.ratios.cpc), conversionPct: pct(row.ratios.conversion),
        profitAfterAds: r2(row.profitAfterAds),
        note: "Ad figures cover every imported report for this ASIN (dataFrom to dataTo), not the dates asked for.",
      } : camps.length ? { campaigns: camps.length, note: "Campaigns exist but no report with figures has been imported for them." } : null,
      unitEconomics: e ? { price: r2(e.price), priceSource: e.priceSource, landedCost: r2(e.landed), amazonFees: r2(e.fees), marginBeforeAdsPct: pct(e.margin), breakEvenAcosPct: pct(e.breakEvenAcos), missing: e.needs }
        // No ad figures yet: what the Ads product and the stock item record.
        : { price: r2(p?.price), landedCost: r2(p?.landed_cost), fbaFee: r2(p?.fba_fee), stockUnitCost: r2(stockItem?.unit_cost), note: "From the Ads product and stock item; fees and break-even ACoS are worked out once ad figures are imported." },
      amazonSales: { from, to, byChannel: Object.fromEntries(byChannel), note: byChannel.size ? undefined : "No Amazon orders recorded for this ASIN in these dates (the SP-API sync fills this)." },
      campaigns: camps.map((c) => ({ name: c.name, state: c.state, spend: r2(c.totals?.cost), sales: r2(c.totals?.sales), acosPct: pct(c.ratios?.acos) })).slice(0, 10),
    },
    links: [{ label: "Ads dashboard", href: `/ads/dashboard?asin=${asin}` }, { label: "Product", href: `/products/${asin}` }],
  };
}

async function stockLookup(input: { query?: string }): Promise<ToolResult> {
  const q = str(input.query);
  const { items } = await stockLevels();
  const hit = items.filter((i) => matches(q, i.item.name, i.item.sku, i.item.asin)).slice(0, 12);
  const ids = hit.map((i) => i.item.id);
  const purchases = ids.length
    ? must(await db().from("purchases").select("stock_item_id, supplier_name, units, unit_cost_gbp, landed_gbp, status, ordered_on, status_dates").in("stock_item_id", ids).order("ordered_on", { ascending: false }).limit(40), "purchases") as Record<string, unknown>[]
    : [];
  return {
    data: {
      query: q, matched: hit.length,
      items: hit.map((i) => ({
        name: i.item.name, sku: i.item.sku, asin: i.item.asin, status: i.item.status, unitCost: r2(i.item.unit_cost),
        units: { ...i.levels, total: i.total }, levelStatus: i.status, salesPerDay: r2(i.reorder.perDay), daysOfCover: r2(i.cover.total),
        reorder: { status: i.reorder.status, reorderPoint: r2(i.reorder.reorderPoint), suggestedQty: i.reorder.suggestedQty, daysToReorder: r2(i.reorder.daysToReorder), leadTimeDays: i.reorder.leadTimeDays, leadTimeFrom: i.reorder.leadFrom },
        purchases: purchases.filter((p) => p.stock_item_id === i.item.id).slice(0, 5).map((p) => ({ supplier: p.supplier_name, units: p.units, supplierPrice: r2(p.unit_cost_gbp as number | null), landed: r2(p.landed_gbp as number | null), status: p.status, orderedOn: p.ordered_on, dates: p.status_dates })),
      })),
      note: hit.length ? undefined : q ? "No stock item matches." : "No stock items yet.",
    },
    links: [{ label: "Stock levels", href: "/stock/levels" }, { label: "Reorder", href: "/stock/reorder" }, { label: "Purchases", href: "/stock/purchases" }],
  };
}

async function candidatesLookup(input: { query?: string }): Promise<ToolResult> {
  const q = str(input.query);
  const { candidates, settings, card, adsCpc } = await listCandidates();
  const hit = candidates.filter((c) => matches(q, c.name, c.niche_keyword)).slice(0, 10);
  const steps = hit.length ? must(await db().from("pl_launch_steps").select("candidate_id, step, done, done_on").in("candidate_id", hit.map((c) => c.id)), "launch steps") as { candidate_id: string; step: string; done: boolean; done_on: string | null }[] : [];
  return {
    data: {
      query: q,
      candidates: hit.map((c) => {
        const e = evaluate(withAdsDefaults(Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.value])), adsCpc), c.category, settings, card, new Date(), c.waivers);
        const done = steps.filter((s) => s.candidate_id === c.id && s.done);
        return {
          name: c.name, status: c.status, parkReason: c.park_reason ?? null, verdict: e.v.title, verdictClass: e.v.cls, score: e.sc.total, scoreLinesIn: e.sc.answered,
          gates: e.gates.map((g) => `Gate ${g.g.n} ${g.g.title}: ${g.status}`), chosenLanded: r2(c.chosen_landed),
          launch: { done: done.map((s) => `${LAUNCH_STEPS.find((l) => l.key === s.step)?.label ?? s.step}${s.done_on ? ` (${s.done_on})` : ""}`), next: c.launch.next },
          href: `/pl/candidates?c=${c.id}`,
        };
      }),
      note: hit.length ? undefined : "No candidate matches.",
    },
    links: hit.slice(0, 4).map((c) => ({ label: c.name, href: `/pl/candidates?c=${c.id}` })),
  };
}

async function suppliersLookup(input: { query?: string; status?: string }): Promise<ToolResult> {
  const q = str(input.query);
  const status = ["new", "contacted", "quoted", "rejected"].includes(str(input.status)) ? str(input.status) : null;
  const d = db();
  const [sup, cands, quotes] = await Promise.all([
    d.from("suppliers").select("id, name, kind, mov, currency, delivery_days, rating, notes"),
    d.from("pl_candidates").select("id, name"),
    d.from("pl_quotes").select("candidate_id, supplier_name, unit_price, currency, moq, lead_time_days, status, updated_at"),
  ]);
  const candName = new Map((must(cands, "candidates") as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const leads = await selectAll<{ candidate_id: string; supplier_name: string | null; title: string | null; score: number | null; status: string; price_min: number | null; price_max: number | null; currency: string | null; moq: number | null; updated_at: string; listing_url: string }>(
    "pl_supplier_leads", "candidate_id, supplier_name, title, score, status, price_min, price_max, currency, moq, updated_at, listing_url", ["id"]);
  const wholesale = (must(sup, "suppliers") as { id: string; name: string; kind: string | null; mov: number | null; currency: string; delivery_days: number | null; rating: number | null }[])
    .filter((s) => matches(q, s.name)).slice(0, 15);
  const lead = leads.filter((l) => (!status || l.status === status) && matches(q, l.supplier_name, l.title, candName.get(l.candidate_id)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 25);
  const qs = (must(quotes, "quotes") as { candidate_id: string; supplier_name: string; unit_price: number | null; currency: string; moq: number | null; lead_time_days: number | null; status: string; updated_at: string }[])
    .filter((x) => matches(q, x.supplier_name, candName.get(x.candidate_id))).slice(0, 15);
  return {
    data: {
      query: q, statusFilter: status,
      wholesaleSuppliers: status ? `Not listed: the status filter is for Alibaba leads (${wholesale.length} wholesale suppliers match the query)` : wholesale.map((s) => ({ name: s.name, kind: s.kind, mov: r2(s.mov), currency: s.currency, deliveryDays: s.delivery_days, rating: s.rating, href: `/suppliers/${s.id}` })),
      alibabaLeads: lead.map((l) => ({ supplier: l.supplier_name, candidate: candName.get(l.candidate_id) ?? null, score: r2(l.score), status: l.status, lastChanged: l.updated_at.slice(0, 10), price: l.price_min == null ? null : `${r2(l.price_min)}–${r2(l.price_max ?? l.price_min)} ${l.currency ?? "(currency not captured)"}`, moq: l.moq })),
      leadCounts: { total: leads.length, ...Object.fromEntries(["new", "contacted", "quoted", "rejected"].map((s) => [s, leads.filter((l) => l.status === s).length])) },
      quotes: qs.map((x) => ({ supplier: x.supplier_name, candidate: candName.get(x.candidate_id) ?? null, unitPrice: r2(x.unit_price), currency: x.currency, moq: x.moq, leadTimeDays: x.lead_time_days, status: x.status, lastChanged: x.updated_at.slice(0, 10) })),
      note: "A lead's status is set by you on Suppliers & quotes: 'contacted' means messaged with no quote recorded yet.",
    },
    links: [{ label: "Suppliers & quotes", href: "/pl/suppliers" }, { label: "Quotes", href: "/pl/suppliers?tab=quotes" }, { label: "Wholesale suppliers", href: "/suppliers" }],
  };
}

async function proposalsLookup(input: { asin?: string }): Promise<ToolResult> {
  const asin = str(input.asin).toUpperCase();
  let q = db().from("ads_proposals").select("asin, rule, campaign_name, entity, current_value, proposed_value, reason, confidence, clicks, orders, created_at").eq("status", "open").order("created_at");
  if (asin) q = q.eq("asin", asin);
  const rows = must(await q.limit(50), "proposals") as { asin: string | null; rule: string; campaign_name: string | null; entity: { label?: string } | null; current_value: string | null; proposed_value: string | null; reason: string; confidence: string; clicks: number; orders: number; created_at: string }[];
  return {
    data: {
      open: rows.length,
      proposals: rows.map((p) => ({ rule: RULE_LABEL[p.rule as RuleId] ?? p.rule, asin: p.asin, campaign: p.campaign_name, target: p.entity?.label ?? null, current: p.current_value, proposed: p.proposed_value, reason: p.reason, confidence: p.confidence, clicks: p.clicks, orders: p.orders, raised: p.created_at.slice(0, 10) })),
    },
    links: [{ label: "Proposals", href: "/ads/proposals?tab=review" }],
  };
}

/** Run one tool by name; an unknown name or a failure comes back as an error for the model to see. */
export async function runTool(name: string, input: Record<string, unknown>, now = new Date()): Promise<ToolResult> {
  try {
    switch (name) {
      case "find_products": return await findProducts(input);
      case "product_metrics": return await productMetrics(input, now);
      case "stock": return await stockLookup(input);
      case "candidates": return await candidatesLookup(input);
      case "suppliers": return await suppliersLookup(input);
      case "proposals": return await proposalsLookup(input);
      default: return { data: { error: `No tool called ${name}` }, links: [] };
    }
  } catch (e) {
    return { data: { error: `Couldn't read that: ${(e as Error).message}` }, links: [] };
  }
}
