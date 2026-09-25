/**
 * Compliance rule sets (gate 2). Shared by every profile; each profile sets each
 * rule's mode. Stored in `category_rules`, editable in Settings.
 *
 * Keywords match whole words or phrases, case-insensitively. A keyword written as
 * /pattern/ is a regular expression.
 */
export interface CategoryRule {
  key: string;
  name: string;
  keywords: string[];
  amazon_categories: string[];
  note: string;
  checklist: string[];
  sort: number;
}

export const DEFAULT_RULES: CategoryRule[] = [
  {
    key: "fragrance",
    name: "Hazmat: flammable liquid",
    keywords: ["eau de parfum", "eau de toilette", "eau de cologne", "parfum", "perfume", "cologne", "edp", "edt", "body mist", "fragrance mist", "aftershave", "after shave", "nail polish", "nail varnish", "nail polish remover"],
    amazon_categories: ["Fragrances", "Perfume & Aftershave"],
    note: "Alcohol-based fragrance is a Class 3 flammable liquid: dangerous-goods review before FBA, and often a restricted listing.",
    checklist: ["Safety data sheet (SDS) from supplier", "FBA dangerous goods review submitted", "UN number and flash point confirmed"],
    sort: 0,
  },
  {
    key: "liquid",
    name: "Liquid",
    keywords: ["/\\b\\d+(\\.\\d+)?\\s?(ml|cl|l|ltr|litre|liter)s?\\b/", "liquid", "gel", "shampoo", "conditioner", "lotion", "serum", "oil", "wash", "cleaner", "refill", "syrup", "solution"],
    amazon_categories: [],
    note: "Liquids leak in transit and need poly-bagging; many also fall under CLP.",
    checklist: ["Bottle sealed and leak-tested", "Poly-bag prep", "Check whether CLP labelling applies"],
    sort: 1,
  },
  {
    key: "aerosol",
    name: "Aerosol",
    keywords: ["aerosol", "spray can", "deodorant spray", "body spray", "dry shampoo", "hairspray", "hair spray", "air freshener spray", "mousse"],
    amazon_categories: [],
    note: "Aerosols are dangerous goods (UN1950) and need hazmat approval for FBA.",
    checklist: ["SDS from supplier", "FBA dangerous goods review", "Limited-quantity labelling"],
    sort: 2,
  },
  {
    key: "cosmetic",
    name: "Cosmetic",
    keywords: ["cream", "moisturiser", "moisturizer", "cosmetic", "makeup", "make-up", "mascara", "lipstick", "foundation", "concealer", "skincare", "skin care", "sunscreen", "spf", "cleanser", "toner", "balm"],
    amazon_categories: ["Beauty", "Luxury Beauty"],
    note: "UK Cosmetics Regulation: a UK Responsible Person and SCPN notification must exist for what you sell.",
    checklist: ["UK Responsible Person named on pack", "SCPN notification exists", "English labelling with ingredients"],
    sort: 3,
  },
  {
    key: "supplement",
    name: "Supplement",
    keywords: ["vitamin", "vitamins", "supplement", "capsules", "tablets", "softgels", "gummies", "multivitamin", "probiotic", "collagen", "omega", "magnesium", "zinc", "protein powder"],
    amazon_categories: ["Vitamins, Minerals & Supplements"],
    note: "Food supplements need compliant labelling and often Amazon category approval; health claims are restricted.",
    checklist: ["Category approval for supplements", "Label meets UK food supplement rules", "No unauthorised health claims"],
    sort: 4,
  },
  {
    key: "food",
    name: "Food",
    keywords: ["food", "snack", "chocolate", "sweets", "tea", "coffee", "biscuits", "sauce", "spice", "seasoning", "cereal", "drink", "beverage"],
    amazon_categories: ["Grocery", "Grocery & Gourmet Food"],
    note: "Grocery needs expiry-date handling in FBA (90+ days left) and allergen labelling.",
    checklist: ["Best-before at least 90 days out at inbound", "Allergen labelling in English", "Grocery category approval"],
    sort: 5,
  },
  {
    key: "electrical",
    name: "Electrical",
    keywords: ["charger", "plug", "mains", "adapter", "adaptor", "electric", "electrical", "usb", "led", "rechargeable", "hair dryer", "straightener", "kettle"],
    amazon_categories: ["Electronics & Photo", "Large Appliances", "Lighting"],
    note: "UKCA/CE marking, a UK plug where mains powered, and WEEE obligations.",
    checklist: ["UKCA or CE marking", "UK plug (BS 1363) if mains", "WEEE registration"],
    sort: 6,
  },
  {
    key: "battery",
    name: "Battery",
    keywords: ["battery", "batteries", "lithium", "li-ion", "power bank", "button cell"],
    amazon_categories: [],
    note: "Lithium batteries are dangerous goods; button cells need child-safe packaging.",
    checklist: ["Battery spec and UN38.3 test summary", "FBA dangerous goods review", "Battery regulations labelling"],
    sort: 7,
  },
  {
    key: "under3sToy",
    name: "Under-3s toy",
    keywords: ["baby toy", "teether", "rattle", "0+ months", "6+ months", "12+ months", "18+ months", "toddler toy", "soft toy", "plush"],
    amazon_categories: ["Baby", "Baby Products"],
    note: "Toys for under-3s face stricter safety testing (small parts, EN 71) and Amazon document requests.",
    checklist: ["EN 71 test reports", "UKCA/CE marking", "UK importer on pack"],
    sort: 8,
  },
  {
    key: "chemical",
    name: "Chemical",
    keywords: ["bleach", "detergent", "disinfectant", "descaler", "limescale", "drain", "solvent", "adhesive", "glue", "paint", "weedkiller", "pesticide", "insecticide", "caustic", "ammonia", "degreaser"],
    amazon_categories: [],
    note: "CLP labelling required for GB; many are dangerous goods and need an SDS.",
    checklist: ["GB CLP label in English", "SDS from supplier", "UFI code where required"],
    sort: 9,
  },
  {
    key: "meltable",
    name: "Meltable",
    // Matched from Amazon's is_heat_sensitive attribute; add keywords in Settings if wanted.
    keywords: [],
    amazon_categories: [],
    note: "Amazon marks it heat-sensitive: FBA only accepts meltable inventory from mid-October to mid-April, and removes what's left in summer.",
    checklist: ["Check the meltable season before sending", "Plan to sell through or remove by April"],
    sort: 10,
  },
  {
    key: "ipRisk",
    name: "IP-risk brand",
    // Matched from your IP-risk list (Settings → IP risk) on the product's brand, not keywords.
    keywords: [],
    amazon_categories: [],
    note: "The brand is on your IP-risk list (Settings → IP risk): it's known to file IP or counterfeit complaints against resellers. Set to fail to drop high-risk brands; medium and low only warn.",
    checklist: ["Invoices from an authorised distributor", "Check the brand's reseller policy", "Consider a letter of authorisation"],
    sort: 11,
  },
];

