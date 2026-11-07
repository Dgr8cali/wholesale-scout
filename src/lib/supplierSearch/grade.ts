/** The blind grading sheet, and the stop/go score from Akin's grades. */
import type { SearchProvider } from "./search";
import type { PageResult, ProductRun } from "./spikeRun";
import type { TestItem } from "./testSet";

const COLUMNS = ["row_id", "product", "supplier", "url", "model_type", "type_evidence", "model_country", "country_evidence", "tld_hint", "price_as_written", "price", "currency", "price_basis", "unit_price", "moq", "product_ok", "type_ok", "country_ok", "price_ok"] as const;
export type GradeRow = Record<(typeof COLUMNS)[number], string>;
export type ProviderMap = Record<string, SearchProvider[]>;

const TOP = 10;
const NOT_OPENED = "not opened";
const PROVIDERS: SearchProvider[] = ["serper", "brave"];

const usable = (rs: PageResult[] | undefined) => (rs ?? []).filter((r) => r.status === "read" || r.status === "snippet_only").slice(0, TOP);
const rowIdOf = (product: string, url: string) => `${product}:${url}`;
const GRADE_COLUMNS = ["product_ok", "type_ok", "country_ok", "price_ok"] as const;

function toRow(product: string, p: PageResult): GradeRow {
  const e = p.extraction;
  return {
    row_id: rowIdOf(product, p.url), product, supplier: e?.supplierName ?? p.title, url: p.url,
    model_type: e ? e.supplierType : "marketplace", type_evidence: e?.typeEvidence ?? "",
    model_country: e?.country ?? "Unknown", country_evidence: e?.countryEvidence ?? "", tld_hint: e?.tldHint ?? "",
    price_as_written: e?.priceEvidence ?? "", price: e?.price != null ? String(e.price) : "", currency: e?.currency ?? "", price_basis: e ? e.priceBasis : NOT_OPENED, unit_price: e?.unitPrice != null ? String(e.unitPrice) : "",
    moq: e?.moq != null ? `${e.moq}${e.moqUnit ? ` ${e.moqUnit}` : ""}` : "",
    product_ok: "", type_ok: "", country_ok: "", price_ok: "",
  };
}

/** One row per page in each product's top 10 for either provider, so a provider is only ever graded on what it found. Manufacturer products come first. */
export function gradeRows(runs: ProductRun[]): GradeRow[] {
  const ordered = [...runs].sort((a, b) => Number(b.item.kind === "manufacturer") - Number(a.item.kind === "manufacturer"));
  const rows = new Map<string, GradeRow>();
  for (const run of ordered) for (const provider of PROVIDERS) for (const p of usable(run.results[provider])) {
    const id = rowIdOf(run.item.id, p.url);
    if (!rows.has(id)) rows.set(id, toRow(run.item.id, p));
  }
  return [...rows.values()];
}

/** Which providers found each row. Kept away from the sheet, so grading stays blind. */
export function providerMap(runs: ProductRun[]): ProviderMap {
  const map: ProviderMap = {};
  for (const run of runs) for (const provider of PROVIDERS) for (const p of usable(run.results[provider])) {
    const list = (map[rowIdOf(run.item.id, p.url)] ??= []);
    if (!list.includes(provider)) list.push(provider);
  }
  return map;
}

/* ===================== the CSV ===================== */

// Text from a stranger's page goes into a spreadsheet: a cell starting like a formula is made inert.
const FORMULA = /^[=+\-@\t\r]/;
const cell = (v: string) => {
  const safe = FORMULA.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const uncell = (v: string) => (v.startsWith("'") && FORMULA.test(v.slice(1)) ? v.slice(1) : v);

export function toCsv(rows: GradeRow[]): string {
  return `﻿${[COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))].join("\n")}\n`;
}

export function parseGrades(csv: string): GradeRow[] {
  const records: string[][] = [];
  let field = "", record: string[] = [], quoted = false;
  const text = csv.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { record.push(field); field = ""; }
    else if (c === "\n") { record.push(field.replace(/\r$/, "")); records.push(record); record = []; field = ""; }
    else field += c;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const [header, ...body] = records;
  if (!header) return [];
  return body.filter((r) => r.some(Boolean)).map((r) => {
    const row = Object.fromEntries(COLUMNS.map((c) => [c, uncell(r[header.indexOf(c)] ?? "")])) as GradeRow;
    for (const c of GRADE_COLUMNS) row[c] = readGrade(row[c], row.row_id);
    return row;
  });
}

/** A grade that can't be read stops the score: ignoring it would quietly change the percentages. */
function readGrade(raw: string, rowId: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "?") return v;
  if (v === "y" || v === "yes") return "y";
  if (v === "n" || v === "no") return "n";
  throw new Error(`Grade "${raw}" in row ${rowId}: use y, n, ? or leave it blank`);
}

