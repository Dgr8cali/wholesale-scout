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
  /** The keyword or category that matched. */
  hit: string;
}

/** Rules matched by a row's own text (name, brand, supplier category) and its Amazon category. */
export function matchRules(rules: CategoryRule[], text: string, amazonCategory?: string | null): RuleMatch[] {
  const out: RuleMatch[] = [];
  const cat = (amazonCategory ?? "").toLowerCase();
  for (const r of [...rules].sort((a, b) => a.sort - b.sort)) {
    const kw = r.keywords.find((k) => keywordRegex(k)?.test(text));
    if (kw) {
      out.push({ key: r.key, name: r.name, hit: kw });
      continue;
    }
    const ac = cat ? r.amazon_categories.find((c) => cat === c.toLowerCase()) : undefined;
    if (ac) out.push({ key: r.key, name: r.name, hit: `category ${ac}` });
  }
  return out;
}
