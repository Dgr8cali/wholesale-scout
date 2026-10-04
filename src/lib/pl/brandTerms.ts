/**
 * Brands that make a niche someone else's: a search term that is or contains one gets BIG_BRAND.
 * The default list; Settings → Private label edits the one in use. Lower case.
 */
export const DEFAULT_BRAND_TERMS = [
  "tapo", "ring", "dewalt", "bosch", "makita", "stanley", "karcher", "dyson", "ryobi", "hive", "nest", "eufy", "blink", "philips",
  "yale", "dulux", "gorilla", "wd-40", "3m", "command", "einhell", "worx", "black and decker", "tesa", "ronseal", "cuprinol",
  "milwaukee", "festool", "draper", "hozelock", "everbuild", "unibond", "evo-stik", "loctite", "velcro", "wera", "knipex",
  "silverline", "victorinox", "master lock", "jenolite", "kurust", "amazon basics", "joseph joseph", "brabantia", "lakeland",
  "oxo", "spontex", "addis",
];

/** One a line or comma, lower case, trimmed, no repeats. */
export function parseBrandTerms(text: string | string[]): string[] {
  const items = Array.isArray(text) ? text : text.split(/[\n,]/);
  return [...new Set(items.map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];
}
