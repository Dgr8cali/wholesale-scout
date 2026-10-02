/**
 * Supplier quotes for a private-label candidate: each quote's landed cost per unit and the cash a
 * first order needs, the price multiple against Gatekeeper's bands, and a supplier enquiry (RFQ)
 * to paste. Pure: the page and the server share it.
 */

export const QUOTE_SOURCES = ["Alibaba", "1688", "UK wholesaler", "Other"] as const;
export const QUOTE_STATUSES = ["requested", "received", "samples ordered", "samples received", "chosen", "rejected"] as const;
export const CURRENCIES = ["USD", "GBP", "CNY", "EUR"] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type Currency = (typeof CURRENCIES)[number];

/** Units of the quote currency per £1, to start from: check today's rate (xe.com). */
export const DEFAULT_FX: Record<Currency, number> = { GBP: 1, USD: 1.27, EUR: 1.17, CNY: 9.2 };
/** Import VAT on goods + freight + duty. */
export const IMPORT_VAT = 0.2;

export interface Quote {
  id: string; candidate_id: string; supplier_name: string; source: QuoteSource; contact: string | null;
  /** Ex-works, per unit, in `currency`. */
  unit_price: number | null; currency: Currency; moq: number | null; lead_time_days: number | null;
  sample_cost: number | null; sample_lead_days: number | null; notes: string | null; status: QuoteStatus;
  /** The landed-cost calculator's inputs (blank ones take the defaults). */
  calc: Partial<LandedInputs> | null;
  created_at: string; updated_at: string;
}

export interface LandedInputs {
  /** Units ordered (default: the MOQ). */
  units: number;
  /** Quote currency per £1 (default: DEFAULT_FX). */
  fx: number;
  /** Freight to the UK, total £. */
  freight: number;
  /** Customs duty, % of goods + freight (UK duty is on the value at the border). */
  dutyPct: number;
  /** Import VAT counted as a cost (a seller not VAT-registered can't reclaim it). */
  vat: boolean;
  /** Pre-shipment inspection, £. */
  inspection: number;
  /** Anything else, £ (labels, packaging changes, a courier for samples…). */
  other: number;
}

/** The calculator's inputs: what was saved, else the defaults (units = MOQ, FX = DEFAULT_FX, VAT on). */
export function landedInputs(q: Pick<Quote, "moq" | "currency" | "calc">): LandedInputs {
  const c = q.calc ?? {};
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    units: n(c.units, q.moq ?? 0), fx: n(c.fx, DEFAULT_FX[q.currency] ?? 1), freight: n(c.freight, 0), dutyPct: n(c.dutyPct, 0),
    vat: c.vat !== false, inspection: n(c.inspection, 0), other: n(c.other, 0),
  };
}

