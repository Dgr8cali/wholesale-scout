/**
 * Supplier Scout's score: 0–100 for one Alibaba listing against the candidate's targets, so only the
 * top few get messaged. Price against the target ex-works price (35), MOQ against the most you'll
 * order (20), how far the supplier can be trusted (25), and whether the listing is the product (20).
 * Flags mark what to check; they never zero the score. Pure.
 */

export interface LeadInput {
  title: string | null;
  priceMin: number | null; priceMax: number | null; currency: string | null;
  /** The unit the price is per ("box"), as listed or taken from the MOQ's unit. */
  priceUnit: string | null;
  moq: number | null; moqUnit: string | null;
  supplierName: string | null; supplierYears: number | null;
  rating: number | null; reviewCount: number | null;
  badges: string[];
}

export interface SupplierTargets {
  /** Target ex-works price per unit of our product, £ (null: no landed cost yet). */
  exworks: number | null;
  /** The most units of our product we'd order first. */
  maxMoq: number;
  /** What one unit of our product is: box, piece, set, pack or bag. */
  unit: string;
  /** The product's words (the candidate's name and niche keyword). */
  words: string[];
}

export type SupplierFlag = "NOT_FACTORY" | "UNIT_UNCLEAR" | "MOQ_TOO_HIGH" | "OFF_PRODUCT" | "HIGH_PRICE";
export const SUPPLIER_FLAGS: SupplierFlag[] = ["NOT_FACTORY", "UNIT_UNCLEAR", "MOQ_TOO_HIGH", "OFF_PRODUCT", "HIGH_PRICE"];
export const SUPPLIER_FLAG_LABEL: Record<SupplierFlag, string> = {
  NOT_FACTORY: "Not a factory?", UNIT_UNCLEAR: "Unit unclear", MOQ_TOO_HIGH: "MOQ too high", OFF_PRODUCT: "Off product", HIGH_PRICE: "High price",
};
/** Hidden in the default view. */
export const DEFAULT_HIDDEN_SUPPLIER_FLAGS: SupplierFlag[] = ["OFF_PRODUCT"];

export interface ScorePart { points: number; max: number; note: string }
export interface SupplierScore {
  score: number;
  breakdown: { price: ScorePart; moq: ScorePart; trust: ScorePart; relevance: ScorePart };
  flags: SupplierFlag[];
  /** The listing's price per unit of our product, £ (null when the unit or currency isn't clear). */
  perUnit: number | null;
  /** The MOQ in units of our product (the listing's own when it can't be converted). */
  moqOurs: number | null;
}

/** Words that mean the listing is another product (unless the candidate's own words have them). */
export const REJECT_WORDS = ["cloth", "spray", "bottle", "machine", "raw material", "roll", "jumbo"];
/** Rejected only when the title doesn't also have every product word: a microfibre-only product. */
const REJECT_UNLESS_FULL = ["microfiber", "microfibre"];
const STOP = new Set(["a", "an", "and", "the", "for", "of", "with", "to", "in", "on", "by", "set", "pack", "box"]);

/** A unit our product is sold in (a container), and one a listing may price a single item in. */
const CONTAINER = new Set(["box", "pack", "set", "packet", "carton", "bag-of"]);
const SINGLE = new Set(["piece", "bag", "sachet", "unit", "sheet", "wipe", "pair"]);
const SAME: Record<string, string> = { packet: "pack", pcs: "piece", pc: "piece", unit: "piece" };
const norm = (u: string | null | undefined) => (u ? SAME[u.toLowerCase()] ?? u.toLowerCase() : null);

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
/** "wipe" and "wipes", "box" and "boxes": the same word. */
const sameWord = (a: string, b: string) => a === b || a === `${b}s` || a === `${b}es` || b === `${a}s` || b === `${a}es`;
const plural = (u: string) => (/(x|s|ch|sh)$/.test(u) ? `${u}es` : `${u}s`);
const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The candidate's product words: its name and niche keyword, without stop words, singular. */
export function productWords(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const w of texts.flatMap((t) => (t ? words(t) : []))) if (!STOP.has(w) && !/^\d+$/.test(w) && !out.some((x) => sameWord(x, w))) out.push(w);
  return out;
}

/**
 * How many items one listing unit holds, from the title ("200pcs", "100 pieces", "pack of 50",
 * "50/box"): the count when there's exactly one, null when none or several ("100 200 400pcs").
 */