function keywordRegex(k: string): RegExp | null {
  const m = k.match(/^\/(.+)\/([a-z]*)$/);
  try {
    if (m) return new RegExp(m[1], m[2].includes("i") ? m[2] : m[2] + "i");
    const esc = k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return esc ? new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, "iu") : null;
  } catch {
    return null;
  }
}

export interface RuleMatch {
  key: string;
  name: string;
  /** The text that matched (as written in the row), the matching category, or what Amazon says. */
  hit: string;
  /** Amazon's own dangerous-goods data, a keyword in the row's text, the Amazon category, or your IP-risk list. */
  source?: "amazon" | "keyword" | "category" | "ipRisk";
  /** An IP-risk match: its level (the rule's fail mode applies to high only). */
  level?: "low" | "medium" | "high";
}

/** How a match reads in the gate and the why line: "keyword match: aerosol". */
export const matchReason = (m: RuleMatch) => (m.source === "keyword" ? `keyword match: ${m.hit}` : m.hit);

/** Amazon's dangerous-goods data for a listing (see spapi/types AmazonDg). */
export interface DgFacts {
  hazmat: { un: string | null; name: string | null; class: string | null } | null;
  ghs: string[];
  declared: string[];
  heatSensitive: boolean;
}

const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Rules Amazon's own data triggers, ahead of any keyword: a regulated transport entry maps
 * by UN number, shipping name and class (aerosol, flammable, lithium battery, else
 * chemical); GHS classes likewise; is_heat_sensitive is Meltable. `legacy` is the older
 * stored form (declared regulations, "batteries") for rows screened before this data.
 */
