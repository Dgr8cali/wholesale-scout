/**
 * Qogita's catalogue export (Catalog sheet: a few title lines, then the header row — row 5 in the
 * UK file — then one row per product). The price column names its currency ("£ Lowest Price inc.
 * shipping"); prices already include shipping and, on the UK account, exclude VAT. The price is per
 * item and "Unit" is the case size (the order multiple), as in Qogita's API: Neutrogena Cuticle Oil
 * 75ml at £4.97 with Unit 120 is £4.97 a bottle (inventory always comes in multiples of the unit),
 * not 4p. `pricePer: "case"` divides by the unit for an export that prices whole cases. GTINs are
 * kept as text (leading zeros matter); the product link is the URL inside the HYPERLINK formula. Pure.
 */

export interface QogitaCatalogRow {
  gtin: string;
  name: string;
  category: string | null;
  brand: string | null;
  /** The listed price, in `currency` (per item unless the file prices cases). */
  price: number;
  /** Items in a case: the order multiple (1 when blank). */
  unit: number;
  /** One item: the price, or price ÷ unit when the file prices cases. */
  unitCost: number;
  /** A whole case: unitCost × unit. */
  caseCost: number;
  inventory: number | null;
  preOrder: boolean;
  deliveryWeeks: number | null;
  offerCount: number | null;
  totalInventory: number | null;
  link: string | null;
}

export interface QogitaCatalog {
  rows: QogitaCatalogRow[];
  /** From the price column's header: "£ …" GBP, "€ …" EUR; null when it names neither. */
  currency: "GBP" | "EUR" | null;
  /** The header row's index (0-based) in the sheet. */
  headerRow: number;
  /** The price column's header as written. */
  priceHeader: string;
  /** The price includes shipping (the header says so). */
  shippingIncluded: boolean;
  skipped: { row: number; reason: string }[];
}

type Cell = string | number | boolean | null | undefined;

const norm = (s: Cell) => String(s ?? "").trim().toLowerCase();
const num = (v: Cell): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[£€$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** This sheet looks like Qogita's catalogue export: a header row with GTIN and a "Lowest Price" column. */
export function isQogitaCatalog(rows: Cell[][]): boolean {
  return findHeader(rows) >= 0;
}

function findHeader(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i].map(norm);
    if (r.includes("gtin") && r.some((c) => c.includes("lowest price"))) return i;
  }
  return -1;
}

/** The URL inside =HYPERLINK("https://…", "View Product"), or a plain URL. */
export function hyperlinkUrl(formulaOrValue: Cell): string | null {
  const s = String(formulaOrValue ?? "");
  const m = s.match(/HYPERLINK\(\s*"([^"]+)"/i) ?? s.match(/(https?:\/\/[^\s"]+)/);
  return m ? m[1] : null;
}

/**
 * The catalogue from the sheet's rows (values, as SheetJS reads them with raw values) and, for the
 * link column, the cells' formulas (row index → formula), since the HYPERLINK cells hold no value.
 */
export function parseQogitaCatalog(rows: Cell[][], formulas: Record<number, string> = {}, opts: { pricePer?: "item" | "case" } = {}): QogitaCatalog {
  const perCase = opts.pricePer === "case";
  const h = findHeader(rows);
  if (h < 0) throw new Error("Not a Qogita catalogue: no header row with GTIN and a Lowest Price column");
  const head = rows[h].map((c) => String(c ?? "").trim());
  const col = (pred: (s: string) => boolean) => head.findIndex((c) => pred(c.toLowerCase()));
  const c = {
    gtin: col((s) => s === "gtin"),
    name: col((s) => s === "name"),
    category: col((s) => s === "category"),
    brand: col((s) => s === "brand"),
    price: col((s) => s.includes("lowest price")),
    unit: col((s) => s === "unit"),
    inventory: col((s) => s.startsWith("lowest priced offer inventory")),
    pre: col((s) => s.includes("pre-order")),
    weeks: col((s) => s.includes("delivery time")),
    offers: col((s) => s.startsWith("number of offers")),
    total: col((s) => s.startsWith("total inventory")),
    link: col((s) => s.includes("link")),
  };
  const priceHeader = head[c.price];
  const currency = /£|\bgbp\b/i.test(priceHeader) ? "GBP" : /€|\beur\b/i.test(priceHeader) ? "EUR" : null;
  const out: QogitaCatalogRow[] = [];
  const skipped: { row: number; reason: string }[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((x) => x == null || x === "")) continue;
    // GTIN as text: a number would lose its leading zeros.
    const raw = r[c.gtin];
    const gtin = typeof raw === "number" ? String(raw).padStart(13, "0") : String(raw ?? "").trim();
    if (!/^\d{8,14}$/.test(gtin)) { skipped.push({ row: i + 1, reason: `GTIN "${raw ?? ""}"` }); continue; }
    const price = num(r[c.price]);
    if (price == null || price <= 0) { skipped.push({ row: i + 1, reason: "no price" }); continue; }
    const unit = Math.max(1, Math.round(num(c.unit >= 0 ? r[c.unit] : 1) ?? 1));
    out.push({
      gtin,
      name: String(r[c.name] ?? "").trim(),
      category: c.category >= 0 ? String(r[c.category] ?? "").trim() || null : null,
      brand: c.brand >= 0 ? String(r[c.brand] ?? "").trim() || null : null,
      price, unit,
      unitCost: Math.round((perCase ? price / unit : price) * 10000) / 10000,
      caseCost: Math.round((perCase ? price : price * unit) * 100) / 100,
      inventory: c.inventory >= 0 ? num(r[c.inventory]) : null,
      preOrder: c.pre >= 0 ? /^(yes|true|y)$/i.test(String(r[c.pre] ?? "").trim()) : false,
      deliveryWeeks: c.weeks >= 0 ? num(r[c.weeks]) : null,
      offerCount: c.offers >= 0 ? num(r[c.offers]) : null,
      totalInventory: c.total >= 0 ? num(r[c.total]) : null,
      link: c.link >= 0 ? hyperlinkUrl(formulas[i] ?? r[c.link]) : null,
    });
  }
  return { rows: out, currency, headerRow: h, priceHeader, shippingIncluded: /inc\.?\s*shipping|including shipping/i.test(priceHeader), skipped };
}
