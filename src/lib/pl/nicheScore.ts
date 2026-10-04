/**
 * Niche Import's score: 0–100 from an Opportunity Explorer niche's own figures, no Keepa. Demand
 * (20), growth (20), price (20), fragmentation (25) and units a product (15), each with its raw
 * input in the breakdown. Flags (chips) never change the score: they mark what to check or skip.
 * Pure.
 */
import { DEFAULT_BRAND_TERMS } from "./brandTerms";

export interface NicheFigures {
  customer_need: string; search_terms: string[];
  sv_360: number | null; growth_180: number | null; growth_90: number | null;
  avg_price: number | null; top_clicked_products: number | null; units_per_product_mid: number | null; return_rate: number | null;
}

export type NicheFlag = "SPIKE" | "FADING" | "LOW_PRICE" | "HIGH_RETURNS" | "ELECTRICAL" | "REGULATED" | "BIG_BRAND" | "HEAVY_BULKY" | "LOW_UNITS";
export const NICHE_FLAGS: NicheFlag[] = ["SPIKE", "FADING", "LOW_PRICE", "HIGH_RETURNS", "ELECTRICAL", "REGULATED", "BIG_BRAND", "HEAVY_BULKY", "LOW_UNITS"];
/** Hidden in the default view. */
export const DEFAULT_HIDDEN_FLAGS: NicheFlag[] = ["SPIKE", "BIG_BRAND", "ELECTRICAL", "HEAVY_BULKY", "REGULATED"];
export const FLAG_LABEL: Record<NicheFlag, string> = {
  SPIKE: "Spike", FADING: "Fading", LOW_PRICE: "Low price", HIGH_RETURNS: "High returns", ELECTRICAL: "Electrical",
  REGULATED: "Regulated", BIG_BRAND: "Big brand", HEAVY_BULKY: "Heavy/bulky", LOW_UNITS: "Low units",
};

export interface ScoreComponent { points: number; max: number; input: number | null; note: string }
export interface NicheScore { score: number; breakdown: Record<"demand" | "growth" | "price" | "fragmentation" | "units", ScoreComponent> }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Demand: search volume over 360 days on a log scale, 0 at ≤ 100k, full at ≥ 2M. */
export function demandShare(sv: number | null): number {
  if (sv == null || sv <= 100_000) return 0;
  return clamp01(Math.log(sv / 100_000) / Math.log(2_000_000 / 100_000));
}

/**
 * Growth over 180 days (a fraction): full in +5% to +60%; 0.8 for 0 to +5%; 0.6 over +60%; a
 * linear penalty below 0 reaching nothing at −50%; and nothing over +150% (a spike: a one-off event).
 */
export function growthShare(g: number | null): number {
  if (g == null) return 0;
  if (g > 1.5) return 0;
  if (g > 0.6) return 0.6;
  if (g >= 0.05) return 1;
  if (g >= 0) return 0.8;
  return clamp01(1 + g / 0.5);
}

/** Price (average, £): full £15–40; 0.6 for £10–15 and £40–60; 0.3 for £8–10 and £60–80; else 0. */
export function priceShare(p: number | null): number {
  if (p == null) return 0;
  if (p >= 15 && p <= 40) return 1;
  if ((p >= 10 && p < 15) || (p > 40 && p <= 60)) return 0.6;
  if ((p >= 8 && p < 10) || (p > 60 && p <= 80)) return 0.3;
  return 0;
}

/** Fragmentation: more top-clicked products sharing the clicks = less dominated. 0 at ≤ 15, full at ≥ 60. */
export function fragmentationShare(n: number | null): number {
  if (n == null) return 0;
  return clamp01((n - 15) / (60 - 15));
}

/** Units a product a year (the midpoint of the average product's range): 0 at ≤ 300, full at ≥ 2,000. */
export function unitsShare(u: number | null): number {
  if (u == null) return 0;
  return clamp01((u - 300) / (2000 - 300));
}

