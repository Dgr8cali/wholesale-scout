/**
 * Opportunity Explorer's top-level UK categories (Niche Import's category picker), each with the
 * rate card's referral category a candidate from it uses for its fees. Pure.
 */
import { referralCategoryFor } from "../fees/engine";
import type { RateCard } from "../fees/rateCard";

export const POE_CATEGORIES: { name: string; fee: string }[] = [
  { name: "Home & Kitchen", fee: "Home Products" },
  { name: "DIY & Tools", fee: "Tools and Home Improvement" },
  { name: "Garden", fee: "Lawn and Garden" },
  { name: "Sports & Outdoors", fee: "Sports and Outdoors" },
  { name: "Pet Supplies", fee: "Pet Supplies" },
  { name: "Baby Products", fee: "Baby Products" },
  { name: "Stationery & Office Supplies", fee: "Office Products" },
  { name: "Automotive", fee: "Automotive and Powersports" },
  { name: "Health & Personal Care", fee: "Beauty, Health and Personal Care" },
  { name: "Beauty", fee: "Beauty, Health and Personal Care" },
  { name: "Toys & Games", fee: "Toys and Games" },
  { name: "Electronics", fee: "Consumer Electronics" },
  { name: "Clothing", fee: "Clothing and Accessories" },
  { name: "Grocery", fee: "Grocery and Gourmet" },
  { name: "Kitchen & Home Appliances", fee: "Compact Appliances" },
  { name: "Large Appliances", fee: "Full-Size Appliances" },
  { name: "Lighting", fee: "Home Products" },
  { name: "Luggage", fee: "Luggage" },
  { name: "Musical Instruments", fee: "Musical Instruments and AV Production" },
  { name: "Computers & Accessories", fee: "Computers" },
  { name: "Jewellery", fee: "Jewellery" },
  { name: "Shoes & Bags", fee: "Footwear" },
  { name: "Watches", fee: "Watches" },
  { name: "Books", fee: "Everything else" },
  { name: "Business/Industrial & Scientific", fee: "Business, Industrial, and Scientific Supplies" },
];

/** "DIY & Tools", "diy and tools" and "Diy Tools" (a file-name guess) are the same category. */
const key = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();

/** The Opportunity Explorer category a typed or guessed name is, or null. */
export function matchPoeCategory(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const k = key(name);
  return POE_CATEGORIES.find((c) => key(c.name) === k)?.name ?? null;
}

/**
 * The rate card's category for an import's category: Opportunity Explorer's when it's one of the
 * list (and on the active rate card), else the rate card's own name map, else its default.
 */
export function feeCategoryFor(name: string | null | undefined, card: RateCard): string {
  const poe = POE_CATEGORIES.find((c) => c.name === matchPoeCategory(name));
  if (poe && card.referral.categories.some((c) => c.name === poe.fee)) return poe.fee;
  return referralCategoryFor(name, card);
}

/**
 * Keepa's UK root category for each Opportunity Explorer category (the incumbent check's finder is
 * restricted to it). Clothing, shoes, bags, jewellery, watches and luggage sit under Fashion.
 */
export const KEEPA_ROOTS: Record<string, number> = {
  "Home & Kitchen": 11052681, "DIY & Tools": 79903031, "Garden": 11052671, "Sports & Outdoors": 318949011,
  "Pet Supplies": 340840031, "Baby Products": 59624031, "Stationery & Office Supplies": 192413031, "Automotive": 248877031,
  "Health & Personal Care": 65801031, "Beauty": 117332031, "Toys & Games": 468292, "Electronics": 560798,
  "Clothing": 11961407031, "Grocery": 340834031, "Kitchen & Home Appliances": 11052681, "Large Appliances": 908798031,
  "Lighting": 213077031, "Luggage": 11961407031, "Musical Instruments": 340837031, "Computers & Accessories": 340831031,
  "Jewellery": 11961407031, "Shoes & Bags": 11961407031, "Watches": 11961407031, "Books": 266239,
  "Business/Industrial & Scientific": 5866054031,
};

/** The Keepa root category ids for a niche's categories (unknown names left out), no repeats. */
export function keepaRootsFor(names: (string | null | undefined)[]): number[] {
  return [...new Set(names.map((n) => KEEPA_ROOTS[matchPoeCategory(n) ?? ""]).filter((x): x is number => !!x))];
}
