import "server-only";
import { chunks, db, loadProfile, must } from "./db";
import { createRunFrom } from "./runs";
import type { WatchCondition } from "../watch";

const DAY = 86_400_000;
/** A favourite whose latest result is older than this is marked outdated. */
export const OUTDATED_MS = 7 * DAY;

export interface Favourite {
  id: string;
  ean: string;
  asin: string | null;
  note: string | null;
  created_at: string;
  /** Watchlist: the flip condition (null: re-check weekly), and no supplier known yet. */
  condition?: WatchCondition | null;
  no_supplier?: boolean;
}

type Row = Record<string, unknown>;

const FAV_COLS = "id, ean, asin, note, created_at, condition, no_supplier";

export const FAVOURITES_MIGRATION = "Run migration 20260926000700_favourites.sql to use favourites";
export const schemaMissing = (m: string) => /does not exist|schema cache/i.test(m);

export async function listFavourites(): Promise<Favourite[]> {
  const res = await db().from("favourites").select(FAV_COLS).order("created_at", { ascending: false });
  if (res.error && schemaMissing(res.error.message)) throw new Error(FAVOURITES_MIGRATION);
  return must(res, "favourites") as Favourite[];
}

async function findFavourite(ean: string, asin: string | null): Promise<Favourite | null> {
  const q = db().from("favourites").select(FAV_COLS).eq("ean", ean);
  const res = asin ? await q.eq("asin", asin) : await q.is("asin", null);
  if (res.error && schemaMissing(res.error.message)) throw new Error(FAVOURITES_MIGRATION);
  return ((must(res, "favourite") as Favourite[])[0]) ?? null;
}

/** Star or un-star several products at once. */
export async function bulkFavourites(items: { ean: string; asin: string | null }[], action: "star" | "unstar"): Promise<Favourite[]> {
  const out: Favourite[] = [];
  for (const i of items) {
    if (action === "star") out.push(await addFavourite(i.ean, i.asin));
    else {
      const f = await findFavourite(i.ean, i.asin);
      if (f) await removeFavourite(f.id);
    }
  }
  return out;
}

/**
 * Star a product (idempotent); a note, when given, replaces the current one. One upsert on
 * (ean, asin), so a star and a note saved at the same moment can't both insert: starring
 * leaves an existing row (and its note) alone, a note updates it.
 */
export async function addFavourite(ean: string, asin: string | null, note?: string | null): Promise<Favourite> {
  const d = db();
  const cols = FAV_COLS;
  if (note === undefined) {
    const res = await d.from("favourites").upsert({ ean, asin }, { onConflict: "ean,asin", ignoreDuplicates: true });
    if (res.error && schemaMissing(res.error.message)) throw new Error(FAVOURITES_MIGRATION);
    must(res, "favourite");
    const f = await findFavourite(ean, asin);
    if (!f) throw new Error("favourite: not saved");
    return f;
  }
  const res = await d.from("favourites")
    .upsert({ ean, asin, note: note?.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "ean,asin" })
    .select(cols).single();
  if (res.error && schemaMissing(res.error.message)) throw new Error(FAVOURITES_MIGRATION);
  return must(res, "favourite") as Favourite;
}

export async function setFavouriteNote(id: string, note: string | null): Promise<void> {
  must(await db().from("favourites").update({ note: note?.trim() || null, updated_at: new Date().toISOString() }).eq("id", id), "note");
}

export async function removeFavourite(id: string): Promise<void> {
  must(await db().from("favourites").delete().eq("id", id), "unstar");
}

/** The products a favourite points at: same EAN, and the same ASIN (or none). */
async function productsFor(favs: Favourite[]): Promise<Map<string, Row[]>> {
  const out = new Map<string, Row[]>();
  for (const c of chunks([...new Set(favs.map((f) => f.ean))])) {
    const rows = must(await db().from("products").select("*").in("ean", c), "products") as Row[];
    for (const f of favs) {
      const mine = rows.filter((p) => p.ean === f.ean && (p.asin ?? null) === (f.asin ?? null));
      if (mine.length) out.set(f.id, [...(out.get(f.id) ?? []), ...mine]);
    }
  }
  return out;
}

