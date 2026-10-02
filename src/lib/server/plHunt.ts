import "server-only";
import { referralCategoryFor } from "../fees/engine";
import { addDailyTokens, type TokensByDay } from "../keepaLedger";
import { getKeepa, hasFinder, type KeepaCategory, type KeepaClient, type KeepaFinder, type KeepaProduct, type OnKeepaResponse } from "../keepa/client";
import {
  defaultFilters, filtersKey, finderSelection, fittingDetailLeaves, groupNiches, huntEstimate, TOKEN_RESERVE, TREE_MAX_CATEGORIES,
  type HuntAsin, type HuntEstimate, type Niche, type NicheHuntFilters,
} from "../pl/hunt";
import { activeRateCard, chunks, db, must } from "./db";
import { huntCategories, type HuntCategory } from "./hunt";
import { createCandidate, refreshCandidate, snapshotOf } from "./pl";
import { saveSnapshot } from "./process";

/**
 * Niche Hunt: the wholesale Hunt's Product Finder client and category list, the same Keepa
 * snapshot store, the same token ledger. A hunt is a background job like a screening run (a
 * self-continuing chain under a lease, restarted by the watchdog): list the leaf categories under
 * the roots (cached a week), size each leaf with one finder call (cached 7 days per filters), then
 * fetch detail for the leaves with the most matches. Each leaf is a niche. ASIN detail is kept in
 * pl_hunt_asins and reused for 7 days, by later hunts and by "Create candidate".
 */

const DAY = 86_400_000;
const REUSE_MS = 7 * DAY;

/** A leaf in a hunt: sized in stage 1, detailed in stage 2 if it's among the most promising. */
export interface HuntLeaf {
  id: number; name: string; products: number | null;
  /** Stage 1: finder matches under the filters, its best-selling ASINs, what sizing cost (0 when cached). */
  matches?: number; asins?: string[]; finderTokens?: number; cached?: boolean;
  /** Stage 2: picked for detail, and done (with how many fetched and reused). */
  detail?: boolean; detailed?: boolean; fetched?: number; reused?: number;
}

export type HuntStatus = "listing" | "sizing" | "detailing" | "done" | "error" | "cancelled";

export interface HuntRow {
  id: string; name: string; filters: NicheHuntFilters; asins: string[]; finder_total: number | null; fetched: number; reused: number;
  finder_tokens: number; detail_tokens: number; token_cost: number; created_at: string;
  status: HuntStatus; leaves: HuntLeaf[] | null; note: string | null; finished_at: string | null;
}
export interface Preset { id: string; name: string; filters: NicheHuntFilters }
export interface Dismissal { key: string; name: string | null; reason: string | null; created_at: string }

const HUNT_COLS = "id, name, filters, asins, finder_total, fetched, reused, finder_tokens, detail_tokens, token_cost, created_at, status, leaves, note, finished_at";
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
    const rows = must(await db().from("pl_hunt_asins").select(ASIN_COLS).in("asin", c).gte("snapshot_at", since), "hunt snapshots") as Record<string, unknown>[];
    for (const r of rows) out.set(r.asin as string, toHuntAsin(r));
  }
  return out;
}

export interface HuntResult {
  hunt: HuntRow; niches: Niche[]; qualifying: number; incumbents: number; exhausted: boolean;
}

type Finder = KeepaClient & KeepaFinder;
const finderOrThrow = (): Finder => {
  const keepa = getKeepa();
  if (!hasFinder(keepa)) throw new Error("Keepa isn't set up (KEEPA_API_KEY)");
  return keepa as Finder;
};

/* ===================== stage 0: leaf categories ===================== */

/** A root's tree is listed again after this. */
const TREE_TTL_MS = 7 * DAY;

