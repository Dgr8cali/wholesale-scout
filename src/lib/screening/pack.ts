/**
 * Multipacks: how many units a listing (or a supplier row) is, from its title and, for an
 * Amazon listing, the catalog's item_package_quantity / number_of_items. A supplier price
 * is per single; a 3-pack listing costs three of them.
 */

/**
 * Multipacks beyond this are counts of pieces inside one item ("100 pack" cotton pads), or
 * catalog noise (one listing's package quantity is 512), not packs to buy singles for.
 */
const PLAUSIBLE = (n: number | null | undefined): n is number => n != null && Number.isInteger(n) && n >= 1 && n <= 24;

const WORDS: Record<string, number> = { twin: 2, duo: 2, double: 2, triple: 3, trio: 3 };
const UNIT = String.raw`(?:ml|cl|l|ltr|litres?|g|gr|kg|oz|fl\.?\s?oz)`;

const PATTERNS: { re: RegExp; n: (m: RegExpMatchArray) => number }[] = [
  // "Pack of 3", "Set of 2", "Case of 12", "Bundle of 4", "Box of 6"
  { re: /\b(?:pack|set|case|bundle|box|multipack|multi-pack)\s+of\s+(\d{1,3})\b/i, n: (m) => +m[1] },
  // "3-pack", "3 pack", "3pk", "6-count pack"
  { re: /\b(\d{1,3})\s?-?\s?(?:pack|pk|packs)\b/i, n: (m) => +m[1] },
  // "3 x 200ml", "3x200 ml", "6 x 75 ml"
  { re: new RegExp(String.raw`\b(\d{1,3})\s?[x×]\s?\d+(?:[.,]\d+)?\s?${UNIT}\b`, "i"), n: (m) => +m[1] },
  // "200ml x 3", "60 ml X 3"
  { re: new RegExp(String.raw`\b\d+(?:[.,]\d+)?\s?${UNIT}\s?[x×]\s?(\d{1,3})\b`, "i"), n: (m) => +m[1] },
  // "12 x Venus Milk …": a count leading the title
  { re: /^\s*(\d{1,3})\s?[x×]\s+\p{L}/iu, n: (m) => +m[1] },
  // "Twin pack", "Duo set", "Triple pack", "Double pack" ("Triple-Action" isn't a pack)
  { re: /\b(twin|duo|double|triple|trio)\s?-?\s?(?:pack|packs|pk|set)\b/i, n: (m) => WORDS[m[1].toLowerCase()] },
  // "Twin" / "Duo" on its own at the end of a title, or in brackets: "Sanex Deodorant Twin"
  { re: /(?:\b(twin|duo)\s*$|\((twin|duo)\))/i, n: (m) => WORDS[(m[1] ?? m[2]).toLowerCase()] },
];

/** Units a title says it is ("Pack of 3" → 3), or null when it doesn't say. */
export function titlePackCount(title: string | null | undefined): number | null {
  if (!title) return null;
  for (const { re, n } of PATTERNS) {
    const m = title.match(re);
    if (m) {
      const v = n(m);
      if (PLAUSIBLE(v) && v > 1) return v;
    }
  }
  return null;
}

/** Amazon's pack attributes, as stored on the product. */
export interface PackAttrs {
  itemPackageQuantity: number | null;
  numberOfItems: number | null;
}

export interface ListingPack {
  /** Units in one listing. */
  count: number;
  /** What it was read from. */
  source: "title" | "default";
  /** Title and attributes disagree: "title says 3, Amazon's attributes say 1". */
  mismatch: string | null;
}

/**
 * The listing's pack. The title decides (it's what the buyer sees); the attributes have to
 * agree with it, or it's flagged. Attributes alone never scale the cost: on real listings
 * they say 5 for a single 40 ml serum and 6 for one pack of 6 pairs of gloves. When the title
 * is silent but both attributes say the same multipack, it's flagged to check.
 */
export function listingPack(title: string | null | undefined, attrs: PackAttrs | null | undefined): ListingPack {
  const t = titlePackCount(title);
  const ipq = PLAUSIBLE(attrs?.itemPackageQuantity) ? attrs!.itemPackageQuantity! : null;
  const noi = PLAUSIBLE(attrs?.numberOfItems) ? attrs!.numberOfItems! : null;
  const said = [ipq, noi].filter((x): x is number => x != null);
  if (t != null) {
    const mismatch = said.length && !said.includes(t)
      ? `title says ${t}, Amazon's attributes say ${[...new Set(said)].join(" / ")}`
      : null;
    return { count: t, source: "title", mismatch };
  }
  if (ipq != null && ipq > 1 && noi === ipq) {
    return { count: 1, source: "default", mismatch: `title doesn't say, Amazon's attributes say ${ipq}` };
  }
  return { count: 1, source: "default", mismatch: null };
}

/** A supplier row's units per priced item: its title's pack, else a single. */
export const supplierPack = (title: string | null | undefined) => titlePackCount(title) ?? 1;
