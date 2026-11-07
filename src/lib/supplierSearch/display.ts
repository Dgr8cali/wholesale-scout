/** The shape of a search and its rows, and how they read. No server code, so the page can import it. */
import type { Confidence, SupplierType } from "./extract";

export type SearchKind = "wholesale" | "manufacturer";

export interface SupplierResult {
  url: string; supplier: string; type: SupplierType; typeEvidence: string | null; typeConfidence: Confidence | null;
  country: string | null; countryEvidence: string | null;
  price: number | null; currency: string | null; priceBasis: string | null; unitsInPrice: number | null; unitPrice: number | null;
  priceEvidence: string | null; priceProduct: string | null; moq: number | null; moqUnit: string | null; vat: string | null;
  /** False for a marketplace page the search doesn't open: only its link and title are known. */
  opened: boolean;
}
export interface SearchStats { read: number; failed: number; blocked: number; notOpened: number }
export interface SupplierSearch {
  id: string; query: string; kind: SearchKind; status: "running" | "done" | "failed"; error: string | null;
  results: SupplierResult[]; stats: SearchStats | null; warnings: string[]; cost_usd: number; created_at: string; finished_at: string | null;
}

const MIN_QUERY = 2, MAX_QUERY = 120;
const STALE_MS = 10 * 60_000;

export function parseSearchRequest(body: unknown): { query: string; kind: SearchKind } | string {
  const b = (body ?? {}) as { query?: unknown; kind?: unknown };
  const query = typeof b.query === "string" ? b.query.trim() : "";
  if (query.length < MIN_QUERY) return "Type the product you're looking for.";
  if (query.length > MAX_QUERY) return `Keep the product to ${MAX_QUERY} characters.`;
  return { query, kind: b.kind === "manufacturer" ? "manufacturer" : "wholesale" };
}

/** A restart can kill a search part-way, leaving its row running for ever. */
export function effectiveSearch<T extends { status: string; created_at: string; error: string | null }>(s: T, now = Date.now()): T {
  if (s.status !== "running" || now - Date.parse(s.created_at) < STALE_MS) return s;
  return { ...s, status: "failed", error: "This search was interrupted. Run it again." };
}

/** What today's searches have spent, with each one still running counted at its full limit. */
export function committedUsd(rows: { status: string; cost_usd: number; created_at: string; error: string | null }[], perSearchMax: number, now = Date.now()): number {
  return rows.reduce((sum, r) => {
    const cost = Number(r.cost_usd);
    return sum + (effectiveSearch(r, now).status === "running" ? Math.max(cost, perSearchMax) : cost);
  }, 0);
}

const SIGN: Record<string, string> = { GBP: "£", EUR: "€", USD: "$" };
const money = (n: number, currency: string | null) => {
  const figure = n.toFixed(n < 0.1 ? 3 : 2);
  if (!currency) return figure;
  const sign = SIGN[currency.toUpperCase()];
  return sign ? `${sign}${figure}` : `${currency} ${figure}`;
};

/** What the price buys, as the page said it. Null with no price: never an estimate. */
export function priceLine(r: SupplierResult): { main: string; unit: string | null } | null {
  if (r.price == null) return null;
  const figure = money(r.price, r.currency);
  const size = r.unitsInPrice && r.unitsInPrice > 1 ? ` of ${r.unitsInPrice}` : "";
  const main = r.priceBasis === "range" ? `from ${figure}`
    : r.priceBasis === "per_unit" ? `${figure} a unit`
    : r.priceBasis === "per_pack" ? `${figure} a pack${size}`
    : r.priceBasis === "per_case" ? `${figure} a case${size}`
    : figure;
  return { main, unit: r.unitPrice != null && r.priceBasis !== "per_unit" ? `${money(r.unitPrice, r.currency)} a unit` : null };
}

const CURRENCY_ORDER: Record<string, number> = { GBP: 0, EUR: 1, USD: 2 };
/** Sorts by unit price with each currency kept together: there are no exchange rates here. A row with no unit price sorts last. */
export function priceSortValue(r: SupplierResult): number | undefined {
  if (r.unitPrice == null) return undefined;
  return (CURRENCY_ORDER[r.currency?.toUpperCase() ?? ""] ?? 3) * 1_000_000 + r.unitPrice;
}

export function countryName(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "Unknown";
  try { return new Intl.DisplayNames(["en-GB"], { type: "region" }).of(code.toUpperCase()) ?? "Unknown"; } catch { return "Unknown"; }
}