const pctTxt = (g: number) => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`;

export function scoreNiche(n: NicheFigures): NicheScore {
  const parts = {
    demand: { max: 20, share: demandShare(n.sv_360), input: n.sv_360, note: "Search volume, 360 days: 0 at ≤100k, full at ≥2M (log scale)" },
    growth: { max: 20, share: growthShare(n.growth_180), input: n.growth_180, note: n.growth_180 != null && n.growth_180 > 1.5 ? `${pctTxt(n.growth_180)} over 180 days: a spike, scored 0` : "Growth, 180 days: full +5% to +60%" },
    price: { max: 20, share: priceShare(n.avg_price), input: n.avg_price, note: "Average price: full £15–40" },
    fragmentation: { max: 25, share: fragmentationShare(n.top_clicked_products), input: n.top_clicked_products, note: "Top-clicked products: 0 at ≤15, full at ≥60" },
    units: { max: 15, share: unitsShare(n.units_per_product_mid), input: n.units_per_product_mid, note: "Units a product a year (midpoint): 0 at ≤300, full at ≥2,000" },
  };
  const breakdown = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { points: r1(v.share * v.max), max: v.max, input: v.input, note: v.note }])) as NicheScore["breakdown"];
  const score = r1(Object.values(breakdown).reduce((a, c) => a + c.points, 0));
  return { score, breakdown };
}

/* ===================== flags ===================== */

export const ELECTRICAL_TERMS = ["camera", "plug", "socket", "charger", "battery", "batteries", "led", "heater", "extension lead", "lamp", "light", "electric", "cordless", "drill", "fan", "smart", "wifi", "sensor", "doorbell", "alarm", "bulb", "radio",
  "steamer", "clippers", "toaster", "blender", "kettle", "air fryer", "hairdryer", "straightener", "trimmer", "shaver", "scales", "thermometer", "fountain"];
export const REGULATED_TERMS = ["glasses", "safety", "ppe", "respirator", "mask", "medical", "baby", "food", "supplement", "fire", "gas", "smoke", "carbon monoxide", "paint", "aerosol", "resin", "adhesive"];
export const HEAVY_BULKY_TERMS = ["shelves", "shelf", "ladder", "toilet", "bidet", "wardrobe", "mattress", "cabinet", "table", "desk", "bench", "door", "gate", "fence", "rack", "trolley", "workbench", "flooring", "wall panels", "step ladder",
  "shelving", "unit", "cupboard", "drawers", "lounger", "hammock", "swing",
  // "stand" only as one of these: a plant, TV, monitor or bike stand is furniture; a phone stand isn't.
  "plant stand", "tv stand", "monitor stand", "bike stand"];

/** Lower case, punctuation to spaces (hyphens kept: "wd-40", "evo-stik"), single spaces. */
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, " ").replace(/\s+/g, " ").trim()} `;
/** The word or phrase, whole: "led" in "led strip lights", not in "sledge"; "light" also matches "lights". */
const hits = (text: string, term: string) => {
  const t = norm(term).trim();
  return text.includes(` ${t} `) || text.includes(` ${t}s `) || text.includes(` ${t}es `);
};
const anyHit = (texts: string[], list: string[]) => list.find((term) => texts.some((x) => hits(x, term))) ?? null;

/**
 * A brand in a search term, as a whole phrase: the term is the brand, starts with it ("tapo camera",
 * "ring doorbell"), or has it after a space when the brand is 5+ characters ("cordless dewalt drill").
 * A short brand later in a term is usually a word ("key ring" isn't Ring), so it doesn't count.
 */
export function brandHit(term: string, brand: string): boolean {
  const t = norm(term).trim(), b = norm(brand).trim();
  if (!t || !b) return false;
  return t === b || t.startsWith(`${b} `) || (b.length >= 5 && ` ${t} `.includes(` ${b} `));
}
const brandOf = (texts: string[], brands: string[]) => brands.find((b) => texts.some((t) => brandHit(t, b))) ?? null;

/** The flags a niche earns, from its figures and the words in its customer need and search terms. */
export function nicheFlags(n: NicheFigures, brands: string[] = DEFAULT_BRAND_TERMS): NicheFlag[] {
  const texts = [n.customer_need, ...n.search_terms].map(norm);
  const out: NicheFlag[] = [];
  if (n.growth_180 != null && n.growth_180 > 1.5) out.push("SPIKE");
  if (n.growth_180 != null && n.growth_180 > 0 && n.growth_90 != null && n.growth_90 < -0.15) out.push("FADING");
  if (n.avg_price != null && n.avg_price < 10) out.push("LOW_PRICE");
  if (n.return_rate != null && n.return_rate >= 0.03) out.push("HIGH_RETURNS");
  if (anyHit(texts, ELECTRICAL_TERMS)) out.push("ELECTRICAL");
  if (anyHit(texts, REGULATED_TERMS)) out.push("REGULATED");
  if (brandOf([n.customer_need, ...n.search_terms], brands)) out.push("BIG_BRAND");
  if (anyHit(texts, HEAVY_BULKY_TERMS)) out.push("HEAVY_BULKY");
  if (n.units_per_product_mid != null && n.units_per_product_mid < 200) out.push("LOW_UNITS");
  return out;
}

/** Which word set a flag off, for its chip's tooltip. */
export function flagReason(flag: NicheFlag, n: NicheFigures, brands: string[] = DEFAULT_BRAND_TERMS): string | null {
  const texts = [n.customer_need, ...n.search_terms].map(norm);
  if (flag === "BIG_BRAND") return brandOf([n.customer_need, ...n.search_terms], brands);
  const list = flag === "ELECTRICAL" ? ELECTRICAL_TERMS : flag === "REGULATED" ? REGULATED_TERMS : flag === "HEAVY_BULKY" ? HEAVY_BULKY_TERMS : null;
  return list ? anyHit(texts, list) : null;
}
