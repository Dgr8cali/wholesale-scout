import "server-only";
import { applyMapping, CURRENCIES, headerFingerprint, MAX_ROWS, type Cell, type ColumnMapping } from "../ingest/mapping";
import { getQogita, type QogitaCategory, type QogitaClient, type QogitaProduct } from "../qogita/client";
import { db, must } from "./db";
import { gbpRate } from "./fx";
import { ingest } from "./ingest";

/** A pull's filters, as saved on a preset. Prices in the account currency (EUR here). */
export interface QogitaFilters {
  /** A category at any level; a parent pulls every category under it. */
  category: { name: string; path: string[] } | null;
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  /** Max estimated delivery, weeks. Products with no estimate are kept. */
  maxDeliveryWeeks: number | null;
  /** Max supplier MOV: applied to each passing row's offers (the product search can't filter on it). */
  movLimit: number | null;
}

export const EMPTY_QOGITA_FILTERS: QogitaFilters = { category: null, brands: [], minPrice: null, maxPrice: null, maxDeliveryWeeks: null, movLimit: null };

export function normalizeQogitaFilters(f: Partial<QogitaFilters> | null | undefined): QogitaFilters {
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    category: f?.category?.name ? { name: String(f.category.name), path: (f.category.path ?? []).map(String) } : null,
    brands: [...new Set((f?.brands ?? []).map((b) => String(b).trim()).filter(Boolean))],
    minPrice: num(f?.minPrice), maxPrice: num(f?.maxPrice), maxDeliveryWeeks: num(f?.maxDeliveryWeeks), movLimit: num(f?.movLimit),
  };
}

export const QOGITA_MIGRATION = "Run migration 20260927000000_qogita.sql to save Qogita presets";
const schemaMissing = (m: string) => /does not exist|schema cache|could not find/i.test(m);

// Categories change rarely; one list per process for 12 hours.
let categoryCache: { at: number; list: QogitaCategory[] } | null = null;
export async function qogitaCategories(client: QogitaClient): Promise<QogitaCategory[]> {
  if (!categoryCache || Date.now() - categoryCache.at > 12 * 3_600_000) categoryCache = { at: Date.now(), list: await client.categories() };
  return categoryCache.list;
}

/** The leaf category names under a chosen node (the product search only matches leaves). */
export function leavesUnder(node: { name: string; path: string[] }, all: QogitaCategory[]): string[] {
  const path = node.path.length ? node.path : [node.name];
  const under = all.filter((c) => path.every((p, i) => c.path[i] === p));
  return under.length ? [...new Set(under.map((c) => c.name))] : [node.name];
}

export interface PulledProducts {
  products: QogitaProduct[];
  currency: string;
  fetched: number;
  outsidePrice: number;
  tooSlow: number;
  unknownDelivery: number;
  truncated: boolean;
}

/** Leaf names per request: repeated query parameters, kept to a sane URL length. */
const LEAVES_PER_REQUEST = 30;

/**
 * Page through the product search for the filters, dropping what's outside the price range or
 * slower than the delivery limit, until `maxRows` are kept or `deadline` passes.
 */
export async function pullProducts(client: QogitaClient, f: QogitaFilters, opts: { maxRows?: number; deadline?: number } = {}): Promise<PulledProducts> {
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const leaves = f.category ? leavesUnder(f.category, await qogitaCategories(client)) : [];
  const batches: string[][] = [];
  for (let i = 0; i < leaves.length; i += LEAVES_PER_REQUEST) batches.push(leaves.slice(i, i + LEAVES_PER_REQUEST));
  if (!batches.length) batches.push([]);

  const seen = new Set<string>();
  const out: PulledProducts = { products: [], currency: "EUR", fetched: 0, outsidePrice: 0, tooSlow: 0, unknownDelivery: 0, truncated: false };
  outer: for (const categoryNames of batches) {
    for await (const page of client.products({ categoryNames, brandNames: f.brands })) {
      for (const p of page.results) {
        if (p.availability !== "in_stock" || !p.gtin || !p.price || seen.has(p.gtin)) continue;
        seen.add(p.gtin);
        out.fetched++;
        out.currency = p.price.currency || out.currency;
        const price = Number(p.price.amount);
        if ((f.minPrice != null && price < f.minPrice) || (f.maxPrice != null && price > f.maxPrice)) { out.outsidePrice++; continue; }
        if (p.estimatedDeliveryTime == null) out.unknownDelivery++;
        else if (f.maxDeliveryWeeks != null && p.estimatedDeliveryTime > f.maxDeliveryWeeks) { out.tooSlow++; continue; }
        out.products.push(p);
        if (out.products.length >= maxRows) { out.truncated = true; break outer; }
      }
      if (opts.deadline && Date.now() > opts.deadline) { out.truncated = true; break outer; }
    }
  }
  return out;
}

const HEADERS = ["GTIN", "Name", "Brand", "Category", "Price", "Case size", "Inventory", "Delivery (weeks)", "Product link"];
const MAPPING: ColumnMapping = {
  headerRow: 0,
  // A case (`unit`) is the order multiple; the price is per piece.
  columns: { ean: "GTIN", title: "Name", brand: "Brand", category: "Category", unitPrice: "Price", moq: "Case size", stock: "Inventory" },
  pricePer: "unit",
};

