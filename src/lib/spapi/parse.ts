/** Response parsers for SP-API — kept separate from I/O so they can be tested on fixtures. */
import { decodeEntities } from "../text";
import type { AmazonDg, CatalogMatch, CompetitivePrice, FeesEstimate, Restriction, RestrictionLink, RestrictionStatus } from "./types";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function forMarketplace(list: unknown, marketplaceId: string): Json {
  const items = arr(list).map(obj);
  return items.find((x) => x.marketplaceId === marketplaceId) ?? items[0] ?? {};
}

const LENGTH_TO_CM: Record<string, number> = { centimeters: 1, millimeters: 0.1, meters: 100, inches: 2.54, feet: 30.48 };
const WEIGHT_TO_G: Record<string, number> = { grams: 1, kilograms: 1000, pounds: 453.59237, ounces: 28.349523125 };

function measure(m: unknown, table: Record<string, number>): number | null {
  const o = obj(m);
  const v = num(o.value);
  const unit = str(o.unit)?.toLowerCase();
  if (v == null || !unit || !(unit in table)) return null;
  return v * table[unit];
}

export function parseCatalogItem(raw: unknown, marketplaceId: string): CatalogMatch {
  const item = obj(raw);
  const asin = String(item.asin ?? "");

  const ids = arr(forMarketplace(item.identifiers, marketplaceId).identifiers).map(obj);
  const eans = ids
    .filter((i) => ["EAN", "GTIN", "UPC"].includes(String(i.identifierType).toUpperCase()))
    .map((i) => String(i.identifier));

  const summary = forMarketplace(item.summaries, marketplaceId);
  const browse = obj(summary.browseClassification);

  const dimsEntry = forMarketplace(item.dimensions, marketplaceId);
  const pkg = obj(dimsEntry.package);
  const it = obj(dimsEntry.item);
  const pick = (k: string) => measure(pkg[k], LENGTH_TO_CM) ?? measure(it[k], LENGTH_TO_CM);
  const l = pick("length"), w = pick("width"), h = pick("height");
  const weightG = measure(pkg.weight, WEIGHT_TO_G) ?? measure(it.weight, WEIGHT_TO_G);

  const ranks = forMarketplace(item.salesRanks, marketplaceId);
  const displayRank = obj(arr(ranks.displayGroupRanks)[0]);
  const classRank = obj(arr(ranks.classificationRanks)[0]);

  const rels = arr(forMarketplace(item.relationships, marketplaceId).relationships).map(obj);
  const variation = rels.find((r) => r.type === "VARIATION");

  const attrs = obj(item.attributes);
  const hazmat = arr(attrs.supplier_declared_dg_hz_regulation)
    .map((x) => str(obj(x).value))
    .filter((x): x is string => !!x && x !== "not_applicable" && x !== "unknown");
  const batteries = arr(attrs.batteries_required).some((x) => obj(x).value === true) ||
    arr(attrs.batteries_included).some((x) => obj(x).value === true);

  const intAttr = (k: string) => {
    const v = num(obj(arr(attrs[k])[0]).value);
    return v != null && Number.isInteger(v) && v > 0 ? v : null;
  };

  const images = arr(forMarketplace(item.images, marketplaceId).images).map(obj);
  const main = images.filter((i) => i.variant === "MAIN" && str(i.link)).sort((a, b) => (num(b.height) ?? 0) - (num(a.height) ?? 0))[0];

  return {
    asin,
    eans,
    imageUrl: main ? String(main.link) : null,
    title: str(summary.itemName) && decodeEntities(str(summary.itemName)!),
    brand: str(summary.brand) ?? str(summary.brandName),
    // Root category, for the referral fee: the rank's display group, else the summary's
    // display group, else the leaf browse node as a last resort.
    category: str(displayRank.title) ?? str(summary.websiteDisplayGroupName) ?? str(browse.displayName),
    dimsCm: l != null && w != null && h != null ? { l: r1(l), w: r1(w), h: r1(h) } : null,
    weightG: weightG == null ? null : Math.round(weightG),
    salesRank: num(displayRank.rank) ?? num(classRank.rank),
    parentAsin: str(arr(variation?.parentAsins)[0]),
    variationCount: variation ? arr(variation.childAsins).length || null : null,
    hazmat,
    batteries,
    pack: { itemPackageQuantity: intAttr("item_package_quantity"), numberOfItems: intAttr("number_of_items") },
    dg: parseDg(attrs, hazmat),
  };
}