/** The stored tree under a root, if listed in the last week. */
async function storedTree(rootId: number): Promise<KeepaCategory[] | null> {
  const since = new Date(Date.now() - TREE_TTL_MS).toISOString();
  const rows = must(await db().from("pl_category_tree").select("id, name, parent, child_ids, product_count").eq("root_id", rootId).gte("fetched_at", since), "category tree") as
    { id: number; name: string; parent: number | null; child_ids: number[]; product_count: number | null }[];
  return rows.length ? rows.map((r) => ({ id: Number(r.id), name: r.name, parent: r.parent == null ? null : Number(r.parent), children: (r.child_ids ?? []).map(Number), products: r.product_count == null ? null : Number(r.product_count) })) : null;
}

/**
 * List a root's tree from Keepa, biggest branches first (by product count), up to 400 categories
 * (40 tokens), and store it. Leaves are the categories with no children; a branch not reached stays
 * unknown rather than counted as a leaf.
 */
async function listTree(keepa: Finder, rootId: number, spend: (t: number) => Promise<void>): Promise<KeepaCategory[]> {
  const seen = new Map<number, KeepaCategory>();
  const frontier: { id: number; products: number }[] = [{ id: rootId, products: Infinity }];
  while (frontier.length && seen.size < TREE_MAX_CATEGORIES) {
    frontier.sort((a, b) => b.products - a.products);
    const batch = frontier.splice(0, Math.min(10, TREE_MAX_CATEGORIES - seen.size)).map((x) => x.id);
    const r = await keepa.categories(batch);
    await spend(r.tokensUsed);
    for (const c of r.categories) seen.set(c.id, c);
    const known = new Set([...seen.keys(), ...frontier.map((x) => x.id)]);
    for (const c of r.categories) for (const ch of c.children) if (!known.has(ch)) frontier.push({ id: ch, products: c.products ?? 0 });
  }
  const rows = [...seen.values()].map((c) => ({ id: c.id, name: c.name, parent: c.parent, root_id: rootId, child_ids: c.children, product_count: c.products, fetched_at: new Date().toISOString() }));
  for (const c of chunks(rows, 200)) must(await db().from("pl_category_tree").upsert(c, { onConflict: "id" }), "save category tree");
  return [...seen.values()];
}

const leavesOf = (tree: KeepaCategory[]) => tree.filter((c) => !c.children.length);

/* ===================== estimate and start ===================== */

/** A leaf's count under these filters from the last 7 days. */
async function cachedCounts(leafIds: number[], key: string): Promise<Map<number, { matches: number; asins: string[] }>> {
  const out = new Map<number, { matches: number; asins: string[] }>();
  if (!leafIds.length) return out;
  const since = new Date(Date.now() - REUSE_MS).toISOString();
  for (const c of chunks(leafIds)) {
    const rows = must(await db().from("pl_leaf_counts").select("leaf_id, matches, asins").eq("filters_key", key).in("leaf_id", c).gte("counted_at", since), "leaf counts") as { leaf_id: number; matches: number; asins: string[] }[];
    for (const r of rows) out.set(Number(r.leaf_id), { matches: r.matches, asins: r.asins });
  }
  return out;
}

/** The leaves a hunt would size: the given ones, or the largest under the roots (when their trees are stored). */
async function plannedLeaves(f: NicheHuntFilters): Promise<{ leaves: HuntLeaf[] | null; rootsWithoutTree: number }> {
  if (f.leafIds?.length) {
    const rows = must(await db().from("pl_category_tree").select("id, name, product_count").in("id", f.leafIds), "leaves") as { id: number; name: string; product_count: number | null }[];
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    // Leaves not in the stored tree are named in stage 0 (1 token per 10).
    const unknown = f.leafIds.filter((id) => !byId.has(id)).length;
    return { leaves: unknown ? null : f.leafIds.map((id) => ({ id, name: byId.get(id)!.name, products: byId.get(id)!.product_count })), rootsWithoutTree: unknown ? Math.ceil(unknown / 10) / Math.ceil(TREE_MAX_CATEGORIES / 10) : 0 };
  }
  let without = 0;
  const all: HuntLeaf[] = [];
  for (const root of f.categories) {
    const tree = await storedTree(root);
    if (!tree) { without++; continue; }
    all.push(...leavesOf(tree).map((c) => ({ id: c.id, name: c.name, products: c.products })));
  }
  if (without) return { leaves: null, rootsWithoutTree: without };
  const unique = [...new Map(all.map((l) => [l.id, l])).values()];
  return { leaves: unique.sort((a, b) => (b.products ?? 0) - (a.products ?? 0)).slice(0, f.leavesCap), rootsWithoutTree: 0 };
}

