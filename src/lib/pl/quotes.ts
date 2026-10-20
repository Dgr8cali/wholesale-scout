/**
 * Supplier quotes for a private-label candidate: each quote's landed cost per unit and the cash a
 * first order needs, the price multiple against Gatekeeper's bands, and a supplier enquiry (RFQ)
 * to paste. Pure: the page and the server share it.
 */

export const QUOTE_SOURCES = ["Alibaba", "1688", "UK wholesaler", "Other"] as const;
export const QUOTE_STATUSES = ["requested", "received", "samples ordered", "samples received", "chosen", "rejected"] as const;
export const CURRENCIES = ["USD", "GBP", "CNY", "EUR"] as const;
export const FREIGHT_MODES = ["sea", "rail", "air", "express"] as const;
export const SAMPLE_STATUSES = ["not ordered", "ordered", "received"] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type Currency = (typeof CURRENCIES)[number];
export type FreightMode = (typeof FREIGHT_MODES)[number];
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

/** One-off charges on the ex-works invoice, in the quote's currency. */
export const EXTRAS = [
  { k: "plate", label: "Plate / setup" },
  { k: "cards", label: "Cards" },
  { k: "shrink", label: "Shrink wrap" },
  { k: "other", label: "Other" },
] as const;
export type ExtraKey = (typeof EXTRAS)[number]["k"];

/** A label with a stable key: renaming the label keeps the scores or notes given under the key. */
export interface Label { k: string; label: string }
export const LABEL_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/;
/** How many criteria a sample is scored on, and how many spec notes. */
export const CRITERIA_COUNT = 6;
export const SPEC_COUNT = 4;

/** What a sample is scored on, 1 (poor) to 5 (excellent): the generic set, for any product. */
export const GENERIC_CRITERIA: Label[] = [
  { k: "quality", label: "Build quality / finish" },
  { k: "works", label: "Works as described" },
  { k: "feel", label: "Materials / feel" },
  { k: "size", label: "Size / fit" },
  { k: "packaging", label: "Packaging" },
  { k: "durability", label: "Durability" },
];
/** Lens cleaning wipes' criteria (the first comparison's). */
export const LENS_CRITERIA: Label[] = [
  { k: "moisture", label: "Moisture / stays wet" },
  { k: "cleaning", label: "Cleaning / no streaks" },
  { k: "smell", label: "Smell" },
  { k: "sachet", label: "Sachet opens easily" },
  { k: "size", label: "Wipe size / feel" },
  { k: "box", label: "Box quality" },
];
/** Spec notes, free text: the generic set. */
export const GENERIC_SPEC: Label[] = [
  { k: "size", label: "Product size" },
  { k: "materials", label: "Materials" },
  { k: "box", label: "Box size / weight" },
  { k: "shelfLife", label: "Shelf life / warranty" },
];
export const LENS_SPEC: Label[] = [
  { k: "wipe", label: "Wipe size" },
  { k: "sachet", label: "Sachet size / material" },
  { k: "box", label: "Box size / weight" },
  { k: "shelfLife", label: "Shelf life" },
];
export type SampleScores = { note?: string } & Record<string, number | string | undefined>;
export interface QuoteLabels { criteria: Label[]; spec: Label[] }

/** A candidate's labels: its own when set (and well formed), else the generic set. */
export function labelsOf(c: { sample_criteria?: unknown; spec_fields?: unknown }): QuoteLabels {
  const ok = (x: unknown, n: number): x is Label[] => Array.isArray(x) && x.length === n && x.every((l) => l && LABEL_KEY.test(String(l.k)) && String(l.label ?? "").trim());
  return { criteria: ok(c.sample_criteria, CRITERIA_COUNT) ? c.sample_criteria : GENERIC_CRITERIA, spec: ok(c.spec_fields, SPEC_COUNT) ? c.spec_fields : GENERIC_SPEC };
}

/**
 * New labels, checked: exactly six criteria and four spec labels, each 1–40 characters, keys unique.
 * A slot without a key keeps the current one's (so its scores stay); a new key is made from the label.
 */
export function checkLabels(input: { criteria?: unknown; spec?: unknown }, cur: QuoteLabels): QuoteLabels {
  const one = (x: unknown, was: Label[], n: number, what: string): Label[] => {
    if (!Array.isArray(x) || x.length !== n) throw new Error(`${what}: exactly ${n}`);
    const out = x.map((l, i) => {
      const label = String((l as Label)?.label ?? "").trim();
      if (!label) throw new Error(`${what} ${i + 1}: give it a name`);
      if (label.length > 40) throw new Error(`${what} ${i + 1}: 40 characters at most`);
      const given = String((l as Label)?.k ?? "");
      const k = LABEL_KEY.test(given) ? given : was[i]?.k ?? (label.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || `c${i + 1}`);
      return { k, label };
    });
    if (new Set(out.map((l) => l.k)).size !== out.length) throw new Error(`${what}: two slots share a key`);
    return out;
  };
  return {
    criteria: input.criteria === undefined ? cur.criteria : one(input.criteria, cur.criteria, CRITERIA_COUNT, "Criterion"),
    spec: input.spec === undefined ? cur.spec : one(input.spec, cur.spec, SPEC_COUNT, "Spec label"),
  };
}

