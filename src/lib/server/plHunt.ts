import "server-only";
import { referralCategoryFor } from "../fees/engine";
import { addDailyTokens, type TokensByDay } from "../keepaLedger";
import { getKeepa, hasFinder, type KeepaProduct, type OnKeepaResponse } from "../keepa/client";
import { defaultFilters, finderSelection, groupNiches, type HuntAsin, type Niche, type NicheHuntFilters } from "../pl/hunt";
import { activeRateCard, chunks, db, must } from "./db";
import { huntCategories, type HuntCategory } from "./hunt";
import { createCandidate, refreshCandidate, snapshotOf } from "./pl";
import { saveSnapshot } from "./process";

/**
 * Niche Hunt: the wholesale Hunt's Product Finder client and category list, the same Keepa
 * snapshot store, the same token ledger. A hunt's ASIN detail is kept in pl_hunt_asins and reused
 * for 7 days, by later hunts and by "Create candidate".
 */

const DAY = 86_400_000;
const REUSE_MS = 7 * DAY;

export interface HuntRow {
  id: string; name: string; filters: NicheHuntFilters; asins: string[]; finder_total: number | null; fetched: number; reused: number;
  finder_tokens: number; detail_tokens: number; token_cost: number; created_at: string;
}
export interface Preset { id: string; name: string; filters: NicheHuntFilters }
export interface Dismissal { key: string; name: string | null; reason: string | null; created_at: string }

const HUNT_COLS = "id, name, filters, asins, finder_total, fetched, reused, finder_tokens, detail_tokens, token_cost, created_at";
const ASIN_COLS = "asin, title, brand, image, root_category, leaf_category_id, leaf_category, price, rating, review_count, rank, avg_rank_90d, rank_drops_90d, bought_past_month, offer_count, buybox_price, amazon_ever_seller, amazon_last_seen_days, amazon_brand, dimensions, weight, first_seen, history, snapshot_at";

const num = (v: unknown) => (v == null ? null : Number(v));
const toHuntAsin = (r: Record<string, unknown>): HuntAsin => ({
  ...(r as unknown as HuntAsin), position: 0, is_reference: false,
  price: num(r.price), rating: num(r.rating), buybox_price: num(r.buybox_price),
});

/** What the tab opens with: categories, defaults, presets, dismissals, the last hunt, Keepa's balance. */
export async function nicheHuntStart() {
  const d = db();
  const keepa = getKeepa();
  const [cats, presets, dismissals, last, status] = await Promise.all([
    huntCategories(false),
    d.from("pl_hunt_presets").select("id, name, filters").order("name"),
    d.from("pl_niche_dismissals").select("key, name, reason, created_at").order("created_at", { ascending: false }),
    d.from("pl_hunts").select("id").order("created_at", { ascending: false }).limit(1),
    keepa.available ? keepa.tokenStatus().catch(() => null) : null,
  ]);
  return {
    categories: cats.categories,
    defaults: defaultFilters(cats.categories),
    presets: must(presets, "presets") as Preset[],
    dismissals: must(dismissals, "dismissals") as Dismissal[],
    lastHuntId: ((must(last, "hunts") as { id: string }[])[0]?.id) ?? null,
    tokensLeft: status?.tokensLeft ?? null,
    keepa: hasFinder(keepa),
  };
}

/** Root category names by id, from the stored list (Product Finder's ids). */
async function categoryNames(): Promise<Map<number, string>> {
  const { categories } = await huntCategories(false);
  return new Map(categories.map((c: HuntCategory) => [c.id, c.name]));
}

/** A hunted ASIN's snapshot: the candidate snapshot plus its root category and when Amazon last sold it. */
function huntSnapshot(k: KeepaProduct, names: Map<number, string>) {
  const root = (k.rankCategoryId && names.get(k.rankCategoryId)) || (k.rootCategoryId && names.get(k.rootCategoryId)) || k.category || null;
  return {
    asin: k.asin, ...snapshotOf(k), root_category: root, amazon_last_seen_days: k.summary.amazonLastSeenDays,
    leaf_category_id: k.leafCategory?.id ?? null, leaf_category: k.leafCategory?.name ?? null,
  };
}

