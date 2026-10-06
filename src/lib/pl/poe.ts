/**
 * Product Opportunity Explorer: Gate 3 and Gate 5 from a niche the extension captured: the
 * getNiche GraphQL response (exactly that operation; the niche is at data.niche, with
 * nicheSummary, searchTermMetrics, asinMetrics and trendsMetrics), every other /ox-api/graphql
 * response on the same niche page (tabs load their data lazily), and the insights widget's.
 *
 * Seller Central's field names aren't documented and can change, so this reads by name pattern
 * rather than by fixed path: the 360-day figure is preferred where several windows are present,
 * shares and rates given as fractions become percentages, and volumes over 90 or 360 days become
 * a month's. The raw payload is kept on the snapshot, so a later fix here can re-read it.
 */
import { bestTermConversion } from "./termConversion";

export interface PoeTerm { term: string; volume: number; click_share: number | null; conversion: number | null }

export interface PoeExtract {
  niche_title: string | null;
  niche_id: string | null;
  search_volume_360: number | null;
  /**
   * Search volume growth, %: Gate 3's input. Opportunity Explorer's "Growth past 180 days"
   * (searchVolumeGrowthT180); else its 90-day figure; else derived from the weekly trend (the last
   * 52 weeks' search volume against the 52 before). See search_volume_growth_source.
   */
  search_volume_growth: number | null;
  search_volume_growth_source: "t180" | "t90" | "trends" | null;
  /** "Growth past 90 days" (searchVolumeGrowthT90), %. */
  search_volume_growth_90: number | null;
  /** searchVolumeGrowthT360, % (Opportunity Explorer doesn't display it). */
  search_volume_growth_360: number | null;
  products_in_niche: number | null;
  /** Click share of the top 3 products, %. */
  top3_click_share: number | null;
  /** Search conversion rate, %. */
  search_conversion: number | null;
  /**
   * Where search_conversion came from: the niche's own figure; its weekly trend (the last 52 weeks'
   * searchConversionRateT7, weighted by each week's searchVolumeT7); or, failing both, its search
   * terms (searchConversionRateT360 weighted by searchVolumeT360). The last two are derived.
   */
  search_conversion_source: "niche" | "trends" | "terms" | null;
  /** Average units sold per product, a month. */
  avg_units_per_product: number | null;
  /** Monthly search volume per term. */
  search_terms: PoeTerm[];
}

type Leaf = { path: string[]; key: string; value: unknown };