export interface FavouriteView {
  favourite: Favourite;
  /** The latest screened result for this product from any run, shaped like a run page row. */
  latest: Row | null;
  outdated: boolean;
}

/** Each favourite with its latest result from any run. */
export async function favouritesWithLatest(): Promise<FavouriteView[]> {
  const d = db();
  const favs = await listFavourites();
  const products = await productsFor(favs);
  const productIds = [...new Set([...products.values()].flat().map((p) => p.id as string))];

  const results: Row[] = [];
  for (const c of chunks(productIds)) {
    results.push(...(must(await d.from("results").select("*").in("product_id", c).eq("status", "done").order("updated_at", { ascending: false }), "results") as Row[]));
  }
  const latestByProduct = new Map<string, Row>();
  for (const r of results) if (!latestByProduct.has(r.product_id as string)) latestByProduct.set(r.product_id as string, r);

  const byId = async (table: string, ids: string[], cols = "*") => {
    const m = new Map<string, Row>();
    for (const c of chunks([...new Set(ids.filter(Boolean))])) {
      for (const x of must(await d.from(table).select(cols).in("id", c), table) as unknown as Row[]) m.set(x.id as string, x);
    }
    return m;
  };
  const latest = [...latestByProduct.values()];
  const [offers, runs] = await Promise.all([
    byId("offers", latest.map((r) => r.offer_id as string)),
    byId("runs", latest.map((r) => r.run_id as string), "id, name, source"),
  ]);
  const suppliers = await byId("suppliers", [...offers.values()].map((o) => o.supplier_id as string), "id, name");
  const productById = new Map([...products.values()].flat().map((p) => [p.id as string, p]));

  return favs.map((favourite) => {
    const candidates = (products.get(favourite.id) ?? []).map((p) => latestByProduct.get(p.id as string)).filter((x): x is Row => !!x);
    const r = candidates.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null;
    if (!r) return { favourite, latest: null, outdated: true };
    const offer = offers.get(r.offer_id as string);
    const run = runs.get(r.run_id as string);
    const view: Row = {
      ...r,
      product: productById.get(r.product_id as string) ?? null,
      offer: offer ? { ...offer, supplier: suppliers.get(offer.supplier_id as string) ?? null } : null,
      run: run ? { id: run.id, name: run.name ?? run.source, source: run.source } : null,
    };
    return { favourite, latest: view, outdated: Date.now() - Date.parse(String(r.updated_at)) > OUTDATED_MS };
  });
}

export const favouritesRunName = (d = new Date()) =>
  `Favourites ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}`;

/**
 * A new run with just the favourites, each on its latest offer, named "Favourites <date>".
 * Returns the run id; the caller starts processing.
 */
export async function rescreenFavourites(profileId?: string | null, opts: { name?: string; source?: (n: number) => string; ids?: string[] } = {}): Promise<{ runId: string; count: number; skipped: number }> {
  const d = db();
  const views = (await favouritesWithLatest()).filter((v) => !opts.ids || opts.ids.includes(v.favourite.id));
  const profile = await loadProfile(profileId);
  const picks: { productId: string; offerId: string }[] = [];
  let skipped = 0;
  const products = await productsFor(views.map((v) => v.favourite));
  for (const v of views) {
    const latest = v.latest;
    let productId = latest?.product_id as string | undefined;
    let offerId = latest?.offer_id as string | undefined;
    if (!productId || !offerId) {
      // Never screened to completion: use the product's most recent offer.
      const p = (products.get(v.favourite.id) ?? [])[0];
      const offer = p ? ((must(await d.from("offers").select("id").eq("product_id", p.id as string).order("seen_at", { ascending: false }).limit(1), "offer") as Row[])[0]) : undefined;
      productId = p?.id as string | undefined;
      offerId = offer?.id as string | undefined;
    }
    if (productId && offerId && !picks.some((x) => x.productId === productId)) picks.push({ productId, offerId });
    else skipped++;
  }
  if (!picks.length) throw new Error("No favourites with an offer to screen");
  const runId = await createRunFrom(picks, { name: opts.name ?? favouritesRunName(), source: opts.source?.(picks.length) ?? `Favourites (${picks.length})`, profileId: profile.id });
  return { runId, count: picks.length, skipped };
}