/** Snapshots of these ASINs under 7 days old. */
async function freshHuntAsins(asins: string[]): Promise<Map<string, HuntAsin>> {
  const out = new Map<string, HuntAsin>();
  const since = new Date(Date.now() - REUSE_MS).toISOString();
  for (const c of chunks(asins)) {
    // A snapshot from before the leaf category was kept can't be grouped: fetched again.
    const rows = must(await db().from("pl_hunt_asins").select(ASIN_COLS).in("asin", c).gte("snapshot_at", since).not("leaf_category", "is", null), "hunt snapshots") as Record<string, unknown>[];
    for (const r of rows) out.set(r.asin as string, toHuntAsin(r));
  }
  return out;
}

export interface HuntResult { hunt: HuntRow; niches: Niche[]; qualifying: number; incumbents: number; exhausted: boolean }

/**
 * Run a hunt: the Product Finder (one page, the cap as its size), then the detail of every ASIN
 * without a snapshot under 7 days old (history and rating, no Buy Box: 1–2 tokens each). The spend
 * goes on the hunt's ledger ("Niche Hunt"), which the dashboard counts.
 */
export async function runNicheHunt(filters: NicheHuntFilters, name?: string | null): Promise<HuntResult> {
  const keepa = getKeepa();
  if (!hasFinder(keepa)) throw new Error("Keepa isn't set up (KEEPA_API_KEY)");
  const d = db();
  const names = await categoryNames();
  const catLabel = filters.categories.map((id) => names.get(id) ?? String(id)).join(", ");
  const huntName = name?.trim() || `Niche Hunt · ${catLabel} · £${filters.priceMin}–${filters.priceMax} · ${filters.cap} ASINs`;

  const found = await keepa.productFinder(finderSelection(filters));
  const asins = [...new Set(found.asins.map((a) => a.toUpperCase()))].slice(0, filters.cap);
  const row = must(await d.from("pl_hunts").insert({
    name: huntName.slice(0, 200), filters, asins, finder_total: found.total,
    finder_tokens: found.tokensUsed, token_cost: found.tokensUsed, keepa_by_day: addDailyTokens({}, found.tokensUsed),
  }).select(HUNT_COLS).single(), "save hunt") as HuntRow;

  const cached = await freshHuntAsins(asins);
  const need = asins.filter((a) => !cached.has(a));
  let spent = 0, exhausted = false;
  const onResponse: OnKeepaResponse = (m) => { spent += m.tokensConsumed; };
  const fetched: KeepaProduct[] = [];
  try {
    if (need.length) {
      const res = await keepa.lookupByAsins(need, onResponse, { buyBox: false, rating: true });
      fetched.push(...res.byAsin.values());
      exhausted = !!res.exhausted;
    }
  } finally {
    const cur = must(await d.from("pl_hunts").select("token_cost, keepa_by_day").eq("id", row.id).single(), "ledger") as { token_cost: number; keepa_by_day: TokensByDay };
    must(await d.from("pl_hunts").update({
      detail_tokens: spent, token_cost: (cur.token_cost ?? 0) + spent, keepa_by_day: addDailyTokens(cur.keepa_by_day, spent),
      fetched: fetched.length, reused: cached.size,
    }).eq("id", row.id), "ledger");
  }
  const snaps = fetched.map((k) => huntSnapshot(k, names));
  for (const c of chunks(snaps, 100)) must(await d.from("pl_hunt_asins").upsert(c, { onConflict: "asin" }), "save hunt snapshots");
  // The wholesale history reuses them too.
  for (const k of fetched) await saveSnapshot(k).catch((e) => console.error(`[pl hunt] keepa snapshot for ${k.asin} not stored: ${(e as Error).message}`));
  return loadHunt(row.id, exhausted);
}

/** A hunt's niches, grouped now (so a dismissal or a corrected filter shows at once). */
export async function loadHunt(id: string, exhausted = false, override?: Partial<NicheHuntFilters>): Promise<HuntResult> {
  const d = db();
  const hunt = must(await d.from("pl_hunts").select(HUNT_COLS).eq("id", id).single(), "hunt") as HuntRow;
  const snaps: HuntAsin[] = [];
  for (const c of chunks(hunt.asins)) {
    snaps.push(...(must(await d.from("pl_hunt_asins").select(ASIN_COLS).in("asin", c), "hunt snapshots") as Record<string, unknown>[]).map(toHuntAsin));
  }
  const dismissed = new Set((must(await d.from("pl_niche_dismissals").select("key"), "dismissals") as { key: string }[]).map((r) => r.key));
  const filters = { ...hunt.filters, ...(override ?? {}) };
  const niches = groupNiches(snaps, filters, dismissed);
  const all = groupNiches(snaps, { ...filters, minAsins: 1 }, dismissed);
  return {
    hunt: { ...hunt, filters },
    niches,
    qualifying: all.reduce((a, n) => a + n.count, 0),
    incumbents: all.reduce((a, n) => a + n.asins.filter((x) => x.incumbent).length, 0),
    exhausted,
  };
}