/** Units of the quote currency per £1, to start from: check today's rate (xe.com). */
export const DEFAULT_FX: Record<Currency, number> = { GBP: 1, USD: 1.27, EUR: 1.17, CNY: 9.2 };
/** Import VAT on goods + freight + duty. */
export const IMPORT_VAT = 0.2;

export interface Quote {
  id: string; candidate_id: string; supplier_name: string; source: QuoteSource; contact: string | null;
  /** Ex-works, per unit, in `currency`. */
  unit_price: number | null; currency: Currency; moq: number | null;
  /** Production days after the deposit (the longest quoted). */
  lead_time_days: number | null;
  sample_cost: number | null; sample_lead_days: number | null; notes: string | null; status: QuoteStatus;
  /** The landed-cost calculator's inputs (blank ones take the defaults). */
  calc: Partial<LandedInputs> | null;
  /** Several ways to ship it, one `used` for the landed cost (empty: the single fields below apply). */
  freight_options?: FreightOption[] | null;
  freight_mode?: FreightMode | null;
  /** Delivered duty paid: the freight price includes duty and import VAT. */
  ddp?: boolean | null;
  /** Factory to the FBA warehouse, days (the longest quoted). */
  transit_days?: number | null;
  /** A larger order's unit price, in `currency`. */
  next_tier_qty?: number | null; next_tier_price?: number | null;
  /** One-off charges on the ex-works invoice, in `currency`. */
  extras?: Partial<Record<ExtraKey, number>> | null;
  sample_status?: SampleStatus | null; sample_received_on?: string | null;
  /** 1–5 under each of the candidate's criteria' keys, and a note. */
  sample_scores?: SampleScores | null;
  /** Free text under each of the candidate's spec labels' keys. */
  spec?: Record<string, string> | null;
  created_at: string; updated_at: string;
}

/** One way to ship a quote: a mode, whether it's DDP, its cost and the days in transit. */
export interface FreightOption {
  id: string; mode: FreightMode;
  /** Delivered duty paid; null when the supplier didn't say. */
  ddp: boolean | null;
  /** The total for the shipment, in `currency` (the quote's, or GBP). */
  cost: number | null; currency: Currency;
  /** Factory to FBA, days (the longest quoted). */
  transit_days: number | null;
  /** The one the landed cost uses. */
  used: boolean;
}

/** The freight the landed cost uses: the option marked used (else the first), or the quote's single fields. */
export function usedFreight(q: Pick<Quote, "currency" | "calc"> & Partial<Pick<Quote, "freight_options" | "freight_mode" | "ddp" | "transit_days">>):
  { mode: FreightMode | null; ddp: boolean | null; costGbp: number | null; transit_days: number | null; option: FreightOption | null } {
  const opts = q.freight_options ?? [];
  if (opts.length) {
    const o = opts.find((x) => x.used) ?? opts[0];
    return { mode: o.mode, ddp: o.ddp, costGbp: freightGbp(o, q), transit_days: o.transit_days, option: o };
  }
  return { mode: q.freight_mode ?? null, ddp: q.ddp ?? null, costGbp: typeof q.calc?.freight === "number" ? q.calc.freight : null, transit_days: q.transit_days ?? null, option: null };
}