function leaves(x: unknown, path: string[] = [], out: Leaf[] = [], depth = 0): Leaf[] {
  if (depth > 12 || x == null || typeof x !== "object") return out;
  if (Array.isArray(x)) {
    x.forEach((v, i) => leaves(v, [...path, String(i)], out, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    out.push({ path: [...path, k], key: k, value: v });
    leaves(v, [...path, k], out, depth + 1);
  }
  return out;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?[\d.,]+%?$/.test(v.trim())) {
    const n = Number(v.replace(/[,%]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === "object" && "value" in v) return toNum((v as { value: unknown }).value);
  return null;
};

/** Fractions (0–1) to %, leaving values already in % alone. */
const asPct = (n: number | null) => (n == null ? null : Math.abs(n) <= 1 ? n * 100 : n);
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/** Per month from a window named in the key (T360, T90, …). */
function monthly(key: string, n: number): number {
  if (/360|365|annual|year/i.test(key)) return n / 12;
  if (/180/.test(key)) return n / 6;
  if (/90|quarter/i.test(key)) return n / 3;
  if (/\b7\b|T7|week/i.test(key)) return (n * 30) / 7;
  return n;
}

/**
 * The first numeric leaf (outside per-term and per-product lists) whose key matches, trying the
 * patterns in order. Leaves inside arrays belong to rows (terms, products), not to the niche.
 */
function pick(ls: Leaf[], patterns: RegExp[]): { key: string; n: number } | null {
  const niche = ls.filter((l) => !l.path.some((p) => /^\d+$/.test(p)));
  for (const re of patterns) {
    for (const l of niche) {
      const n = toNum(l.value);
      if (n != null && re.test(l.key)) return { key: l.key, n };
    }
  }
  return null;
}

function pickString(ls: Leaf[], patterns: RegExp[]): string | null {
  for (const re of patterns) {
    // Not from inside a list (a product's or a term's name isn't the niche's).
    const hit = ls.filter((l) => typeof l.value === "string" && re.test(l.key) && (l.value as string).trim() && !l.path.some((p) => /^\d+$/.test(p)))
      .sort((a, b) => a.path.length - b.path.length)[0];
    if (hit) return (hit.value as string).trim();
  }
  return null;
}

/** Arrays of objects: the search-term table, and the product list (for top-3 click share). */
function rowArrays(x: unknown, out: Record<string, unknown>[][] = [], depth = 0): Record<string, unknown>[][] {
  if (depth > 12 || x == null || typeof x !== "object") return out;
  if (Array.isArray(x)) {
    if (x.length && x.every((v) => v && typeof v === "object" && !Array.isArray(v))) out.push(x as Record<string, unknown>[]);
    for (const v of x) rowArrays(v, out, depth + 1);
    return out;
  }
  for (const v of Object.values(x as Record<string, unknown>)) rowArrays(v, out, depth + 1);
  return out;
}

/** A row's value for the first key matching any pattern (in pattern order), with that key. */
function field(row: Record<string, unknown>, patterns: RegExp[]): { key: string; n: number } | null {
  const flat = leaves(row).filter((l) => l.path.length <= 2);
  for (const re of patterns) {
    for (const l of flat) {
      const n = toNum(l.value);
      if (n != null && re.test(l.key)) return { key: l.key, n };
    }
  }
  return null;
}

const VOLUME = [/searchVolume.*(T360|360)/i, /searchVolume.*(T90|90)/i, /searchVolume/i, /^volume$/i];
const CLICK = [/clickShare.*(T360|360)/i, /clickShare/i];
const CONV = [/conversion.*(T360|360)/i, /conversion/i];

function searchTerms(arrays: Record<string, unknown>[][]): PoeTerm[] {
  const termKey = (row: Record<string, unknown>) => Object.keys(row).find((k) => /^(searchTerm|searchQuery|query|keyword|term)(Text|Name)?$/i.test(k) && typeof row[k] === "string");
  const table = arrays.filter((a) => a.filter((r) => termKey(r) && field(r, VOLUME)).length >= Math.max(1, a.length / 2))
    .sort((a, b) => b.length - a.length)[0];
  if (!table) return [];
  const out: PoeTerm[] = [];
  for (const row of table) {
    const k = termKey(row), v = field(row, VOLUME);
    if (!k || !v) continue;
    const cs = field(row, CLICK), cv = field(row, CONV);
    out.push({ term: String(row[k]).trim(), volume: Math.round(monthly(v.key, v.n)), click_share: r1(asPct(cs?.n ?? null)), conversion: r1(asPct(cv?.n ?? null)) });
  }
  return out.sort((a, b) => b.volume - a.volume);
}

/** Top-3 click share from a product list, when the niche doesn't state it. */
function top3FromProducts(arrays: Record<string, unknown>[][]): number | null {
  const products = arrays.filter((a) => a.some((r) => Object.keys(r).some((k) => /asin/i.test(k))) && a.some((r) => field(r, CLICK)))
    .sort((a, b) => b.length - a.length)[0];
  if (!products) return null;
  const shares = products.map((r) => asPct(field(r, CLICK)?.n ?? null)).filter((n): n is number => n != null).sort((a, b) => b - a);
  return shares.length ? r1(shares.slice(0, 3).reduce((a, b) => a + b, 0)) : null;
}

/**
 * The niche's search conversion when Amazon doesn't state it: from its weekly trend (the niche's own
 * figure, week by week: the last 52 weeks weighted by search volume); else from its search terms
 * (each term's 360-day conversion weighted by its 360-day volume). Both are percentages.
 */
function derivedConversion(arrays: Record<string, unknown>[][], terms: PoeTerm[]): { pct: number | null; source: "trends" | "terms" } | null {
  const weekly = arrays.find((a) => a.length >= 4 && a.every((r) => field(r, [/^searchConversionRateT7$/i]) && field(r, [/^searchVolumeT7$/i])));
  if (weekly) {
    const date = (r: Record<string, unknown>) => String(r.datasetDate ?? r.startDate ?? r.weekStartDate ?? "");
    const last = [...weekly].sort((a, b) => date(a).localeCompare(date(b))).slice(-52);
    let num = 0, den = 0;
    for (const r of last) {
      const v = field(r, [/^searchVolumeT7$/i])!.n, c = field(r, [/^searchConversionRateT7$/i])!.n;
      if (v > 0) { num += v * c; den += v; }
    }
    if (den > 0) return { pct: r1(asPct(num / den)), source: "trends" };
  }
  const known = terms.filter((t) => t.conversion != null && t.volume > 0);
  if (known.length) {
    const den = known.reduce((a, t) => a + t.volume, 0);
    return { pct: r1(known.reduce((a, t) => a + t.volume * t.conversion!, 0) / den), source: "terms" };
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Weekly trend rows (trendsMetrics): searchVolumeT7 by datasetDate, oldest first. */
function weeklyRows(arrays: Record<string, unknown>[][]): Record<string, unknown>[] | null {
  const weekly = arrays.find((a) => a.length >= 4 && a.every((r) => field(r, [/^searchVolumeT7$/i])));
  if (!weekly) return null;
  const date = (r: Record<string, unknown>) => String(r.datasetDate ?? r.startDate ?? r.weekStartDate ?? "");
  return [...weekly].sort((a, b) => date(a).localeCompare(date(b)));
}

/** Growth from the weekly trend: the last 52 weeks' search volume against the 52 before, %. Needs 104 weeks. */
function weeklyGrowth(arrays: Record<string, unknown>[][]): number | null {
  const rows = weeklyRows(arrays);
  if (!rows || rows.length < 104) return null;
  const sum = (xs: Record<string, unknown>[]) => xs.reduce((a, r) => a + field(r, [/^searchVolumeT7$/i])!.n, 0);
  const prev = sum(rows.slice(-104, -52));
  return prev > 0 ? r2((sum(rows.slice(-52)) / prev - 1) * 100) : null;
}

/** What the extension sends: getNiche's response, every ox-api response on the page by operation, the insights widget's. */
export interface PoeRaw { niche?: unknown; operations?: Record<string, unknown>; growth?: unknown; seen?: string[] }

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : null);

/** The niche object in a getNiche response (data.niche); older test shapes (data.getNiche) too. */
export function nicheOf(x: unknown): unknown {
  const d = obj(obj(x)?.data) ?? obj(x);
  if (!d) return null;
  if ("niche" in d) return d.niche ?? null;
  if ("getNiche" in d) return d.getNiche ?? null;
  // A list operation (getNiches and the like) isn't a niche.
  if (Object.values(d).some(Array.isArray) && Object.keys(d).length === 1) return null;
  return d;
}

export function extractPoe(raw: PoeRaw | unknown, hint: { nicheId?: string | null; title?: string | null } = {}): PoeExtract {
  const body: PoeRaw = obj(raw) && ("niche" in obj(raw)! || "growth" in obj(raw)! || "operations" in obj(raw)!) ? (raw as PoeRaw) : { niche: raw };
  // The niche's own figures come only from getNiche's niche object, never from other operations' lists.
  const niche = nicheOf(body.niche) ?? nicheOf(body.operations?.getNiche);
  const ls = leaves(niche);
  const gls = leaves(body.growth);
  // Search terms can arrive in a later operation (the Search terms tab): look there too.
  const others = Object.entries(body.operations ?? {}).filter(([op]) => op !== "getNiche").map(([, v]) => v);
  const arrays = [...rowArrays(niche), ...others.flatMap((o) => rowArrays(o))];

  const sv = pick(ls, [/searchVolume.*(T360|360)/i, /searchVolume.*(T365|annual|year)/i]);
  // Growth fields are fractions (0.0592 is the +5.92% Opportunity Explorer shows), whatever their size.
  const g = (w: string) => pick(ls, [new RegExp(`^searchVolumeGrowthT${w}$`, "i")]) ?? pick(gls, [new RegExp(`^searchVolumeGrowthT${w}$`, "i")]);
  const g180 = g("180"), g90 = g("90"), g360 = g("360");
  const trendGrowth = g180 || g90 ? null : weeklyGrowth(arrays);
  const growth = g180 ? { pct: r2(g180.n * 100), source: "t180" as const } : g90 ? { pct: r2(g90.n * 100), source: "t90" as const } : trendGrowth != null ? { pct: trendGrowth, source: "trends" as const } : null;
  const products = pick(ls, [/^productCount$/i, /(numberOf|num|total)Products/i, /productsInNiche/i, /productCount/i]);
  const top3 = pick(ls, [/top_?3.*clickShare/i, /clickShare.*top_?3/i, /topThree.*clickShare/i]);
  // Only search conversion: nicheSummary's purchaseConversionRatePostLaunch90d is a different
  // measure (newly launched products), so a bare "conversionRate" isn't taken.
  const convNiche = pick(ls, [/^searchConversionRate.*(T360|360)$/i, /^searchConversionRate$/i]);
  const terms = searchTerms(arrays);
  const conv = convNiche ? { pct: r1(asPct(convNiche.n)), source: "niche" as const } : derivedConversion(arrays, terms);
  // Amazon gives units per product as a yearly range (minimum/maximumAverageUnitsSoldT360): its midpoint.
  const uMin = pick(ls, [/^minimum(Average|Avg)UnitsSold.*(T360|360)$/i]), uMax = pick(ls, [/^maximum(Average|Avg)UnitsSold.*(T360|360)$/i]);
  const units = uMin && uMax ? { key: uMax.key, n: (uMin.n + uMax.n) / 2 }
    : pick(ls, [/^(avg|average)UnitsSold.*(T360|360)/i, /^(avg|average)UnitsSold/i, /unitsSoldPerProduct/i, /(avg|average)UnitsSold.*(T360|360)/i, /(avg|average)Units/i]);

  return {
    niche_title: hint.title?.trim() || pickString(ls, [/^nicheTitle$/i, /^(niche)?(title|displayName|name)$/i]),
    niche_id: hint.nicheId || pickString(ls, [/^nicheId$/i, /^id$/i]),
    search_volume_360: sv ? Math.round(sv.n) : null,
    search_volume_growth: growth?.pct ?? null,
    search_volume_growth_source: growth?.source ?? null,
    search_volume_growth_90: g90 ? r2(g90.n * 100) : null,
    search_volume_growth_360: g360 ? r2(g360.n * 100) : null,
    products_in_niche: products ? Math.round(products.n) : null,
    top3_click_share: top3 ? r1(asPct(top3.n)) : top3FromProducts(arrays),
    search_conversion: conv?.pct ?? null,
    search_conversion_source: conv?.pct != null ? conv.source : null,
    avg_units_per_product: units ? Math.round(monthly(units.key, units.n)) : null,
    search_terms: terms,
  };
}

/** The eight things read from a capture, by name, for saying which weren't found. */
export const POE_FIELDS: { label: string; read: (x: PoeExtract) => boolean }[] = [
  { label: "niche title", read: (x) => !!x.niche_title },
  { label: "search volume", read: (x) => x.search_volume_360 != null },
  { label: "search volume growth", read: (x) => x.search_volume_growth != null },
  { label: "products in niche", read: (x) => x.products_in_niche != null },
  { label: "top-3 click share", read: (x) => x.top3_click_share != null },
  { label: "search conversion", read: (x) => x.search_conversion != null },
  { label: "units per product", read: (x) => x.avg_units_per_product != null },
  { label: "search terms", read: (x) => x.search_terms.length > 0 },
];

export const unreadFields = (x: PoeExtract) => POE_FIELDS.filter((f) => !f.read(x)).map((f) => f.label);

/** Gatekeeper's growth select from the growth %: under −5% declining, over +5% growing. */
export const growthBand = (g: number | null): "declining" | "flat" | "growing" | null =>
  g == null ? null : g < -5 ? "declining" : g > 5 ? "growing" : "flat";

/** Gate 3 and the Gate 5 fields Opportunity Explorer carries (bids aren't in it). */
/** A value from a capture; `source: "poe_derived"` when worked out rather than read off it. */
export interface PoeFilled { value: string; why: string; source?: "poe_derived" }

const CONV_WHY = {
  niche: "the niche's own figure",
  trends: "derived: the niche's weekly search conversion over the last 52 weeks, weighted by each week's search volume (Amazon gives no 360-day figure)",
  terms: "derived: its search terms' 360-day conversion, weighted by each term's 360-day search volume (Amazon gives no niche figure or weekly trend)",
};

export function poeFill(x: PoeExtract): Record<string, PoeFilled> {
  const out: Record<string, PoeFilled> = {};
  const src = `Opportunity Explorer${x.niche_title ? `: ${x.niche_title}` : ""}`;
  if (x.search_volume_360 != null) out.sv360 = { value: String(x.search_volume_360), why: src };
  const g = growthBand(x.search_volume_growth);
  if (g) {
    const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
    const g90 = x.search_volume_growth_90 != null ? ` · past 90 days ${pct(x.search_volume_growth_90)}` : "";
    const why = x.search_volume_growth_source === "trends"
      ? `${pct(x.search_volume_growth!)} derived: the last 52 weeks' search volume against the 52 before (Opportunity Explorer gave no growth figure; ±5% is flat)`
      : `${pct(x.search_volume_growth!)} past ${x.search_volume_growth_source === "t90" ? "90" : "180"} days (Opportunity Explorer; ±5% is flat)${x.search_volume_growth_source === "t180" ? g90 : ""}`;
    out.svGrowth = { value: g, why, ...(x.search_volume_growth_source === "trends" ? { source: "poe_derived" as const } : {}) };
  }
  if (x.products_in_niche != null) out.products = { value: String(x.products_in_niche), why: src };
  if (x.top3_click_share != null) out.clickShare = { value: String(x.top3_click_share), why: src };
  if (x.search_conversion != null) {
    const how = x.search_conversion_source ?? "niche";
    out.conv = { value: String(x.search_conversion), why: `${src}, ${CONV_WHY[how]}`, ...(how === "niche" ? {} : { source: "poe_derived" as const }) };
  }
  if (x.avg_units_per_product != null) out.unitsPer = { value: String(x.avg_units_per_product), why: src };
  if (x.search_terms.length) {
    const lt = x.search_terms.filter((t) => t.volume >= 300 && t.volume <= 2000);
    out.longtail = { value: String(lt.length), why: `${lt.length} of ${x.search_terms.length} search terms with 300–2,000 searches a month` };
    const bt = bestTermConversion(x.search_terms);
    if (bt) out.bestTermConv = { value: String(bt.conversion), why: `"${bt.term}", the best of ${x.search_terms.length} search terms' 360-day conversion (Opportunity Explorer)` };
    const head = x.search_terms[0];
    out.headVol = { value: String(head.volume), why: `"${head.term}", the niche's top search term` };
  }
  return out;
}

/** A search term's #1–#3 clicked product, from a capture. */
export interface PoeTopClicked { asin: string; term: string; rank: number }

/**
 * Every captured search term's #1, #2 and #3 clicked ASINs (searchTermMetrics[].topClickedProducts),
 * once each: an ASIN keeps its best rank (then the first term it's under, in the capture's order).
 * At most `max`, best ranks first.
 */
export function poeTopClicked(raw: unknown, max = 30): PoeTopClicked[] {
  const lists: Record<string, unknown>[][] = [];
  const find = (x: unknown, depth = 0) => {
    if (depth > 10 || !x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach((v) => find(v, depth + 1)); return; }
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (k === "searchTermMetrics" && Array.isArray(v) && v.some((t) => t && typeof t === "object" && "topClickedProducts" in t)) lists.push(v as Record<string, unknown>[]);
      else find(v, depth + 1);
    }
  };
  find(raw);
  const best = new Map<string, PoeTopClicked & { order: number }>();
  let order = 0;
  // The niche's own getNiche response first (the capture stores it twice: niche and operations).
  for (const terms of lists.slice(0, 1)) {
    for (const t of terms) {
      const term = typeof t.searchTerm === "string" ? t.searchTerm : "";
      const prods = Array.isArray(t.topClickedProducts) ? (t.topClickedProducts as { asin?: unknown }[]) : [];
      prods.slice(0, 3).forEach((p, i) => {
        const asin = typeof p?.asin === "string" ? p.asin.trim().toUpperCase() : "";
        if (!/^[A-Z0-9]{10}$/.test(asin)) return;
        const cur = best.get(asin);
        if (!cur || i + 1 < cur.rank) best.set(asin, { asin, term, rank: i + 1, order: cur?.order ?? order++ });
      });
    }
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, max).map(({ asin, term, rank }) => ({ asin, term, rank }));
}