export function titleCount(title: string | null): number | null {
  if (!title) return null;
  const t = title.toLowerCase();
  const found = new Set<number>();
  const re = /((?:\d[\d,]*\s*[/,]?\s+)*)(\d[\d,]*)\s*(?:pcs|pc|pieces|count|ct|sheets|wipes|sachets|bags)\b/g;
  for (const m of t.matchAll(re)) {
    // "100 200 400pcs": a choice of counts, not one.
    if (/\d/.test(m[1])) return null;
    found.add(Number(m[2].replace(/,/g, "")));
  }
  for (const m of t.matchAll(/pack of (\d[\d,]*)|(\d[\d,]*)\s*(?:\/|per)\s*(?:box|pack|bag|set)\b/g)) found.add(Number((m[1] ?? m[2]).replace(/,/g, "")));
  return found.size === 1 ? [...found][0] : null;
}

/**
 * The listing's price per unit of our product: the same unit as ours; a single item (piece, bag)
 * times the title's count when ours is a box, pack or set; a box divided by the count when ours is
 * a piece. Prices at the MOQ (the top of a range). Null, with why, when it can't be told.
 */
export function pricePerOurUnit(l: LeadInput, ours: string): { perUnit: number | null; factor: number | null; why: string } {
  const price = l.priceMax ?? l.priceMin;
  if (price == null) return { perUnit: null, factor: null, why: "no price" };
  if (l.currency && l.currency !== "GBP") return { perUnit: null, factor: null, why: `priced in ${l.currency}` };
  const theirs = norm(l.priceUnit ?? l.moqUnit), mine = norm(ours);
  if (!theirs || !mine) return { perUnit: null, factor: null, why: "the listing's unit isn't shown" };
  if (theirs === mine) return { perUnit: price, factor: 1, why: `per ${mine}, as ours` };
  const n = titleCount(l.title);
  if (n && SINGLE.has(theirs) && CONTAINER.has(mine)) return { perUnit: price * n, factor: n, why: `£${price} a ${theirs} × ${n} in the title` };
  if (n && CONTAINER.has(theirs) && SINGLE.has(mine)) return { perUnit: price / n, factor: 1 / n, why: `£${price} a ${theirs} ÷ ${n} in the title` };
  return { perUnit: null, factor: null, why: `per ${theirs}, ours is a ${mine}${n ? "" : ", and no single count in the title"}` };
}

const FACTORY = /manufactur|factory|\bfty\b|\boem\b|industr/i;
const TRADER = /trading|\btrade\b|import|export|commerce|supply chain|e-?commerce/i;