export interface Landed {
  units: number;
  /** Goods in £ (unit price × units ÷ FX). */
  goods: number; freight: number; duty: number; vat: number; inspection: number; other: number;
  /** Everything the order costs in cash, £. */
  total: number;
  /** total ÷ units. */
  perUnit: number;
  /** Per unit without the import VAT: the cost once VAT-registered and reclaiming it. */
  perUnitExVat: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A quote's landed cost: goods + freight + duty (on goods + freight) + import VAT (on all three) + inspection + other. */
export function landedCost(q: Pick<Quote, "unit_price" | "moq" | "currency" | "calc">, override?: Partial<LandedInputs>): Landed | null {
  const i = { ...landedInputs(q), ...(override ?? {}) };
  if (q.unit_price == null || !(i.units > 0) || !(i.fx > 0)) return null;
  const goods = (q.unit_price * i.units) / i.fx;
  const duty = ((goods + i.freight) * i.dutyPct) / 100;
  const vat = i.vat ? (goods + i.freight + duty) * IMPORT_VAT : 0;
  const total = goods + i.freight + duty + vat + i.inspection + i.other;
  return {
    units: i.units, goods: r2(goods), freight: r2(i.freight), duty: r2(duty), vat: r2(vat), inspection: r2(i.inspection), other: r2(i.other),
    total: r2(total), perUnit: r2(total / i.units), perUnitExVat: r2((total - vat) / i.units),
  };
}

/** Sell ÷ landed against Gatekeeper's bands: 3.5× and over passes, 3–3.5× warns, under 3× fails. */
export function priceMultiple(sell: number | null, landed: number | null): { multiple: number; status: "pass" | "warn" | "fail" } | null {
  if (sell == null || landed == null || !(landed > 0) || !(sell > 0)) return null;
  const multiple = sell / landed;
  return { multiple, status: multiple >= 3.5 ? "pass" : multiple >= 3 ? "warn" : "fail" };
}

/** Certifications and test reports to ask for, by the candidate's referral category. */
export function certificationsFor(category: string | null | undefined): string[] {
  const c = (category ?? "").toLowerCase();
  const base = ["REACH compliance (no restricted substances)", "UKCA or CE marking where the product needs it"];
  if (/baby/.test(c)) return ["EN 71 (toy safety) if a child can handle it", "EN 14350 / EN 14372 for feeding and childcare items", "BPA-free and food-contact test reports (LFGB or FDA)", ...base];
  if (/toy/.test(c)) return ["EN 71 parts 1–3", "UKCA marking", ...base];
  if (/kitchen|home|grocery|food/.test(c)) return ["Food-contact test reports (LFGB or FDA, EU 10/2011 for plastics) if it touches food", "BPA-free declaration for plastics", ...base];
  if (/electr|computer|camera|lighting/.test(c)) return ["UKCA / CE with the Declaration of Conformity", "RoHS", "EN 62368 or the product's safety standard", "WEEE registration details", ...base];
  if (/beauty|health|personal/.test(c)) return ["Ingredient list (INCI) and SDS", "UK Responsible Person details for cosmetics", ...base];
  if (/pet/.test(c)) return ["Material safety data (non-toxic materials)", ...base];
  return base;
}

/**
 * A supplier enquiry to paste into Alibaba or an email: the product and its differentiator
 * (Gate 4's six words), quantity tiers, packaging, certifications for the category, samples and
 * lead times.
 */
export function rfqText(x: { name: string; nicheKeyword?: string | null; category?: string | null; differentiator?: string | null; sizeCm?: string | null; weightG?: number | null; sellPrice?: number | null }): string {
  const product = x.nicheKeyword?.trim() || x.name;
  const lines = [
    `Hello,`,
    ``,
    `I'm sourcing a ${product} to sell under my own brand on Amazon UK, and I'd like a quote.`,
    ``,
    `Product`,
    `- ${product}${x.differentiator?.trim() ? `, made to this specification: ${x.differentiator.trim()}` : ""}`,
    ...(x.sizeCm ? [`- Packed size about ${x.sizeCm} cm`] : []),
    ...(x.weightG ? [`- Packed weight about ${x.weightG} g`] : []),
    `- My logo on the product and the packaging (please say how: print, engraving or label, and any extra cost)`,
    ``,
    `Quantities: please quote the unit price (ex-works, and FOB if you can) at 300, 500 and 1,000 units, with your MOQ.`,
    ``,
    `Packaging`,
    `- Retail box or bag with my design, one unit each, with a scannable FNSKU barcode label I'll send`,
    `- Packed for Amazon FBA: polybags with a suffocation warning where needed; export cartons under 23 kg, each marked with its contents`,
    ``,
    `Certifications and documents`,
    ...certificationsFor(x.category).map((c) => `- ${c}`),
    ``,
    `Samples`,
    `- The price of 2–3 samples delivered to the UK, and how long they take`,
    ``,
    `Please also tell me`,
    `- Production lead time after the deposit, and payment terms`,
    `- Whether you are the factory or a trading company`,
    ``,
    `Thank you.`,
  ];
  return lines.join("\n");
}