export function amazonRuleMatches(rules: CategoryRule[], dg: DgFacts | null | undefined, legacy: string[] = []): RuleMatch[] {
  const name = (key: string) => rules.find((r) => r.key === key)?.name ?? DEFAULT_RULES.find((r) => r.key === key)?.name ?? key;
  const out = new Map<string, RuleMatch>();
  const add = (key: string, hit: string) => { if (!out.has(key)) out.set(key, { key, name: name(key), hit, source: "amazon" }); };
  const h = dg?.hazmat;
  // A UN number or a real transport class makes it regulated; a shipping name alone only when
  // it names a hazard (listings carry junk like "auto-grounding" there).
  const known = /aerosol|flammable|perfum|ethanol|alcohol|lithium|batter|corrosive|toxic|oxidi|peroxide|gas/i;
  if (h && (h.un || (h.class && !/^0$/.test(h.class)) || known.test(h.name ?? ""))) {
    const un = (h.un ?? "").toUpperCase().replace(/^(\d)/, "UN$1");
    const ship = h.name ?? "";
    const cls = h.class ?? "";
    const said = [un, ship && cap(ship.replace(/,?\s*n\.o\.s\..*$/i, "").trim()), cls && `class ${cls}`].filter(Boolean).join(", ");
    const hit = `Amazon marks this as hazmat${said ? `: ${said}` : ""}`;
    if (un === "UN1950" || /aerosol/i.test(ship) || /^2(\.|$)/.test(cls)) add("aerosol", hit);
    else if (/^UN3(480|481|090|091)$/.test(un) || /lithium|batter/i.test(ship)) add("battery", hit);
    else if (/^3(\.|$)/.test(cls) || /^UN(1266|1170|1993|1987|1219)$/.test(un) || /flammable|perfum|ethanol|alcohol/i.test(ship)) add("fragrance", hit);
    else add("chemical", hit);
  }
  for (const g of dg?.ghs ?? []) {
    const what = g.replace(/_/g, " ");
    if (/flammable/i.test(g)) add("fragrance", "Amazon marks this as flammable under GHS");
    else if (/compressed|gas/i.test(g)) add("aerosol", "Amazon marks this as a pressurised gas under GHS");
    else add("chemical", `Amazon marks this as hazardous under GHS: ${what}`);
  }
  if (dg?.heatSensitive) add("meltable", "Amazon marks this as heat-sensitive");
  const declared = [...(dg?.declared ?? []), ...legacy.filter((x) => x !== "batteries")];
  if (declared.length && !out.size) add("chemical", `Amazon marks this as regulated: ${[...new Set(declared)].join(", ")}`);
  if (legacy.includes("batteries")) add("battery", "Amazon lists batteries included or required");
  return [...out.values()];
}

/** Rules matched by a row's own text (name, brand, supplier category) and its Amazon category. */
export function matchRules(rules: CategoryRule[], text: string, amazonCategory?: string | null): RuleMatch[] {
  const out: RuleMatch[] = [];
  const cat = (amazonCategory ?? "").toLowerCase();
  for (const r of [...rules].sort((a, b) => a.sort - b.sort)) {
    let hit: string | null = null;
    for (const k of r.keywords) {
      const m = keywordRegex(k)?.exec(text);
      if (m) {
        hit = m[0].replace(/^[^\p{L}\p{N}]+/u, "").trim() || k;
        break;
      }
    }
    if (hit) {
      out.push({ key: r.key, name: r.name, hit, source: "keyword" });
      continue;
    }
    const ac = cat ? r.amazon_categories.find((c) => cat === c.toLowerCase()) : undefined;
    if (ac) out.push({ key: r.key, name: r.name, hit: `category ${ac}`, source: "category" });
  }
  return out;
}
