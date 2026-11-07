/** A finished search as rows for the page: suppliers only, what you asked for first. */
import type { SearchKind, SearchStats, SupplierResult } from "./display";
import { isComparisonHost } from "./pageText";
import type { PageResult, ProductRun } from "./spikeRun";

const hostOf = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : null;
  } catch { return null; }
};

function toRow(p: PageResult): SupplierResult | null {
  const host = hostOf(p.url);
  if (!host || isComparisonHost(host)) return null;
  const blank = { typeEvidence: null, typeConfidence: null, country: null, countryEvidence: null, price: null, currency: null, priceBasis: null, unitsInPrice: null, unitPrice: null, priceEvidence: null, priceProduct: null, moq: null, moqUnit: null, vat: null };
  if (p.status === "snippet_only") return { ...blank, url: p.url, supplier: p.title || host, type: "marketplace", opened: false };
  const e = p.extraction;
  if (p.status !== "read" || !e || e.productMatch === "no") return null;
  return {
    url: p.url, supplier: e.supplierName || p.title || host, type: e.supplierType, typeEvidence: e.typeEvidence, typeConfidence: e.typeConfidence,
    country: e.country, countryEvidence: e.countryEvidence, price: e.price, currency: e.currency, priceBasis: e.priceBasis, unitsInPrice: e.unitsInPrice, unitPrice: e.unitPrice,
    priceEvidence: e.priceEvidence, priceProduct: e.priceProduct ?? null, moq: e.moq, moqUnit: e.moqUnit, vat: e.vat, opened: true,
  };
}

function rank(r: SupplierResult, kind: SearchKind): number {
  if (!r.opened) return 5;
  if (r.type === "retailer") return 4;
  const wanted = kind === "manufacturer" ? r.type === "manufacturer" : r.type === "wholesaler" || r.type === "distributor";
  if (wanted) return r.price != null ? 0 : 1;
  return r.price != null ? 2 : 3;
}

export function toResults(run: ProductRun, kind: SearchKind): { rows: SupplierResult[]; stats: SearchStats } {
  const pages = Object.values(run.results).flat().filter((p): p is PageResult => !!p);
  const seen = new Set<string>();
  const rows = pages.map(toRow).filter((r): r is SupplierResult => {
    if (!r || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  // Array.sort is stable, so search order stands within a rank.
  rows.sort((a, b) => rank(a, kind) - rank(b, kind));
  const count = (...s: PageResult["status"][]) => pages.filter((p) => s.includes(p.status)).length;
  return { rows, stats: { read: count("read"), failed: count("fetch_failed", "no_text", "no_answer", "model_error"), blocked: count("robots_blocked"), notOpened: count("snippet_only") } };
}

export interface SearchOutcome { status: "done" | "failed"; error: string | null; rows: SupplierResult[]; stats: SearchStats; warnings: string[] }

/** How a run ended. A thin list says why, so it isn't mistaken for there being few suppliers. */
export function outcomeOf(run: ProductRun, kind: SearchKind): SearchOutcome {
  const { rows, stats } = toResults(run, kind);
  const pages = Object.values(run.results).flat().filter((p): p is PageResult => !!p);
  const base = { rows, stats };
  if (!rows.length && run.searchErrors.length) return { ...base, status: "failed", error: run.searchErrors[0], warnings: [] };
  if (!stats.read && pages.some((p) => p.status === "model_error")) return { ...base, status: "failed", error: "The AI couldn't read the pages. Try again shortly.", warnings: [] };
  const warnings: string[] = [];
  if (run.stoppedForTime) warnings.push("Stopped at the time limit for one search, so some pages may not have been read.");
  if (run.stoppedForBudget) warnings.push("Stopped at the spending limit for one search, so some pages weren't read.");
  if (run.searchErrors.length) warnings.push(`${run.searchErrors.length} of the web searches failed, so this list may be short.`);
  return { ...base, status: "done", error: null, warnings };
}
