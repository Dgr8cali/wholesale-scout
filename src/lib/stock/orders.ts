/**
 * Orders and suppliers from Stock: the supplier's order number and page, dates, tracking and
 * currency on a purchase or a receipt, and a new supplier's fields. Checked here, shared by the
 * server and the forms. Pure.
 */

export const SUPPLIER_KINDS = ["manufacturer", "wholesaler", "marketplace", "retailer"] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];
export const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = { manufacturer: "Manufacturer", wholesaler: "Wholesaler", marketplace: "Marketplace seller", retailer: "Retailer" };
/** Suggestions for a marketplace seller's marketplace (any name is accepted). */
export const MARKETPLACES = ["Alibaba", "1688", "AliExpress", "eBay", "Amazon", "Temu", "Etsy"] as const;
export const CURRENCIES = ["GBP", "USD", "EUR", "CNY"] as const;

export interface NewSupplier {
  name: string; kind?: string | null; marketplace?: string | null; website?: string | null; contact?: string | null;
  /** Lead time: the supplier's delivery days. */
  leadTimeDays?: number | string | null; notes?: string | null;
}

const str = (v: unknown, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** "example.com/x" → "https://example.com/x"; anything that isn't a web address is refused. */
export function webUrl(v: unknown, what: string): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    if (!new URL(u).hostname.includes(".")) throw new Error();
    return u;
  } catch {
    throw new Error(`${what} must be a web address`);
  }
}

/** A new supplier's row (source "stock": added from Stock, no price lists). */
export function supplierRow(x: NewSupplier) {
  const name = str(x.name, 120);
  if (!name) throw new Error("A supplier needs a name");
  const kind = str(x.kind);
  if (kind && !SUPPLIER_KINDS.includes(kind as SupplierKind)) throw new Error(`Type must be one of ${SUPPLIER_KINDS.join(", ")}`);
  const lead = x.leadTimeDays === "" || x.leadTimeDays == null ? null : Number(x.leadTimeDays);
  if (lead != null && !(Number.isInteger(lead) && lead >= 0 && lead <= 365)) throw new Error("Lead time must be a whole number of days, 0–365");
  return {
    name, source_type: "stock" as const, kind: kind as SupplierKind | null, marketplace: kind === "marketplace" ? str(x.marketplace, 60) : null,
    website: webUrl(x.website, "Website"), contact: str(x.contact), delivery_days: lead, notes: str(x.notes, 2000),
  };
}

/** The order fields as forms send them. */
export interface OrderInput {
  orderId?: string | null; orderUrl?: string | null; orderedDate?: string | null; expectedDate?: string | null;
  trackingCarrier?: string | null; trackingNumber?: string | null;
  /** GBP unless given; another currency needs the rate. */
  currency?: string | null;
  /** £ per 1 unit of the currency (USD at 0.79 means $1 = £0.79). */
  fxRate?: number | string | null;
  /** The price per unit in that currency. */
  unitCostCcy?: number | string | null;
}

export interface OrderCols {
  order_id: string | null; order_url: string | null; expected_date: string | null;
  tracking_carrier: string | null; tracking_number: string | null;
  currency: string; fx_rate: number | null; unit_cost_ccy: number | null;
}

/**
 * The order's columns, checked, and the unit cost in £ when it was given in another currency
 * (unit cost × rate). `orderedDate` comes back separately: purchases keep it as ordered_on.
 */
export function orderCols(x: OrderInput): { cols: OrderCols; orderedDate: string | null; unitCostGbp: number | null } {
  const currency = (str(x.currency, 3) ?? "GBP").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code, e.g. USD");
  const fx = x.fxRate === "" || x.fxRate == null ? null : Number(x.fxRate);
  if (fx != null && !(fx > 0 && Number.isFinite(fx))) throw new Error("The FX rate must be a positive number (£ per 1 unit of the currency)");
  if (currency !== "GBP" && fx == null) throw new Error(`An FX rate is needed for ${currency}: £ per ${currency} 1`);
  const ccy = x.unitCostCcy === "" || x.unitCostCcy == null ? null : Number(x.unitCostCcy);
  if (ccy != null && !(ccy >= 0 && Number.isFinite(ccy))) throw new Error("The unit cost must be a number");
  for (const [k, v] of [["Ordered", x.orderedDate], ["Expected", x.expectedDate]] as const) if (v && !isDate(v)) throw new Error(`${k} date must be YYYY-MM-DD`);
  return {
    cols: {
      order_id: str(x.orderId, 120), order_url: webUrl(x.orderUrl, "Order link"), expected_date: x.expectedDate || null,
      tracking_carrier: str(x.trackingCarrier, 60), tracking_number: str(x.trackingNumber, 80),
      currency, fx_rate: currency === "GBP" ? null : fx, unit_cost_ccy: currency === "GBP" ? null : ccy,
    },
    orderedDate: x.orderedDate || null,
    unitCostGbp: currency !== "GBP" && ccy != null && fx != null ? r2(ccy * fx) : null,
  };
}

/** True when a form sent any order field (so an edit only touches them when asked). */
export const hasOrderInput = (x: Record<string, unknown>) =>
  ["orderId", "orderUrl", "expectedDate", "trackingCarrier", "trackingNumber", "currency", "fxRate", "unitCostCcy"].some((k) => x[k] !== undefined);

/** "Royal Mail · AB123456789GB". */
export const trackingText = (carrier: string | null | undefined, number: string | null | undefined) => [carrier, number].filter(Boolean).join(" · ") || null;