/** Amazon's dangerous-goods attributes (see AmazonDg); all empty when it says nothing. */
export function parseDg(attrs: Json, declared: string[]): AmazonDg {
  const aspects = new Map<string, string>();
  for (const x of arr(attrs.hazmat).map(obj)) {
    const a = str(x.aspect), v = str(x.value) ?? (typeof x.value === "number" ? String(x.value) : null);
    if (a && v && !aspects.has(a)) aspects.set(a, v.trim());
  }
  const un = aspects.get("united_nations_regulatory_id") ?? null;
  const name = aspects.get("proper_shipping_name") ?? null;
  const cls = aspects.get("transportation_regulatory_class") ?? null;
  // Class "0" (and no UN number or shipping name) is Amazon saying "not regulated".
  const regulated = !!un || !!name || (!!cls && !/^(0|none|not[_ ]?applicable)$/i.test(cls));
  const ghs = arr(attrs.ghs).map(obj).flatMap((g) => arr(g.classification)).map((c) => str(obj(c).class))
    .filter((c): c is string => !!c && !/no_label|not_applicable|unknown|^none$/i.test(c));
  const heatSensitive = arr(attrs.is_heat_sensitive).some((x) => obj(x).value === true);
  return { hazmat: regulated ? { un, name, class: cls } : null, ghs: [...new Set(ghs)], declared, heatSensitive };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A fee's ex-tax amount: FinalFee less its tax where both are given, else FeeAmount. */
function feeAmount(detail: Json): number {
  const final = num(obj(detail.FinalFee).Amount);
  const tax = num(obj(detail.TaxAmount).Amount) ?? 0;
  if (final != null) return final - tax;
  return num(obj(detail.FeeAmount).Amount) ?? 0;
}

export function parseFeesEstimate(raw: unknown, asin: string): FeesEstimate {
  const r = obj(raw);
  if (r.Status !== "Success") {
    const err = obj(r.Error);
    return { asin, ok: false, referral: null, fba: null, total: null, error: str(err.Message) ?? str(err.Code) ?? "No estimate", retryable: r.Status === "ServerError" };
  }
  const details = arr(obj(r.FeesEstimate).FeeDetailList).map(obj);
  let referral = 0;
  let fba = 0;
  for (const d of details) {
    const amount = feeAmount(d);
    if (d.FeeType === "ReferralFee") referral += amount;
    else fba += amount; // FBAFees, VariableClosingFee, PerItemFee
  }
  return { asin, ok: true, referral: r2(referral), fba: r2(fba), total: r2(referral + fba) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Links worth showing as "Apply on Amazon": https only, one per URL. */
export function applyLinks(links: RestrictionLink[] | undefined): RestrictionLink[] {
  const seen = new Set<string>();
  return (links ?? []).filter((l) => {
    if (!/^https:\/\//i.test(l.resource) || seen.has(l.resource)) return false;
    seen.add(l.resource);
    return true;
  });
}

export type ApprovalKind = "brand" | "category" | "product";

/**
 * What Amazon wants you approved for, read from its reason text: "You need approval to
 * list this brand", "...in this category", or a product-level restriction. null if unclear.
 */
export function approvalKind(message: string | null | undefined): ApprovalKind | null {
  const m = (message ?? "").toLowerCase();
  if (/\bbrand\b/.test(m)) return "brand";
  if (/\bcategor(y|ies)\b|\bsub-?category\b/.test(m)) return "category";
  if (/\b(this|the) (product|item|asin|listing)\b/.test(m)) return "product";
  return null;
}

export function parseRestrictions(asin: string, restrictions: unknown[]): Restriction {
  const reasons = restrictions
    .flatMap((x) => arr(obj(x).reasons))
    .map(obj)
    .map((r) => ({
      code: String(r.reasonCode ?? "UNKNOWN"),
      message: String(r.message ?? ""),
      links: arr(r.links).map(obj).filter((l) => str(l.resource)).map((l) => ({
        resource: String(l.resource),
        verb: str(l.verb) ?? "GET",
        title: str(l.title),
        type: str(l.type),
      })),
    }));
  let status: RestrictionStatus = "open";
  if (reasons.some((r) => r.code === "NOT_ELIGIBLE")) status = "blocked";
  else if (reasons.some((r) => r.code === "APPROVAL_REQUIRED")) status = "approval_required";
  else if (reasons.length) status = "unknown"; // e.g. ASIN_NOT_FOUND
  return { asin, status, reasons };
}

export function parseCompetitivePricing(payload: unknown[]): CompetitivePrice[] {
  return payload.map(obj).filter((p) => p.status === "Success").map((p) => {
    const product = obj(p.Product);
    const cp = obj(product.CompetitivePricing);
    const prices = arr(cp.CompetitivePrices).map(obj);
    const bb = prices.find((x) => x.CompetitivePriceId === "1" && String(x.condition ?? "New").toLowerCase() === "new") ??
      prices.find((x) => x.CompetitivePriceId === "1");
    const price = obj(bb?.Price);
    const buyBox = num(obj(price.LandedPrice).Amount) ?? num(obj(price.ListingPrice).Amount);
    const offers = arr(cp.NumberOfOfferListings).map(obj).find((x) => String(x.condition).toLowerCase() === "new");
    const rank = obj(arr(product.SalesRankings)[0]);
    return { asin: String(p.ASIN), buyBox, newOffers: num(offers?.Count), salesRank: num(rank.Rank) };
  });
}