export const hasGrades = (rows: GradeRow[]) => rows.some((r) => r.product_ok || r.type_ok || r.country_ok || r.price_ok);

/* ===================== the score ===================== */

export interface ProviderScore {
  provider: SearchProvider; results: number; graded: number;
  makersWithThree: number; makerProducts: number; makerLabelled: number; makerRight: number; makerPrecision: number | null;
  productPrecision: number | null; productRight: number; productTotal: number; productByKind: Record<string, { right: number; total: number }>;
  pricePrecision: number | null; priceRight: number; priceTotal: number;
  /** Of opened pages about the right product, how many showed a price. Reported only: no pass mark has been set. */
  priceFoundByKind: Record<string, { found: number; total: number }>;
  countryPrecision: number | null; countryRight: number; countryTotal: number; unknownShare: number | null; countryConfirmed: number; tldRight: number; notOpened: number;
  /** Share of each area's rows that have been graded. */
  makerCoverage: number; wholesaleCoverage: number; countryCoverage: number;
}
export interface SpikeReport { providers: ProviderScore[]; byCountry: Partial<Record<SearchProvider, Record<string, number>>> }

/** Right out of (right + wrong). "?" counts as neither. Nothing graded is null, never a pass. */
function precision(rows: GradeRow[], col: keyof GradeRow): { right: number; total: number; share: number | null } {
  const right = rows.filter((r) => r[col] === "y").length, wrong = rows.filter((r) => r[col] === "n").length;
  return { right, total: right + wrong, share: right + wrong ? right / (right + wrong) : null };
}

export function scoreGrades(rows: GradeRow[], items: TestItem[], map: ProviderMap): SpikeReport {
  const kind = new Map(items.map((i) => [i.id, i.kind]));
  const report: SpikeReport = { providers: [], byCountry: {} };
  for (const provider of PROVIDERS) {
    const mine = rows.filter((r) => map[r.row_id]?.includes(provider));
    if (!mine.length) continue;
    const makerRows = mine.filter((r) => r.model_type === "manufacturer");
    const hitsPerProduct = new Map<string, number>();
    for (const r of makerRows) {
      if (kind.get(r.product) === "manufacturer" && r.product_ok === "y" && r.type_ok === "y") hitsPerProduct.set(r.product, (hitsPerProduct.get(r.product) ?? 0) + 1);
    }
    const wholesale = mine.filter((r) => kind.get(r.product) !== "manufacturer");
    const maker = precision(makerRows, "type_ok");
    const covered = (rs: GradeRow[], col: keyof GradeRow) => (rs.length ? rs.filter((r) => r[col]).length / rs.length : 0);
    const product = precision(wholesale, "product_ok");
    const price = precision(wholesale.filter((r) => r.price), "price_ok");
    const productByKind: ProviderScore["productByKind"] = {};
    for (const k of new Set(mine.map((r) => kind.get(r.product) ?? "unknown"))) {
      const { right, total } = precision(mine.filter((r) => (kind.get(r.product) ?? "unknown") === k), "product_ok");
      productByKind[k] = { right, total };
    }
    const opened = mine.filter((r) => r.price_basis !== NOT_OPENED);
    const priceFoundByKind: ProviderScore["priceFoundByKind"] = {};
    for (const r of opened) {
      if (r.product_ok === "n") continue;
      const tally = (priceFoundByKind[kind.get(r.product) ?? "unknown"] ??= { found: 0, total: 0 });
      tally.total++;
      if (r.price) tally.found++;
    }
    const shown = mine.filter((r) => r.model_country !== "Unknown");
    const country = precision(shown, "country_ok");
    const confirmed = shown.filter((r) => r.country_ok === "y");
    report.providers.push({
      provider, results: mine.length, graded: mine.filter((r) => hasGrades([r])).length,
      makersWithThree: [...hitsPerProduct.values()].filter((n) => n >= 3).length,
      makerProducts: items.filter((i) => i.kind === "manufacturer").length,
      makerLabelled: maker.total, makerRight: maker.right, makerPrecision: maker.share,
      productPrecision: product.share, productRight: product.right, productTotal: product.total, productByKind,
      pricePrecision: price.share, priceRight: price.right, priceTotal: price.total, priceFoundByKind,
      countryPrecision: country.share, countryRight: country.right, countryTotal: country.total,
      makerCoverage: covered(mine.filter((r) => kind.get(r.product) === "manufacturer"), "type_ok"),
      wholesaleCoverage: covered(wholesale, "product_ok"), countryCoverage: covered(shown, "country_ok"),
      unknownShare: opened.length ? opened.filter((r) => r.model_country === "Unknown").length / opened.length : null,
      countryConfirmed: confirmed.length, tldRight: confirmed.filter((r) => r.tld_hint === r.model_country).length,
      notOpened: mine.length - opened.length,
    });
    const counts: Record<string, number> = {};
    for (const r of mine) counts[r.model_country] = (counts[r.model_country] ?? 0) + 1;
    report.byCountry[provider] = counts;
  }
  return report;
}

