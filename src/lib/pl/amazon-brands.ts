/**
 * Amazon's own private-label brands on amazon.co.uk. A listing from one of these on page one is
 * Gate 1's "Amazon-brand in top 10": Amazon prices it, ranks it and advertises it against you.
 */
export const AMAZON_BRANDS = [
  "Amazon Basics",
  "Amazon Essentials",
  "Solimo",
  "Presto!",
  "Umi",
  "Eono",
  "Amazon Aware",
  "Happy Belly",
  "Wag",
  "Pinzon",
  "Rivet",
  "Stone & Beam",
];

/** Lower-case letters and digits only: "AmazonBasics", "Amazon Basics" and "amazon-basics" match. */
const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const KEYS = new Set(AMAZON_BRANDS.map(key));

export function isAmazonBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  const k = key(brand);
  // "UMI. by Amazon" and similar: the brand followed by "by Amazon".
  return KEYS.has(k) || KEYS.has(k.replace(/byamazon$/, ""));
}