export async function listHunts(): Promise<Omit<HuntRow, "asins" | "filters">[]> {
  return must(await db().from("pl_hunts").select("id, name, finder_total, fetched, reused, finder_tokens, detail_tokens, token_cost, created_at").order("created_at", { ascending: false }).limit(20), "hunts") as Omit<HuntRow, "asins" | "filters">[];
}

/* ===================== presets and dismissals ===================== */

export async function savePreset(name: string, filters: NicheHuntFilters): Promise<Preset> {
  if (!name.trim()) throw new Error("Name the preset");
  return must(await db().from("pl_hunt_presets").upsert({ name: name.trim().slice(0, 80), filters, updated_at: new Date().toISOString() }, { onConflict: "name" }).select("id, name, filters").single(), "save preset") as Preset;
}

export async function deletePreset(id: string) {
  must(await db().from("pl_hunt_presets").delete().eq("id", id), "delete preset");
}

export async function dismissNiche(key: string, name: string | null, reason: string | null) {
  if (!key.trim()) throw new Error("key required");
  must(await db().from("pl_niche_dismissals").upsert({ key: key.trim(), name, reason: reason?.trim() || null }, { onConflict: "key" }), "dismiss niche");
}

export async function undismissNiche(key: string) {
  must(await db().from("pl_niche_dismissals").delete().eq("key", key), "undismiss niche");
}

/* ===================== niche → candidate ===================== */

/** The referral category for a niche's root category ("Home & Kitchen" → Home Products). */
function referralFor(root: string | null, card: Awaited<ReturnType<typeof activeRateCard>>): string {
  const cat = referralCategoryFor(root, card);
  if (cat !== card.referral.defaultCategory || !root) return cat;
  return /home|kitchen/i.test(root) ? "Home Products" : /garden/i.test(root) ? "Lawn and Garden" : cat;
}

/**
 * A candidate from a niche: its name as product and niche keyword, the referral category from its
 * root category, up to 10 of its ASINs (highest sales first; the first is the reference) with their
 * hunt snapshots copied across, then the usual Keepa fill. Only the reference's Buy Box history is
 * new (about 3 tokens); the rest reuse the hunt's snapshots.
 */
export async function candidateFromNiche(huntId: string, key: string) {
  const { niches } = await loadHunt(huntId, false, { minAsins: 1 });
  const niche = niches.find((n) => n.key === key);
  if (!niche) throw new Error("That niche isn't in this hunt (dismissed, or the hunt changed)");
  const card = await activeRateCard();
  const picked = [...niche.asins].sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)).slice(0, 10);
  const candidate = await createCandidate({ name: niche.name, niche_keyword: niche.name, category: referralFor(niche.rootCategory, card), asins: picked.map((a) => a.asin) });
  const d = db();
  for (const a of picked) {
    const s = a.snap;
    must(await d.from("pl_candidate_asins").update({
      title: s.title, brand: s.brand, image: s.image, price: s.price, rating: s.rating, review_count: s.review_count, rank: s.rank,
      avg_rank_90d: s.avg_rank_90d, rank_drops_90d: s.rank_drops_90d, bought_past_month: s.bought_past_month, offer_count: s.offer_count,
      buybox_price: s.buybox_price, amazon_ever_seller: s.amazon_ever_seller, amazon_brand: s.amazon_brand, dimensions: s.dimensions,
      weight: s.weight, first_seen: s.first_seen, history: s.history, snapshot_at: s.snapshot_at,
    }).eq("candidate_id", candidate.id).eq("asin", a.asin), "copy snapshot");
  }
  const refresh = await refreshCandidate(candidate.id);
  return { candidate, refresh, niche: { key: niche.key, name: niche.name, count: niche.count } };
}

/** Tokens spent on hunts per UK day (the dashboard's Keepa tile). */
export async function huntTokensByDay(): Promise<TokensByDay[]> {
  const res = await db().from("pl_hunts").select("keepa_by_day");
  if (res.error) return [];
  return (res.data as { keepa_by_day: TokensByDay | null }[]).map((r) => r.keepa_by_day ?? {});
}