const pct = (n: number | null) => (n == null ? "nothing graded" : `${Math.round(n * 100)}%`);

export type Verdict = "go" | "stop" | "not enough graded";
const MIN_COVERAGE = 0.8, MIN_ANSWERS = 30, MIN_PRICED = 10;

export function gate(report: SpikeReport): { provider: SearchProvider; manufacturers: Verdict; wholesale: Verdict; country: Verdict; reasons: string[] }[] {
  return report.providers.map((s) => {
    const reasons: string[] = [];
    const check = (ok: boolean, reason: string) => { if (!ok) reasons.push(reason); return ok; };
    const atLeast = (v: number | null, min: number) => v != null && v >= min;
    const verdict = (enough: boolean, area: string, pass: boolean): Verdict => {
      if (enough) return pass ? "go" : "stop";
      reasons.push(`${area}: not enough graded yet`);
      return "not enough graded";
    };
    const manufacturers = [
      check(s.makersWithThree >= 6, `${s.makersWithThree} of ${s.makerProducts} manufacturer products have 3 confirmed factories (needs 6)`),
      check(atLeast(s.makerPrecision, 0.7), `manufacturer labels ${pct(s.makerPrecision)} right (needs 70%)`),
    ].every(Boolean);
    const wholesale = [
      check(atLeast(s.productPrecision, 0.8), `right product ${pct(s.productPrecision)} (needs 80%)`),
      check(atLeast(s.pricePrecision, 0.9), `prices read right ${pct(s.pricePrecision)} (needs 90%)`),
    ].every(Boolean);
    const country = [
      check(atLeast(s.countryPrecision, 0.9), `countries right ${pct(s.countryPrecision)} (needs 90%)`),
      check(s.unknownShare != null && s.unknownShare <= 0.4, `Unknown country ${pct(s.unknownShare)} (needs 40% or less)`),
    ].every(Boolean);
    return {
      provider: s.provider,
      manufacturers: verdict(s.makerCoverage >= MIN_COVERAGE, "manufacturers", manufacturers),
      wholesale: verdict(s.wholesaleCoverage >= MIN_COVERAGE && s.productTotal >= MIN_ANSWERS && s.priceTotal >= MIN_PRICED, "wholesale", wholesale),
      country: verdict(s.countryCoverage >= MIN_COVERAGE && s.countryTotal >= MIN_ANSWERS, "country", country),
      reasons,
    };
  });
}

/** What the score must say alongside its verdict: anything that makes a provider's results incomplete. */
export function runWarnings(runs: ProductRun[]) {
  const partial: Partial<Record<SearchProvider, string[]>> = {};
  const searchErrors: string[] = [], stoppedForBudget: string[] = [];
  let temporaryFailures = 0;
  for (const run of runs) {
    for (const p of run.partial) (partial[p] ??= []).push(run.item.id);
    searchErrors.push(...run.searchErrors.map((e) => `${run.item.id}: ${e}`));
    if (run.stoppedForBudget) stoppedForBudget.push(run.item.id);
    for (const rs of Object.values(run.results)) for (const r of rs ?? []) if (r.temporary || r.status === "model_error") temporaryFailures++;
  }
  return { partial, searchErrors, stoppedForBudget, temporaryFailures };
}

/** Where a grade confirmed the first model's answer, how often did the other model say the same? */
export function compareModels(graded: GradeRow[], other: GradeRow[]) {
  const byId = new Map(other.map((r) => [r.row_id, r]));
  const out = { type: { same: 0, total: 0 }, country: { same: 0, total: 0 }, price: { same: 0, total: 0 } };
  const tally = (t: { same: number; total: number }, same: boolean) => { t.total++; if (same) t.same++; };
  for (const r of graded) {
    const o = byId.get(r.row_id);
    if (!o) continue;
    if (r.type_ok === "y") tally(out.type, o.model_type === r.model_type);
    if (r.country_ok === "y") tally(out.country, o.model_country === r.model_country);
    if (r.price_ok === "y") tally(out.price, o.price_basis === r.price_basis && o.unit_price === r.unit_price);
  }
  return out;
}