/** Qogita products as the rows an uploaded sheet would give, through the same column mapper. */
export function productsToRows(products: QogitaProduct[], currency: string, fx: { rate: number; date: string }) {
  const sheet: Cell[][] = [HEADERS, ...products.map((p) => [
    p.gtin, p.name, p.brand, p.category, p.price?.amount ?? null, p.unit ?? 1, p.inventory ?? null, p.estimatedDeliveryTime ?? null, p.productUrl,
  ] as Cell[])];
  const { rows, rejected } = applyMapping(sheet, MAPPING, { vatBasis: "ex_vat", vatRate: 20, currency }, fx);
  const links = new Map(products.map((p) => [p.gtin, p.productUrl]));
  return { rows: rows.map((r) => ({ ...r, externalRef: links.get(r.ean) ?? null })), rejected };
}

export interface PullResult {
  runId: string | null;
  presetId: string | null;
  stats: { fetched: number; kept: number; screened: number; outsidePrice: number; tooSlow: number; unknownDelivery: number; truncated: boolean; currency: string; unchanged?: number; new?: number; moved?: number };
  note?: string;
}

interface PresetRow { id: string; name: string; filters: QogitaFilters; profile_id: string | null; last_prices: Record<string, number> | null }

/**
 * Pull a Qogita product set and open a run on it, exactly as an upload of the same rows would
 * (supplier "Qogita", currency from the response, ex-VAT). Saves the filters as a named preset.
 * `onlyChanged`: screen only EANs that are new or whose price moved since the preset's last pull.
 */
export async function runQogitaPull(opts: {
  name: string;
  filters: QogitaFilters;
  profileId?: string | null;
  kind?: "manual" | "nightly";
  onlyChanged?: boolean;
  deadlineMs?: number;
  client?: QogitaClient;
}): Promise<PullResult> {
  const client = opts.client ?? getQogita();
  if (!client) throw new Error("Qogita isn't configured: set QOGITA_EMAIL and QOGITA_PASSWORD");
  const name = opts.name.trim();
  if (!name) throw new Error("Name this pull; it's saved as a preset you can run again");
  const filters = normalizeQogitaFilters(opts.filters);
  if (!filters.category && !filters.brands.length) throw new Error("Choose a category or at least one brand");
  const d = db();
  const startedAt = new Date().toISOString();

  // The preset (saved first, so a failed pull still keeps the filters).
  let preset: PresetRow | null = null;
  let note: string | undefined;
  const saved = await d.from("qogita_presets")
    .upsert({ name, filters, profile_id: opts.profileId ?? null, updated_at: new Date().toISOString() }, { onConflict: "name" })
    .select("id, name, filters, profile_id, last_prices").single();
  if (saved.error && schemaMissing(saved.error.message)) note = QOGITA_MIGRATION;
  else preset = must(saved, "preset") as PresetRow;

  const pull = await pullProducts(client, filters, { deadline: Date.now() + (opts.deadlineMs ?? 40_000) });
  const prices = Object.fromEntries(pull.products.map((p) => [p.gtin, Number(p.price!.amount)]));
  const last = preset?.last_prices ?? {};
  const isNew = (g: string) => !(g in last);
  const moved = (g: string) => g in last && Math.abs(last[g] - prices[g]) > 0.005;
  const chosen = opts.onlyChanged ? pull.products.filter((p) => isNew(p.gtin) || moved(p.gtin)) : pull.products;
  const stats: PullResult["stats"] = {
    fetched: pull.fetched, kept: pull.products.length, screened: chosen.length, outsidePrice: pull.outsidePrice, tooSlow: pull.tooSlow,
    unknownDelivery: pull.unknownDelivery, truncated: pull.truncated, currency: pull.currency,
    ...(opts.onlyChanged ? { new: pull.products.filter((p) => isNew(p.gtin)).length, moved: pull.products.filter((p) => moved(p.gtin)).length, unchanged: pull.products.length - chosen.length } : {}),
  };

  let runId: string | null = null;
  if (chosen.length) {
    if (!(CURRENCIES as readonly string[]).includes(pull.currency)) throw new Error(`Qogita priced in ${pull.currency}, which the app doesn't convert`);
    const fx = await gbpRate(pull.currency);
    if (!fx) throw new Error(`Couldn't fetch a ${pull.currency} → GBP rate; try again shortly`);
    const { rows } = productsToRows(chosen, pull.currency, fx);
    const label = `Qogita · ${name}`;
    const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
    const res = await ingest({
      profileId: opts.profileId ?? preset?.profile_id ?? null,
      name: `${label} · ${day}${opts.kind === "nightly" ? " (nightly)" : ""}`,
      files: [{
        fileName: label,
        supplier: { name: "Qogita", vatBasis: "ex_vat", vatRate: 20, currency: pull.currency },
        sourceType: "qogita",
        headers: HEADERS,
        fingerprint: headerFingerprint(HEADERS),
        mapping: MAPPING,
        fx: { rate: fx.rate, date: fx.date },
        rows,
      }],
    });
    runId = res.runId;
  }

  if (preset) {
    // Remember prices for the next "only changed" pull (a truncated pull keeps what it didn't see).
    const merged = pull.truncated ? { ...last, ...prices } : prices;
    must(await d.from("qogita_presets").update({ last_prices: merged, last_pulled_at: new Date().toISOString() }).eq("id", preset.id), "preset prices");
    must(await d.from("qogita_pulls").insert({ preset_id: preset.id, run_id: runId, kind: opts.kind ?? "manual", stats, started_at: startedAt, finished_at: new Date().toISOString() }), "pull record");
  }
  return { runId, presetId: preset?.id ?? null, stats, note };
}
