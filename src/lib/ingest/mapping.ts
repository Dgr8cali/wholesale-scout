/**
 * Price-list normalisation: header detection, layout fingerprint, column mapping,
 * and turning sheet rows into normalised offer rows in GBP ex-VAT.
 *
 * Pure and shared by the browser (preview) and the server (ingest).
 */

/** Upload limits. Rows are parsed in the browser; 5,000 rows is ~1.5 MB of JSON to store. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5_000;

export const MAPPABLE_FIELDS = [
  { key: "ean", label: "EAN / GTIN", required: true },
  { key: "unitPrice", label: "Unit price", required: true },
  { key: "packUnits", label: "Unit / pack size", required: false },
  { key: "moq", label: "MOQ per line", required: false },
  { key: "stock", label: "Stock", required: false },
  { key: "title", label: "Product name", required: false },
  { key: "brand", label: "Brand", required: false },
  { key: "category", label: "Category", required: false },
] as const;

export type FieldKey = (typeof MAPPABLE_FIELDS)[number]["key"];

export interface ColumnMapping {
  /** Index of the header row in the sheet (suppliers often put a logo or title above it). */
  headerRow: number;
  /** Field → header text. */
  columns: Partial<Record<FieldKey, string>>;
  /** Whether the price is per piece or per pack of `packUnits`. */
  pricePer: "unit" | "pack";
}

export interface SupplierBasis {
  vatBasis: "ex_vat" | "inc_vat";
  /** VAT rate on these goods, %. Used to strip VAT from inc-VAT prices. */
  vatRate: number;
  currency: string;
}

export interface Fx {
  /** GBP per 1 unit of the supplier's currency. */
  rate: number;
  date: string;
}

export interface NormalizedRow {
  ean: string;
  /** Per unit, as quoted (supplier currency, supplier VAT basis). */
  unitCost: number;
  /** Per unit, GBP, ex-VAT. */
  unitCostGbp: number;
  packUnits: number;
  moq: number | null;
  stock: number | null;
  title: string | null;
  brand: string | null;
  category: string | null;
  sourceRow: number;
  eanValid: boolean;
  /** Where the row came from outside a sheet (Qogita: the product link). */
  externalRef?: string | null;
  /** ASIN check: the product (already matched to its ASIN) this row is for, instead of by EAN. */
  productId?: string;
  /** ASIN check with no cost given: unitCost is 0 and the fee gates are skipped. */
  costKnown?: boolean;
}

export interface RejectedRow {
  sourceRow: number;
  reason: string;
  title: string | null;
  raw: Record<string, unknown>;
}

export type Cell = string | number | boolean | null | undefined;

const norm = (h: unknown) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Stable fingerprint of a header row: order-independent, case- and space-insensitive. */
export function headerFingerprint(headers: Cell[]): string {
  const key = headers.map(norm).filter(Boolean).sort().join("|");
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const GUESS: Record<FieldKey, RegExp> = {
  ean: /\b(ean|gtin|barcode|bar code|upc|ean ?13|ean code)\b/,
  unitPrice: /\b(unit price|unit cost|price|cost|trade|wholesale|net price|your price|buy price|each)\b/,
  packUnits: /\b(pack ?size|units? per|case ?size|unit|inner|pack qty|qty per pack|pcs)\b/,
  moq: /\b(moq|min(imum)? ?(order)? ?(qty|quantity)?)\b/,
  stock: /\b(stock|available|qty available|quantity available|inventory|on hand)\b/,
  title: /\b(description|product name|product|title|item name|item|name)\b/,
  brand: /\b(brand|manufacturer|make)\b/,
  category: /\b(category|department|range|type)\b/,
};

/** Best-guess mapping from header text. Each header is used at most once. */
export function guessMapping(headers: Cell[]): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  const used = new Set<string>();
  const order: FieldKey[] = ["ean", "moq", "stock", "brand", "category", "packUnits", "unitPrice", "title"];
  for (const f of order) {
    const h = headers.map((x) => String(x ?? "").trim()).find((x) => x && !used.has(x) && GUESS[f].test(norm(x)));
    if (h) {
      out[f] = h;
      used.add(h);
    }
  }
  return out;
}