export interface HuntPlan { estimate: HuntEstimate; balance: number | null; fits: boolean; fittingDetailLeaves: number | null; leavesKnown: boolean }

/**
 * The cost before running: listing trees not stored (an upper bound), sizing leaves not counted in
 * the last 7 days, and N × ASINs per leaf of detail less what's cached. Against the balance, keeping
 * 100 tokens in reserve; when it doesn't fit, how many leaves to detail would.
 */
export async function planHunt(f: NicheHuntFilters): Promise<HuntPlan> {
  const keepa = getKeepa();
  const { leaves, rootsWithoutTree } = await plannedLeaves(f);
  let leavesToSize = f.leafIds?.length ?? f.leavesCap;
  let cachedAsins = 0;
  if (leaves) {
    const counts = await cachedCounts(leaves.map((l) => l.id), filtersKey(f));
    leavesToSize = leaves.filter((l) => !counts.has(l.id)).length;
    // Detail already cached for the counted leaves' top ASINs (a lower bound on the saving).
    const top = [...counts.values()].sort((a, b) => b.matches - a.matches).slice(0, f.detailLeaves).flatMap((c) => c.asins.slice(0, f.perLeaf));
    cachedAsins = (await freshHuntAsins(top)).size;
  }
  const estimate = huntEstimate({ rootsWithoutTree, leavesToSize, detailLeaves: Math.min(f.detailLeaves, f.leafIds?.length ?? f.detailLeaves), perLeaf: f.perLeaf, cachedAsins });
  const status = keepa.available ? await keepa.tokenStatus().catch(() => null) : null;
  const balance = status?.tokensLeft ?? null;
  const fits = balance != null && estimate.total <= balance - TOKEN_RESERVE;
  return { estimate, balance, fits, fittingDetailLeaves: balance == null ? null : fittingDetailLeaves(estimate, f.perLeaf, balance), leavesKnown: !!leaves };
}

export class HuntRefused extends Error {
  constructor(message: string, readonly plan: HuntPlan) { super(message); }
}

/** Start a hunt: refused when its estimate eats into the 100-token reserve. The chain does the rest. */
export async function startNicheHunt(f: NicheHuntFilters, name?: string | null): Promise<{ id: string; plan: HuntPlan }> {
  finderOrThrow();
  const plan = await planHunt(f);
  if (plan.balance == null) throw new Error("Couldn't read Keepa's token balance");
  if (!plan.fits) {
    throw new HuntRefused(
      `This hunt could use ${plan.estimate.total} tokens; the balance is ${plan.balance} and ${TOKEN_RESERVE} stay in reserve. ` +
      (plan.fittingDetailLeaves ? `Detailing ${plan.fittingDetailLeaves} leaves instead of ${f.detailLeaves} fits.` : "Even sizing the leaves doesn't fit: size fewer leaves or wait for the refill."),
      plan,
    );
  }
  const names = await categoryNames();
  const label = f.leafIds?.length ? `${f.leafIds.length} leaf${f.leafIds.length === 1 ? "" : "s"}` : f.categories.map((id) => names.get(id) ?? String(id)).join(", ");
  const { leaves } = await plannedLeaves(f);
  const row = must(await db().from("pl_hunts").insert({
    name: (name?.trim() || `Niche Hunt · ${label} · ${f.leafIds?.length ?? f.leavesCap} leaves → ${f.detailLeaves} × ${f.perLeaf}`).slice(0, 200),
    filters: f, asins: [], status: leaves ? "sizing" : "listing", leaves, last_progress_at: new Date().toISOString(),
    progress: { leaves: leaves?.length ?? null, sized: 0, detail: null, detailed: 0, estimate: plan.estimate },
  }).select("id").single(), "start hunt") as { id: string };
  return { id: row.id, plan };
}