/** The score, its parts, the flags, and the price and MOQ in units of our product. */
export function scoreSupplier(l: LeadInput, t: SupplierTargets): SupplierScore {
  const flags = new Set<SupplierFlag>();

  // Price (35): full at or under the target, nothing at twice it.
  const conv = pricePerOurUnit(l, t.unit);
  let price: ScorePart;
  if (conv.perUnit == null) {
    flags.add("UNIT_UNCLEAR");
    price = { points: 17.5, max: 35, note: `Half: ${conv.why}` };
  } else if (t.exworks == null || t.exworks <= 0) {
    price = { points: 17.5, max: 35, note: `£${conv.perUnit.toFixed(2)} a ${t.unit}; no target ex-works price yet (Gate 0's landed cost ÷ 1.4, or Gate 6's target)` };
  } else {
    const ratio = conv.perUnit / t.exworks;
    if (ratio > 1) flags.add("HIGH_PRICE");
    price = { points: r1(35 * clamp01(2 - ratio)), max: 35, note: `£${conv.perUnit.toFixed(2)} a ${t.unit} (${conv.why}) against £${t.exworks.toFixed(2)}: full at the target, nothing at twice it` };
  }

  // MOQ (20): full at or under the most we'd order, nothing at five times it.
  const moqOurs = l.moq == null ? null : conv.factor != null && conv.factor !== 1 ? Math.ceil(l.moq / conv.factor) : l.moq;
  let moq: ScorePart;
  if (moqOurs == null) moq = { points: 10, max: 20, note: "Half: no MOQ shown" };
  else {
    if (moqOurs > t.maxMoq) flags.add("MOQ_TOO_HIGH");
    const over = (moqOurs - t.maxMoq) / (4 * t.maxMoq);
    const unitWord = conv.factor != null ? ` ${plural(t.unit)}` : ` ${plural(norm(l.moqUnit) ?? "unit")} (theirs)`;
    moq = { points: r1(20 * clamp01(1 - over)), max: 20, note: `${moqOurs.toLocaleString("en-GB")}${unitWord} against at most ${t.maxMoq.toLocaleString("en-GB")}: full up to it, nothing at 5×` };
  }

  // Trust (25): years, rating, reviews, Verified, Trade Assurance; Verified Pro and Guaranteed add a little.
  const has = (b: string) => l.badges.includes(b);
  const parts: [string, number][] = [
    ["5+ years", l.supplierYears == null ? 0 : l.supplierYears >= 5 ? 6 : l.supplierYears >= 3 ? 3 : 0],
    ["rating 4.7+", l.rating == null ? 0 : l.rating >= 4.7 ? 5 : l.rating >= 4.5 ? 2.5 : 0],
    ["10+ reviews", l.reviewCount == null ? 0 : l.reviewCount >= 10 ? 4 : l.reviewCount >= 3 ? 2 : 0],
    ["Verified", has("Verified") || has("Verified Pro") ? 5 : 0],
    ["Trade Assurance", has("Trade Assurance") ? 5 : 0],
    ["Verified Pro", has("Verified Pro") ? 2 : 0],
    ["Alibaba Guaranteed", has("Alibaba Guaranteed") ? 2 : 0],
  ];
  const trustRaw = parts.reduce((a, [, p]) => a + p, 0);
  const trust: ScorePart = {
    points: r1(Math.min(25, trustRaw)), max: 25,
    note: parts.filter(([, p]) => p > 0).map(([k, p]) => `${k} ${p}`).join(", ") || "no trust signals shown",
  };

  // Relevance (20): the share of the product's words in the title; a reject word makes it another product.
  const tw = words(l.title ?? "");
  const inTitle = (w: string) => tw.some((x) => sameWord(x, w));
  const joined = ` ${tw.join(" ")} `;
  const mine = t.words.length ? t.words : [];
  const hits = mine.filter(inTitle).length;
  const share = mine.length ? hits / mine.length : 1;
  const ownWord = (w: string) => mine.some((x) => sameWord(x, w));
  const reject = REJECT_WORDS.find((w) => !w.split(" ").every(ownWord) && (w.includes(" ") ? joined.includes(` ${w} `) : inTitle(w)))
    ?? (share < 1 ? REJECT_UNLESS_FULL.find((w) => !ownWord(w) && inTitle(w)) : undefined);
  let relevance: ScorePart;
  if (reject) {
    flags.add("OFF_PRODUCT");
    relevance = { points: 0, max: 20, note: `"${reject}" in the title: likely another product` };
  } else {
    if (share < 0.5) flags.add("OFF_PRODUCT");
    relevance = { points: r1(20 * share), max: 20, note: mine.length ? `${hits} of ${mine.length} product words (${mine.join(", ")})` : "No product words to check" };
  }

  // A factory or a trading company? "Co., Ltd" and a manufacturer/factory word count toward a factory.
  const name = l.supplierName ?? "";
  const factorySignal = FACTORY.test(name) || FACTORY.test(l.title ?? "");
  const coLtd = /co\.?,?\s*ltd|limited|\bltd\b/i.test(name);
  if ((TRADER.test(name) && !factorySignal) || (!coLtd && !factorySignal)) flags.add("NOT_FACTORY");

  const score = r1(price.points + moq.points + trust.points + relevance.points);
  return { score, breakdown: { price, moq, trust, relevance }, flags: SUPPLIER_FLAGS.filter((f) => flags.has(f)), perUnit: conv.perUnit, moqOurs };
}

/** The target ex-works price: Gate 6's own, else Gate 0's landed cost ÷ 1.4. */
export function targetExworks(f: { targetExworks?: string | null; landed?: string | null }): { value: number | null; derived: boolean } {
  const own = Number(f.targetExworks);
  if (f.targetExworks && Number.isFinite(own) && own > 0) return { value: own, derived: false };
  const landed = Number(f.landed);
  return f.landed && Number.isFinite(landed) && landed > 0 ? { value: Math.round((landed / 1.4) * 100) / 100, derived: true } : { value: null, derived: true };
}

/** The most we'd order first: Gate 6's own, else 1,000. */
export const maxMoqOf = (f: { maxMoq?: string | null }) => {
  const n = Number(f.maxMoq);
  return f.maxMoq && Number.isFinite(n) && n > 0 ? Math.round(n) : 1000;
};
/** Our product's unit: Gate 6's own, else box. */
export const productUnitOf = (f: { productUnit?: string | null }) => f.productUnit || "box";