/** The header row: the row in the first 20 with the most cells that look like known headers. */
export function detectHeaderRow(rows: Cell[][]): number {
  let best = 0, bestScore = -1;
  rows.slice(0, 20).forEach((row, i) => {
    const texts = row.filter((c) => typeof c === "string" && c.trim()) as string[];
    const hits = texts.filter((t) => Object.values(GUESS).some((re) => re.test(norm(t)))).length;
    const score = hits * 10 + texts.length;
    if (texts.length >= 2 && score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** Non-empty header texts of a row. */
export function headersOf(rows: Cell[][], headerRow: number): string[] {
  return (rows[headerRow] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
}

/**
 * Apply a remembered layout to this file. The layout is recognised by its headers, so the
 * header row is wherever those headers are in *this* file: a new export can carry one more or
 * one fewer banner line than the one the layout was saved from. Columns this file lacks are
 * dropped rather than mapped to nothing.
 */
export function rememberedMapping(rows: Cell[][], saved: ColumnMapping, fingerprint: string): ColumnMapping {
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const hs = headersOf(rows, i);
    if (hs.length >= 2 && headerFingerprint(hs) === fingerprint) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) headerRow = detectHeaderRow(rows);
  const present = new Set(headersOf(rows, headerRow));
  const columns = Object.fromEntries(Object.entries(saved.columns).filter(([, h]) => h && present.has(h))) as ColumnMapping["columns"];
  return { ...saved, headerRow, columns };
}

/** "£1,234.50", "1.234,50 €", "12,5", 12.5 → number. */
export function parseMoney(v: Cell): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (v == null || typeof v === "boolean") return null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // A lone comma with 1–2 digits after it is a decimal comma; otherwise thousands.
    s = /,\d{1,2}$/.test(s) && (s.match(/,/g) ?? []).length === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function parseCount(v: Cell): number | null {
  const n = parseMoney(v);
  return n == null ? null : Math.round(n);
}

/** GTIN check digit. */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Normalise to EAN-13 where possible: digits only, UPC-12 padded, GTIN-14 with a
 * leading zero trimmed. Excel numbers (5012345678900) are handled; scientific
 * notation has already lost digits and is rejected.
 */
export function normalizeEan(v: Cell): string | null {
  if (v == null || v === "") return null;
  let s = typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(0) : "") : String(v).trim();
  if (/e\+/i.test(s)) return null;
  s = s.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(s)) return null;
  if (s.length === 12) s = "0" + s;
  if (s.length === 14 && s.startsWith("0")) s = s.slice(1);
  if (s.length < 8 || s.length > 14) return null;
  return s;
}

/** Sheet rows (arrays) → objects keyed by header, starting below the header row. */
export function rowsToObjects(rows: Cell[][], headerRow: number): { headers: string[]; records: { row: number; values: Record<string, Cell> }[] } {
  const headers = (rows[headerRow] ?? []).map((h) => String(h ?? "").trim());
  const records: { row: number; values: Record<string, Cell> }[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!r.some((c) => c != null && String(c).trim() !== "")) continue;
    const values: Record<string, Cell> = {};
    headers.forEach((h, j) => {
      if (h) values[h] = r[j];
    });
    records.push({ row: i + 1, values }); // 1-based, as the spreadsheet shows it
  }
  return { headers, records };
}

export function applyMapping(
  rows: Cell[][],
  mapping: ColumnMapping,
  basis: SupplierBasis,
  fx: Fx,
): { rows: NormalizedRow[]; rejected: RejectedRow[] } {
  const { records } = rowsToObjects(rows, mapping.headerRow);
  const col = mapping.columns;
  const get = (v: Record<string, Cell>, f: FieldKey) => (col[f] ? v[col[f]!] : undefined);
  const text = (c: Cell) => (c == null || String(c).trim() === "" ? null : String(c).trim());

  const out: NormalizedRow[] = [];
  const rejected: RejectedRow[] = [];
  for (const { row, values } of records) {
    const title = text(get(values, "title"));
    const ean = normalizeEan(get(values, "ean"));
    if (!ean) {
      rejected.push({ sourceRow: row, reason: "No usable EAN", title, raw: values });
      continue;
    }
    const price = parseMoney(get(values, "unitPrice"));
    if (price == null || price <= 0) {
      rejected.push({ sourceRow: row, reason: "No price", title, raw: values });
      continue;
    }
    const packUnits = Math.max(1, parseCount(get(values, "packUnits")) ?? 1);
    const perUnit = mapping.pricePer === "pack" ? price / packUnits : price;
    const exVat = basis.vatBasis === "inc_vat" ? perUnit / (1 + basis.vatRate / 100) : perUnit;
    out.push({
      ean,
      unitCost: round4(perUnit),
      unitCostGbp: round4(exVat * fx.rate),
      packUnits,
      moq: parseCount(get(values, "moq")),
      stock: parseCount(get(values, "stock")),
      title,
      brand: text(get(values, "brand")),
      category: text(get(values, "category")),
      sourceRow: row,
      eanValid: validGtin(ean),
    });
  }
  return { rows: out, rejected };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const CURRENCIES = ["GBP", "EUR", "USD", "PLN", "CHF", "SEK", "DKK", "CZK", "HUF", "CNY", "HKD", "JPY", "CAD", "AUD", "TRY", "AED"] as const;

/**
 * Currency named in a price column's header: "Price (€)", "Unit cost USD", "Prijs EUR",
 * "US$ each". Codes win over symbols; a bare "$" is read as USD. null when none is named.
 */
export function currencyFromHeader(header: string | null | undefined): (typeof CURRENCIES)[number] | null {
  const h = (header ?? "").trim();
  if (!h) return null;
  for (const code of CURRENCIES) if (new RegExp(`(^|[^A-Za-z])${code}([^A-Za-z]|$)`, "i").test(h)) return code;
  if (/\beuros?\b/i.test(h)) return "EUR";
  const symbols: [RegExp, (typeof CURRENCIES)[number]][] = [
    [/€/, "EUR"],
    [/£/, "GBP"],
    [/zł/i, "PLN"],
    [/HK\$/i, "HKD"],
    [/(CA|C)\$/, "CAD"],
    [/(AU|A)\$/, "AUD"],
    [/\$/, "USD"],
  ];
  for (const [re, code] of symbols) if (re.test(h)) return code;
  return null;
}