/** An option's cost in £, at the quote's FX when it's in the quote's currency. */
export function freightGbp(o: Pick<FreightOption, "cost" | "currency">, q: Pick<Quote, "currency" | "calc">): number | null {
  if (o.cost == null) return null;
  if (o.currency === "GBP") return o.cost;
  const c = q.calc ?? {};
  const fx = typeof c.fx === "number" && c.fx > 0 ? c.fx : DEFAULT_FX[o.currency] ?? 1;
  // An option in the quote's currency converts at the quote's FX; another currency at its default rate.
  return o.cost / (o.currency === q.currency ? fx : DEFAULT_FX[o.currency]);
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

/**
 * The calculator's inputs: what was saved, else the defaults (units = MOQ, FX = DEFAULT_FX, VAT on).
 * Freight is the used freight option's, in £, when the quote has options.
 */
export function landedInputs(q: Pick<Quote, "moq" | "currency" | "calc"> & Partial<Pick<Quote, "freight_options">>): LandedInputs {
  const c = q.calc ?? {};
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const opt = q.freight_options?.length ? usedFreight({ currency: q.currency, calc: q.calc, freight_options: q.freight_options }).costGbp : null;
  return {
    units: n(c.units, q.moq ?? 0), fx: n(c.fx, DEFAULT_FX[q.currency] ?? 1), freight: opt ?? n(c.freight, 0), dutyPct: n(c.dutyPct, 0),
    vat: c.vat !== false, inspection: n(c.inspection, 0), other: n(c.other, 0),
  };
}

export interface Landed {
  units: number;
  /** Goods in £ (unit price × units ÷ FX). */
  goods: number;
  /** The ex-works invoice's one-off charges (plate, cards, shrink wrap, other) in £. */
  extras: number;
  freight: number; duty: number; vat: number; inspection: number; other: number;
  /** Everything the order costs in cash, £. */
  total: number;
  /** total ÷ units. */
  perUnit: number;
  /** Per unit without the import VAT: the cost once VAT-registered and reclaiming it. */
  perUnitExVat: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The extras' sum in the quote's currency. */
export function extrasTotal(q: Pick<Quote, "extras">): number {
  return EXTRAS.reduce((a, { k }) => a + (Number(q.extras?.[k]) || 0), 0);
}

/** The ex-works invoice in the quote's currency: unit price × units + the extras. */
export function exwTotal(q: Pick<Quote, "unit_price" | "moq" | "currency" | "calc" | "extras"> & Partial<Pick<Quote, "freight_options">>): number | null {
  const i = landedInputs(q);
  return q.unit_price == null || !(i.units > 0) ? null : q.unit_price * i.units + extrasTotal(q);
}

/**
 * A quote's landed cost: goods + the invoice's extras + freight + duty (on goods, extras and freight)
 * + import VAT (on all of those) + inspection + other.
 */
export function landedCost(q: Pick<Quote, "unit_price" | "moq" | "currency" | "calc"> & Partial<Pick<Quote, "extras" | "freight_options">>, override?: Partial<LandedInputs>): Landed | null {
  const i = { ...landedInputs(q), ...(override ?? {}) };
  if (q.unit_price == null || !(i.units > 0) || !(i.fx > 0)) return null;
  const goods = (q.unit_price * i.units) / i.fx;
  const extras = extrasTotal(q) / i.fx;
  const duty = ((goods + extras + i.freight) * i.dutyPct) / 100;
  const vat = i.vat ? (goods + extras + i.freight + duty) * IMPORT_VAT : 0;
  const total = goods + extras + i.freight + duty + vat + i.inspection + i.other;
  return {
    units: i.units, goods: r2(goods), extras: r2(extras), freight: r2(i.freight), duty: r2(duty), vat: r2(vat), inspection: r2(i.inspection), other: r2(i.other),
    total: r2(total), perUnit: r2(total / i.units), perUnitExVat: r2((total - vat) / i.units),
  };
}

/** Sell ÷ landed against Gatekeeper's bands: 3.5× and over passes, 3–3.5× warns, under 3× fails. */
export function priceMultiple(sell: number | null, landed: number | null): { multiple: number; status: "pass" | "warn" | "fail" } | null {
  if (sell == null || landed == null || !(landed > 0) || !(sell > 0)) return null;
  const multiple = sell / landed;
  return { multiple, status: multiple >= 3.5 ? "pass" : multiple >= 3 ? "warn" : "fail" };
}

/** The sample scores' average (1–5), over the candidate's criteria scored; null with none. */
export function sampleAverage(s: SampleScores | null | undefined, criteria: Label[]): number | null {
  const v = criteria.map(({ k }) => s?.[k]).filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** The samples' state: the quote's own, else read from its status. */
export function sampleStatusOf(q: Partial<Pick<Quote, "sample_status" | "sample_received_on">> & Pick<Quote, "status">): SampleStatus {
  if (q.sample_status) return q.sample_status;
  if (q.sample_received_on || q.status === "samples received") return "received";
  return q.status === "samples ordered" ? "ordered" : "not ordered";
}

/** Production + transit, and the day it would reach FBA if ordered on `from`; null without both. */
export function arrival(q: Pick<Quote, "lead_time_days" | "transit_days"> & Partial<Pick<Quote, "freight_options" | "currency" | "calc">>, from: Date = new Date()): { days: number; date: Date } | null {
  // The used freight option's transit when there are options.
  const used = q.freight_options?.length ? (q.freight_options.find((o) => o.used) ?? q.freight_options[0]).transit_days : q.transit_days;
  if (q.lead_time_days == null || used == null) return null;
  const days = q.lead_time_days + used;
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
  return { days, date };
}

/**
 * The best of a row: the indexes holding the lowest (or highest) value, when at least two values
 * are known and they aren't all the same.
 */
export function bestOf(values: (number | null | undefined)[], better: "low" | "high"): Set<number> {
  const known = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => typeof x[0] === "number" && Number.isFinite(x[0]));
  if (known.length < 2) return new Set();
  const nums = known.map(([v]) => v);
  const top = better === "low" ? Math.min(...nums) : Math.max(...nums);
  if (nums.every((v) => v === top)) return new Set();
  return new Set(known.filter(([v]) => v === top).map(([, i]) => i));
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
    // Proposal, not applied (Oct 2026): tiers from the max first order (supplierScore.ts maxMoqOf's
    // proposed capital-based default, M): round(M ÷ 2), M and 2 × M, each rounded to the nearest 50.
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