/* ===================== the job ===================== */

const LEASE_MS = 55_000;

/** Take the hunt for one worker (like a run's lease): false when another worker holds it. */
async function lease(id: string): Promise<boolean> {
  const now = new Date();
  const res = await db().from("pl_hunts").update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("id", id).or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`).select("id");
  return !!must(res, "lease").length;
}

/** Add Keepa's tokensConsumed to the hunt's ledger as they're spent ("Niche Hunt" in Home's spend). */
async function addTokens(id: string, tokens: number, kind: "finder" | "detail") {
  if (!tokens) return;
  const d = db();
  const cur = must(await d.from("pl_hunts").select("token_cost, keepa_by_day, finder_tokens, detail_tokens").eq("id", id).single(), "ledger") as
    { token_cost: number; keepa_by_day: TokensByDay; finder_tokens: number; detail_tokens: number };
  must(await d.from("pl_hunts").update({
    token_cost: (cur.token_cost ?? 0) + tokens, keepa_by_day: addDailyTokens(cur.keepa_by_day, tokens),
    ...(kind === "finder" ? { finder_tokens: (cur.finder_tokens ?? 0) + tokens } : { detail_tokens: (cur.detail_tokens ?? 0) + tokens }),
  }).eq("id", id), "ledger");
}

export interface HuntProgress {
  id: string; status: HuntStatus; done: boolean; busy: boolean; waiting: boolean;
  leaves: number | null; sized: number; detail: number | null; detailed: number; note: string | null; tokens: number;
}

const tokensOut = (e: unknown) => /\b429\b|tokens|NOT_ENOUGH_TOKEN/i.test((e as Error)?.message ?? "");

/**
 * One budget of work (~40 s) on a hunt: list the trees, size leaves, detail leaves, in that order,
 * saving after each step so a chain that dies loses nothing. Out of Keepa tokens: it stops with a
 * note, and the watchdog carries on after the refill.
 */
export async function processHunt(id: string, budgetMs = 40_000): Promise<HuntProgress> {
  const t0 = Date.now();
  const d = db();
  const read = async () => must(await d.from("pl_hunts").select(HUNT_COLS).eq("id", id).single(), "hunt") as HuntRow;
  let h = await read();
  const report = (busy: boolean, waiting = false): HuntProgress => ({
    id, status: h.status, done: ["done", "error", "cancelled"].includes(h.status), busy, waiting,
    leaves: h.leaves?.length ?? null, sized: h.leaves?.filter((l) => l.matches != null).length ?? 0,
    detail: h.leaves ? h.leaves.filter((l) => l.detail).length : null, detailed: h.leaves?.filter((l) => l.detailed).length ?? 0,
    note: h.note, tokens: h.token_cost,
  });
  if (["done", "error", "cancelled"].includes(h.status)) return report(false);
  if (!(await lease(id))) return report(true);
  const keepa = finderOrThrow();
  const f = validFiltersOrStored(h.filters);
  const save = async (patch: Record<string, unknown>) => {
    must(await d.from("pl_hunts").update({ ...patch, last_progress_at: new Date().toISOString() }).eq("id", id), "save hunt");
    h = await read();
  };
  const time = () => Date.now() - t0 < budgetMs;
  try {
    // Stage 0: the leaves.
    if (h.status === "listing") {
      let leaves: HuntLeaf[];
      if (f.leafIds?.length) {
        const r = await keepa.categories(f.leafIds);
        await addTokens(id, r.tokensUsed, "finder");
        leaves = f.leafIds.map((lid) => { const c = r.categories.find((x) => x.id === lid); return { id: lid, name: c?.name ?? String(lid), products: c?.products ?? null }; });
      } else {
        const all: HuntLeaf[] = [];
        for (const root of f.categories) {
          const tree = (await storedTree(root)) ?? (await listTree(keepa, root, (t) => addTokens(id, t, "finder")));
          all.push(...leavesOf(tree).map((c) => ({ id: c.id, name: c.name, products: c.products })));
        }
        leaves = [...new Map(all.map((l) => [l.id, l])).values()].sort((a, b) => (b.products ?? 0) - (a.products ?? 0)).slice(0, f.leavesCap);
      }
      await save({ status: "sizing", leaves, progress: { leaves: leaves.length, sized: 0 } });
    }
    // Stage 1: size each leaf with one finder call (no detail), reusing counts from the last 7 days.
    if (h.status === "sizing") {
      const key = filtersKey(f);
      const leaves = [...h.leaves!];
      const cached = await cachedCounts(leaves.filter((l) => l.matches == null).map((l) => l.id), key);
      for (const l of leaves) {
        if (l.matches != null) continue;
        const c = cached.get(l.id);
        if (c) Object.assign(l, { matches: c.matches, asins: c.asins, finderTokens: 0, cached: true });
        else {
          if (!time()) break;
          const r = await keepa.productFinder(finderSelection(f, l.id));
          await addTokens(id, r.tokensUsed, "finder");
          Object.assign(l, { matches: r.total, asins: r.asins.map((a) => a.toUpperCase()), finderTokens: r.tokensUsed, cached: false });
          must(await d.from("pl_leaf_counts").upsert({ leaf_id: l.id, filters_key: key, matches: r.total, asins: l.asins, finder_tokens: r.tokensUsed, counted_at: new Date().toISOString() }, { onConflict: "leaf_id,filters_key" }), "save leaf count");
        }
        await save({ leaves });
      }
      if (leaves.every((l) => l.matches != null)) {
        // The most promising leaves: most matches first, at least minLeafMatches.
        const picked = new Set(leaves.filter((l) => (l.matches ?? 0) >= f.minLeafMatches).sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0)).slice(0, f.detailLeaves).map((l) => l.id));
        for (const l of leaves) l.detail = picked.has(l.id);
        await save({ status: picked.size ? "detailing" : "done", leaves, ...(picked.size ? {} : { finished_at: new Date().toISOString(), note: `No leaf had ${f.minLeafMatches}+ matches` }) });
      }
    }
    // Stage 2: detail the picked leaves' best sellers, reusing snapshots under 7 days old.
    if (h.status === "detailing") {
      const names = await categoryNames();
      const leaves = [...h.leaves!];
      for (const l of leaves) {
        if (!l.detail || l.detailed) continue;
        if (!time()) break;
        const asins = (l.asins ?? []).slice(0, f.perLeaf);
        const cached = await freshHuntAsins(asins);
        const need = asins.filter((a) => !cached.has(a));
        let spent = 0, exhausted = false;
        const fetched: KeepaProduct[] = [];
        if (need.length) {
          const onResponse: OnKeepaResponse = (m) => { spent += m.tokensConsumed; };
          try {
            const res = await keepa.lookupByAsins(need, onResponse, { buyBox: false, rating: true });
            fetched.push(...res.byAsin.values());
            exhausted = !!res.exhausted;
          } finally {
            await addTokens(id, spent, "detail");
          }
          // What was fetched is kept even when Keepa ran out part-way; the leaf is finished next time.
          const snaps = fetched.map((k) => huntSnapshot(k, names));
          if (snaps.length) must(await d.from("pl_hunt_asins").upsert(snaps, { onConflict: "asin" }), "save hunt snapshots");
          for (const k of fetched) await saveSnapshot(k).catch((e) => console.error(`[pl hunt] keepa snapshot for ${k.asin} not stored: ${(e as Error).message}`));
          if (exhausted) throw new Error("Keepa: not enough tokens");
        }
        Object.assign(l, { detailed: true, fetched: fetched.length, reused: cached.size });
        const all = [...new Set([...h.asins, ...asins])];
        await save({ leaves, asins: all, fetched: (h.fetched ?? 0) + fetched.length, reused: (h.reused ?? 0) + cached.size });
      }
      if (leaves.every((l) => !l.detail || l.detailed)) await save({ status: "done", finished_at: new Date().toISOString(), note: null });
    }
  } catch (e) {
    if (tokensOut(e)) {
      await save({ note: "Waiting for Keepa tokens: it carries on after the refill" });
      await d.from("pl_hunts").update({ lease_until: null }).eq("id", id);
      return report(false, true);
    }
    await save({ status: "error", note: (e as Error).message.slice(0, 300), finished_at: new Date().toISOString() });
  }
  await d.from("pl_hunts").update({ lease_until: null }).eq("id", id);
  h = await read();
  return report(false);
}

/** Filters stored on a hunt, with defaults for anything added since. */
function validFiltersOrStored(f: NicheHuntFilters): NicheHuntFilters {
  return { ...defaultFilters([]), ...f, categories: f.categories ?? [] };
}

/** Hunts whose chain has died: work left, no lease, nothing moved for 3 minutes (the watchdog restarts them). */
export async function stalledHunts(now = Date.now()): Promise<string[]> {
  const res = await db().from("pl_hunts").select("id, lease_until, last_progress_at, created_at").in("status", ["listing", "sizing", "detailing"]);
  if (res.error) return []; // before the migration
  return (res.data as { id: string; lease_until: string | null; last_progress_at: string | null; created_at: string }[])
    .filter((h) => !(h.lease_until && Date.parse(h.lease_until) > now) && now - Date.parse(h.last_progress_at ?? h.created_at) > 3 * 60_000)
    .map((h) => h.id);
}

export async function cancelHunt(id: string) {
  must(await db().from("pl_hunts").update({ status: "cancelled", finished_at: new Date().toISOString(), lease_until: null }).eq("id", id).in("status", ["listing", "sizing", "detailing"]), "cancel hunt");
}

/**
 * A hunt's niches, grouped now (so a dismissal or the "At least" control shows at once). A leaf
 * hunt: each detailed leaf is a niche of its best sellers. An older single-page hunt: grouped by
 * each product's own leaf category.
 */
export async function loadHunt(id: string, exhausted = false, override?: Partial<NicheHuntFilters>): Promise<HuntResult> {
  const d = db();
  const hunt = must(await d.from("pl_hunts").select(HUNT_COLS).eq("id", id).single(), "hunt") as HuntRow;
  const filters = { ...validFiltersOrStored(hunt.filters), ...(override ?? {}) };
  const dismissed = new Set((must(await d.from("pl_niche_dismissals").select("key"), "dismissals") as { key: string }[]).map((r) => r.key));
  const bySnap = new Map<string, HuntAsin>();
  for (const c of chunks(hunt.asins)) {
    for (const r of must(await d.from("pl_hunt_asins").select(ASIN_COLS).in("asin", c), "hunt snapshots") as Record<string, unknown>[]) bySnap.set(r.asin as string, toHuntAsin(r));
  }
  let snaps: HuntAsin[];
  if (hunt.leaves) {
    // Each detailed leaf is a niche: its ASINs carry the leaf, whatever their own trees say.
    snaps = hunt.leaves.filter((l) => l.detailed).flatMap((l) => (l.asins ?? []).slice(0, filters.perLeaf)
      .map((a) => bySnap.get(a)).filter((x): x is HuntAsin => !!x).map((s) => ({ ...s, leaf_category: l.name, leaf_category_id: l.id })));
  } else snaps = [...bySnap.values()];
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

export async function listHunts(): Promise<Omit<HuntRow, "asins" | "filters" | "leaves">[]> {
  return must(await db().from("pl_hunts").select("id, name, finder_total, fetched, reused, finder_tokens, detail_tokens, token_cost, created_at, status, note, finished_at").order("created_at", { ascending: false }).limit(20), "hunts") as Omit<HuntRow, "asins" | "filters" | "leaves">[];
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
