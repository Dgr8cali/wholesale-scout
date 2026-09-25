/**
 * The Demand gate's rank ceiling per top-level Amazon category: a rank means different sales in
 * different categories, so each can have its own ceiling; any other category uses the
 * profile-wide "Max 90-day average rank".
 */

/** Starting points: tighter where a rank buys fewer sales, looser in the big categories. */
export const DEFAULT_RANK_BY_CATEGORY: Record<string, number> = {
  "Beauty": 60_000,
  "Health & Personal Care": 60_000,
  "Grocery": 50_000,
  "Automotive": 150_000,
  "Home & Kitchen": 200_000,
  "DIY & Tools": 150_000,
  "Sports & Outdoors": 150_000,
};

/** Amazon UK's top-level categories, for the Settings picker (Keepa's and the catalog's names). */
export const TOP_CATEGORIES = [
  "Automotive", "Baby Products", "Beauty", "Business, Industry & Science", "Clothing", "Computers & Accessories",
  "DIY & Tools", "Electronics & Photo", "Garden", "Grocery", "Health & Personal Care", "Home & Kitchen",
  "Jewellery", "Large Appliances", "Lighting", "Luggage", "Musical Instruments & DJ", "Pet Supplies",
  "Shoes & Bags", "Sports & Outdoors", "Stationery & Office Supplies", "Toys & Games", "Video Games", "Watches",
];

// Other names the same category goes by (US names, the catalog's older display groups).
const ALIASES: Record<string, string> = {
  "health household": "Health & Personal Care", "health personal care": "Health & Personal Care", "drugstore": "Health & Personal Care",
  "luxury beauty": "Beauty", "beauty personal care": "Beauty",
  "home": "Home & Kitchen", "kitchen": "Home & Kitchen", "kitchen home": "Home & Kitchen", "home kitchen": "Home & Kitchen",
  "tools home improvement": "DIY & Tools", "diy tools": "DIY & Tools", "tools": "DIY & Tools", "home improvement": "DIY & Tools",
  "sports": "Sports & Outdoors", "sports outdoors": "Sports & Outdoors", "outdoors": "Sports & Outdoors",
  "grocery gourmet food": "Grocery", "grocery": "Grocery", "food": "Grocery",
  "car motorbike": "Automotive", "automotive": "Automotive",
  "baby": "Baby Products", "pet": "Pet Supplies", "pets": "Pet Supplies", "toys": "Toys & Games", "office products": "Stationery & Office Supplies",
};

const key = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/\band\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** The table's entry for a category name, matched loosely ("Health & Household" → Health & Personal Care). */
export function categoryEntry(table: Record<string, number> | undefined, category: string | null | undefined): { name: string; max: number } | null {
  if (!table || !category) return null;
  const k = key(category);
  const canonical = ALIASES[k];
  for (const [name, max] of Object.entries(table)) {
    if (!Number.isFinite(max) || max <= 0) continue;
    const nk = key(name);
    if (nk === k || (canonical && (name === canonical || ALIASES[nk] === canonical))) return { name, max };
  }
  return null;
}

/** The rank ceiling for a product: its category's, else the profile-wide one. */
export function rankCeiling(g: { maxAvgRank90d: number; maxRankByCategory?: Record<string, number> }, category: string | null | undefined): { max: number; category: string | null } {
  const e = categoryEntry(g.maxRankByCategory, category);
  return e ? { max: e.max, category: e.name } : { max: g.maxAvgRank90d, category: null };
}
