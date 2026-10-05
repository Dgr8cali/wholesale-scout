import "server-only";
import { referralCategoryFor } from "../fees/engine";
import { addDailyTokens, PL_KEEP_DAYS, type TokensByDay } from "../keepaLedger";
import { getKeepa, hasFinder, type KeepaCategory, type KeepaClient, type KeepaFinder, type KeepaProduct, type OnKeepaResponse } from "../keepa/client";
import {
  defaultFilters, DETAIL_TOKENS_PER_ASIN, LIMITS, DIRECT_PAGE, DIRECT_PAGE_TOKENS, directEstimate, directSelection, filtersKey, INCUMBENT_TAKE, INCUMBENT_TOKENS, incumbentSelection, finderSelection, fittingDetailLeaves, funnel, groupNiches, huntEstimate,
  SIZING_TOKENS, spendCap, TOKEN_RESERVE, TREE_MAX_CATEGORIES,
  type HuntAsin, type HuntEstimate, type Niche, type NicheHuntFilters,
} from "../pl/hunt";
import { activeRateCard, chunks, db, must } from "./db";
import { huntCategories, type HuntCategory } from "./hunt";
import { createCandidate, refreshCandidate, snapshotOf } from "./pl";
import { saveSnapshot } from "./process";
import { classifyIncumbents, finderTerms, type IncumbentCandidate } from "../pl/offNiche";

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
  /** Not sized: stage 1's spend is capped by the balance and this leaf didn't fit. */
  skipped?: boolean;
  /** Stage 2: picked for detail, and done (with how many fetched and reused). */
  detail?: boolean; detailed?: boolean; fetched?: number; reused?: number;
}

export type HuntStatus = "listing" | "sizing" | "finding" | "detailing" | "done" | "error" | "cancelled";
const RUNNING: HuntStatus[] = ["listing", "sizing", "finding", "detailing"];

/**
 * A hunt's progress. `cap`: it starts no Keepa call that would take its spend past the estimate +
 * 10%. Direct mode: finder pages done per root (-1 when a root ran out of results), and how far
 * detail has got through the found ASINs.
 */
export interface HuntProgressState {
  estimate?: HuntEstimate; cap?: number; sizingBudget?: number; leavesWanted?: number;
  pages?: Record<string, number>; detailIndex?: number; capped?: boolean;
  /** The incumbent check: each niche's leaf → the incumbents found (their ASINs), and whether it's finished. */
  incumbents?: Record<string, string[]>; incumbentsDone?: boolean;
  [k: string]: unknown;
}

export interface HuntRow {
  id: string; name: string; filters: NicheHuntFilters; asins: string[]; finder_total: number | null; fetched: number; reused: number;
  finder_tokens: number; detail_tokens: number; token_cost: number; created_at: string;
  status: HuntStatus; leaves: HuntLeaf[] | null; note: string | null; finished_at: string | null;
  progress: HuntProgressState | null;
}
export interface Preset { id: string; name: string; filters: NicheHuntFilters }
export interface Dismissal { key: string; name: string | null; reason: string | null; created_at: string }

const HUNT_COLS = "id, name, filters, asins, finder_total, fetched, reused, finder_tokens, detail_tokens, token_cost, created_at, status, leaves, note, finished_at, progress";
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
  hunt: HuntRow; niches: Niche[]; qualifying: number; near: number; incumbents: number; exhausted: boolean;
  /** "Why so few?": the qualifying checks in order over the detailed products. */
  funnel: ReturnType<typeof funnel>;
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

export interface HuntPlan {
  estimate: HuntEstimate; balance: number | null; fits: boolean; fittingDetailLeaves: number | null; leavesKnown: boolean;
  /** The most the hunt will spend: the estimate + 10%. */
  cap: number;
  /** More than the balance less the reserve: it waits for Keepa's refill part-way. */
  waitsForRefill: boolean;
  /** Leaves that would need sizing, and how many the balance allows (stage 1's spend is capped by it). */
  leavesWanted: number; sizingCapped: boolean;
}

/**
 * The cost before running: listing trees not stored (an upper bound), sizing leaves not counted in
 * the last 7 days, and N × ASINs per leaf of detail less what's cached. Against the balance, keeping
 * 100 tokens in reserve; when it doesn't fit, how many leaves to detail would.
 */
export async function planHunt(f: NicheHuntFilters): Promise<HuntPlan> {
  const keepa = getKeepa();
  if (f.mode === "direct") {
    // Direct: no tree; the finder pages must fit now, detail may wait for the refill.
    const estimate = directEstimate({ roots: f.categories.length, pages: f.pagesPerRoot, incumbentNiches: f.incumbentNiches });
    const status = keepa.available ? await keepa.tokenStatus().catch(() => null) : null;
    const balance = status?.tokensLeft ?? null;
    return {
      estimate, balance, fits: balance != null && balance - TOKEN_RESERVE >= (estimate.finder ?? 0), fittingDetailLeaves: null, leavesKnown: true,
      leavesWanted: 0, sizingCapped: false, cap: spendCap(estimate.total), waitsForRefill: balance != null && estimate.total > balance - TOKEN_RESERVE,
    };
  }
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
  const detailLeaves = Math.min(f.detailLeaves, f.leafIds?.length ?? f.detailLeaves);
  const full = huntEstimate({ rootsWithoutTree, leavesToSize, detailLeaves, perLeaf: f.perLeaf, cachedAsins });
  const status = keepa.available ? await keepa.tokenStatus().catch(() => null) : null;
  const balance = status?.tokensLeft ?? null;
  // Stage 1's spend is capped by the balance (less the reserve, the tree and stage 2): the largest
  // leaves are sized first, as many as fit.
  const room = balance == null ? 0 : balance - TOKEN_RESERVE - full.tree - full.detail;
  const sizable = Math.max(0, Math.min(leavesToSize, Math.floor(room / SIZING_TOKENS)));
  const estimate = huntEstimate({ rootsWithoutTree, leavesToSize: sizable, detailLeaves, perLeaf: f.perLeaf, cachedAsins });
  // Worth running when at least N leaves (or every leaf asked for) can be sized, counting cached ones.
  const cachedLeaves = (f.leafIds?.length ?? f.leavesCap) - leavesToSize;
  const fits = balance != null && room > 0 && sizable + cachedLeaves >= Math.min(detailLeaves, leavesToSize + cachedLeaves);
  return {
    estimate, balance, fits, leavesKnown: !!leaves, leavesWanted: leavesToSize, sizingCapped: sizable < leavesToSize,
    cap: spendCap(estimate.total), waitsForRefill: false,
    fittingDetailLeaves: balance == null ? null : fittingDetailLeaves({ ...full, sizing: Math.min(full.sizing, detailLeaves * SIZING_TOKENS) }, f.perLeaf, balance),
  };
}

export class HuntRefused extends Error {
  constructor(message: string, readonly plan: HuntPlan) { super(message); }
}

/** Start a hunt: refused when its estimate eats into the 100-token reserve. The chain does the rest. */
export async function startNicheHunt(f: NicheHuntFilters, name?: string | null): Promise<{ id: string; plan: HuntPlan }> {
  finderOrThrow();
  // One hunt at a time: two at once can't reuse each other's leaf counts (two started 6 s apart
  // spent 873 + 769 tokens on the same leaves).
  const runningNow = must(await db().from("pl_hunts").select("id, name").in("status", RUNNING).limit(1), "running hunts") as { id: string; name: string }[];
  if (runningNow.length) throw new Error(`A hunt is already running (${runningNow[0].name}): wait for it, or cancel it`);
  const plan = await planHunt(f);
  if (plan.balance == null) throw new Error("Couldn't read Keepa's token balance");
  if (!plan.fits && f.mode === "direct") throw new HuntRefused(`The finder pages need ${plan.estimate.finder} tokens: ${plan.balance} in the balance, ${TOKEN_RESERVE} kept in reserve. Fewer pages, or wait for the refill.`, plan);
  if (!plan.fits) {
    throw new HuntRefused(
      `This hunt needs more than the balance allows: ${plan.balance} tokens, ${TOKEN_RESERVE} kept in reserve. ` +
      (plan.fittingDetailLeaves ? `Detailing ${plan.fittingDetailLeaves} leaves instead of ${f.detailLeaves} fits.` : "Even sizing the leaves doesn't fit: size fewer leaves or wait for the refill."),
      plan,
    );
  }
  const names = await categoryNames();
  if (f.mode === "direct") {
    const roots = f.categories.map((id) => names.get(id) ?? String(id)).join(", ");
    const row = must(await db().from("pl_hunts").insert({
      name: (name?.trim() || `Niche Hunt · direct · ${roots} · ${f.pagesPerRoot} page${f.pagesPerRoot === 1 ? "" : "s"} a root`).slice(0, 200),
      filters: f, asins: [], status: "finding", leaves: null, last_progress_at: new Date().toISOString(),
      progress: { estimate: plan.estimate, cap: plan.cap, pages: {}, detailIndex: 0 },
    }).select("id").single(), "start hunt") as { id: string };
    return { id: row.id, plan };
  }
  const label = f.leafIds?.length ? `${f.leafIds.length} leaf${f.leafIds.length === 1 ? "" : "s"}` : f.categories.map((id) => names.get(id) ?? String(id)).join(", ");
  const { leaves } = await plannedLeaves(f);
  const row = must(await db().from("pl_hunts").insert({
    name: (name?.trim() || `Niche Hunt · ${label} · ${f.leafIds?.length ?? f.leavesCap} leaves → ${f.detailLeaves} × ${f.perLeaf}`).slice(0, 200),
    filters: f, asins: [], status: leaves ? "sizing" : "listing", leaves, last_progress_at: new Date().toISOString(),
    progress: { leaves: leaves?.length ?? null, sized: 0, detail: null, detailed: 0, estimate: plan.estimate, sizingBudget: plan.estimate.sizing, leavesWanted: plan.leavesWanted, cap: plan.cap },
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
    token_cost: (cur.token_cost ?? 0) + tokens, keepa_by_day: addDailyTokens(cur.keepa_by_day, tokens, new Date(), PL_KEEP_DAYS),
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
  // The cap: what's left of the estimate + 10% (older hunts have none).
  const left = () => (h.progress?.cap ?? Infinity) - (h.token_cost ?? 0);
  const capNote = () => `Stopped at the token cap: ${h.token_cost} spent of ${h.progress?.cap} (the estimate + 10%)`;
  // Before a call: wait for Keepa's refill rather than run the balance dry (the watchdog carries on).
  const waitForTokens = async (cost: number) => {
    const st = await keepa.tokenStatus().catch(() => null);
    if (st && st.tokensLeft < cost) throw new Error(`Keepa tokens: ${st.tokensLeft} left, the next call needs ${cost}`);
  };
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
          let tree = await storedTree(root);
          if (!tree) {
            if (left() < Math.ceil(TREE_MAX_CATEGORIES / 10)) throw new CapReached();
            await waitForTokens(Math.ceil(TREE_MAX_CATEGORIES / 10));
            tree = await listTree(keepa, root, (t) => addTokens(id, t, "finder"));
            h = await read();
          }
          all.push(...leavesOf(tree).map((c) => ({ id: c.id, name: c.name, products: c.products })));
        }
        leaves = [...new Map(all.map((l) => [l.id, l])).values()].sort((a, b) => (b.products ?? 0) - (a.products ?? 0)).slice(0, f.leavesCap);
      }
      // Keep the estimate, the sizing budget and the cap (overwriting them let a hunt size every leaf).
      await save({ status: "sizing", leaves, progress: { ...(h.progress ?? {}), leaves: leaves.length, sized: 0 } });
    }
    // Stage 1: size each leaf with one finder call (no detail), reusing counts from the last 7 days.
    if (h.status === "sizing") {
      const key = filtersKey(f);
      const leaves = [...h.leaves!];
      const cached = await cachedCounts(leaves.filter((l) => l.matches == null && !l.skipped).map((l) => l.id), key);
      // Stage 1's spend so far, against its budget (the balance at the start, less reserve, tree and detail).
      const budget = h.progress?.sizingBudget ?? Infinity;
      let spentSizing = leaves.reduce((a, l) => a + (l.cached ? 0 : l.finderTokens ?? 0), 0);
      for (const l of leaves) {
        if (l.matches != null || l.skipped) continue;
        const c = cached.get(l.id);
        if (c) Object.assign(l, { matches: c.matches, asins: c.asins, finderTokens: 0, cached: true });
        else if (spentSizing + SIZING_TOKENS > budget || left() < SIZING_TOKENS) l.skipped = true;
        else {
          if (!time()) break;
          await waitForTokens(SIZING_TOKENS);
          const r = await keepa.productFinder(finderSelection(f, l.id));
          await addTokens(id, r.tokensUsed, "finder");
          Object.assign(l, { matches: r.total, asins: r.asins.map((a) => a.toUpperCase()), finderTokens: r.tokensUsed, cached: false });
          spentSizing += r.tokensUsed;
          must(await d.from("pl_leaf_counts").upsert({ leaf_id: l.id, filters_key: key, matches: r.total, asins: l.asins, finder_tokens: r.tokensUsed, counted_at: new Date().toISOString() }, { onConflict: "leaf_id,filters_key" }), "save leaf count");
        }
        await save({ leaves });
      }
      if (leaves.every((l) => l.matches != null || l.skipped)) {
        // The most promising leaves: most matches first, at least minLeafMatches.
        const picked = new Set(leaves.filter((l) => (l.matches ?? 0) >= f.minLeafMatches).sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0)).slice(0, f.detailLeaves).map((l) => l.id));
        for (const l of leaves) l.detail = picked.has(l.id);
        await save({ status: picked.size ? "detailing" : "done", leaves, ...(picked.size ? {} : { finished_at: new Date().toISOString(), note: `No leaf had ${f.minLeafMatches}+ matches` }) });
      }
    }
    // Stage 2: detail the picked leaves' best sellers, reusing snapshots under 7 days old.
    if (h.status === "detailing" && h.leaves) {
      const names = await categoryNames();
      const leaves = [...h.leaves!];
      for (const l of leaves) {
        if (!l.detail || l.detailed) continue;
        if (!time()) break;
        const asins = (l.asins ?? []).slice(0, f.perLeaf);
        const cached = await freshHuntAsins(asins);
        let need = asins.filter((a) => !cached.has(a));
        const room = Math.max(0, Math.floor(left() / DETAIL_TOKENS_PER_ASIN));
        if (need.length > room) {
          if (!room) { await save({ status: "done", finished_at: new Date().toISOString(), note: capNote(), progress: { ...(h.progress ?? {}), capped: true } }); break; }
          need = need.slice(0, room);
        }
        if (need.length) await waitForTokens(need.length * DETAIL_TOKENS_PER_ASIN);
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
      if (h.status === "detailing" && leaves.every((l) => !l.detail || l.detailed)) await save({ status: "done", finished_at: new Date().toISOString(), note: null });
    }
    // Direct mode, stage 1: one filtered finder query per root, page by page, rank drops first.
    if (h.status === "finding") {
      const pages: Record<string, number> = { ...(h.progress?.pages ?? {}) };
      const found = new Set(h.asins);
      let total = h.finder_total ?? 0;
      let capped = false;
      roots: for (const root of f.categories) {
        while (pages[root] !== -1 && (pages[root] ?? 0) < f.pagesPerRoot) {
          if (!time()) break roots;
          if (left() < DIRECT_PAGE_TOKENS) { capped = true; break roots; }
          await waitForTokens(DIRECT_PAGE_TOKENS);
          const page = pages[root] ?? 0;
          const r = await keepa.productFinder({ ...directSelection(f, root), perPage: DIRECT_PAGE, page });
          await addTokens(id, r.tokensUsed, "finder");
          for (const a of r.asins) found.add(a.toUpperCase());
          if (page === 0) total += r.total;
          // A short page: the root has no more.
          pages[root] = r.asins.length < DIRECT_PAGE ? -1 : page + 1;
          await save({ asins: [...found], finder_total: total, progress: { ...(h.progress ?? {}), pages } });
        }
      }
      const finished = f.categories.every((r) => pages[r] === -1 || (pages[r] ?? 0) >= f.pagesPerRoot);
      if (capped) await save({ status: found.size ? "detailing" : "done", note: capNote(), progress: { ...(h.progress ?? {}), pages, capped: true }, ...(found.size ? {} : { finished_at: new Date().toISOString() }) });
      else if (finished) await save({ status: found.size ? "detailing" : "done", progress: { ...(h.progress ?? {}), pages }, ...(found.size ? {} : { finished_at: new Date().toISOString(), note: "The finder found nothing under these filters" }) });
    }
    // Direct mode, stage 2: detail the found ASINs 50 at a time, reusing snapshots under 7 days old.
    if (h.status === "detailing" && !h.leaves) {
      const names = await categoryNames();
      let idx = h.progress?.detailIndex ?? 0;
      while (idx < h.asins.length) {
        if (!time()) break;
        const batch = h.asins.slice(idx, idx + 50);
        const cached = await freshHuntAsins(batch);
        let need = batch.filter((a) => !cached.has(a));
        const room = Math.max(0, Math.floor(left() / DETAIL_TOKENS_PER_ASIN));
        const capped = need.length > room;
        if (capped) need = need.slice(0, room);
        let spent = 0, exhausted = false;
        const fetched: KeepaProduct[] = [];
        if (need.length) {
          await waitForTokens(need.length * DETAIL_TOKENS_PER_ASIN);
          const onResponse: OnKeepaResponse = (m) => { spent += m.tokensConsumed; };
          try {
            const res = await keepa.lookupByAsins(need, onResponse, { buyBox: false, rating: true });
            fetched.push(...res.byAsin.values());
            exhausted = !!res.exhausted;
          } finally {
            await addTokens(id, spent, "detail");
          }
          const snaps = fetched.map((k) => huntSnapshot(k, names));
          if (snaps.length) must(await d.from("pl_hunt_asins").upsert(snaps, { onConflict: "asin" }), "save hunt snapshots");
          for (const k of fetched) await saveSnapshot(k).catch((e) => console.error(`[pl hunt] keepa snapshot for ${k.asin} not stored: ${(e as Error).message}`));
          if (exhausted) throw new Error("Keepa: not enough tokens");
        }
        const counts = { fetched: (h.fetched ?? 0) + fetched.length, reused: (h.reused ?? 0) + cached.size };
        if (capped) {
          // The hunt keeps only what was detailed: the rest of the found ASINs aren't judged on old data.
          const kept = [...h.asins.slice(0, idx), ...cached.keys(), ...fetched.map((k) => k.asin)];
          await save({ ...counts, asins: [...new Set(kept)], status: "done", finished_at: new Date().toISOString(), note: capNote(), progress: { ...(h.progress ?? {}), detailIndex: idx + batch.length, capped: true } });
          break;
        }
        idx += batch.length;
        await save({ ...counts, progress: { ...(h.progress ?? {}), detailIndex: idx } });
      }
      // Stage 3: the incumbent check (direct mode caps reviews in its query, so it finds none).
      if (h.status === "detailing" && (h.progress?.detailIndex ?? 0) >= h.asins.length && !h.progress?.incumbentsDone && f.incumbentNiches > 0 && !h.progress?.capped) {
        const r = await incumbentStage(h, f, keepa, { id, left, waitForTokens, time, save: async (patch) => { await save(patch); return h; } });
        if (r === "capped") await save({ note: capNote(), progress: { ...(h.progress ?? {}), capped: true, incumbentsDone: true } });
        else if (r === "done") await save({ progress: { ...(h.progress ?? {}), incumbentsDone: true } });
      }
      if (h.status === "detailing" && (h.progress?.detailIndex ?? 0) >= h.asins.length && (h.progress?.incumbentsDone || f.incumbentNiches === 0 || h.progress?.capped)) {
        await save({ status: "done", finished_at: new Date().toISOString(), note: h.progress?.capped ? h.note : null });
      }
    }
  } catch (e) {
    if (e instanceof CapReached) {
      await save({ status: "done", finished_at: new Date().toISOString(), note: capNote(), progress: { ...(h.progress ?? {}), capped: true } });
      await d.from("pl_hunts").update({ lease_until: null }).eq("id", id);
      return report(false);
    }
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

/** The niches an incumbent check covers: 3+ qualifying ASINs (strict), grouped by leaf, most first. */
async function incumbentLeaves(huntId: string, limit: number): Promise<number[]> {
  const r = await loadHunt(huntId, false, { minAsins: 3 }, { strict: true });
  return r.niches.filter((n) => n.count >= 3 && n.key.startsWith("cat:")).sort((a, b) => b.count - a.count).slice(0, limit).map((n) => Number(n.key.slice(4)));
}

/**
 * For each niche, one finder page of the leaf's best sellers over the review cap (any price), the
 * top 10 detailed (reusing snapshots under 7 days old) for their review counts: those are the
 * incumbents its shape and max reviews read. Stops at the cap; carries on where it left off.
 */
async function incumbentStage(
  h: HuntRow, f: NicheHuntFilters, keepa: Finder,
  x: { id: string; left: () => number; waitForTokens: (cost: number) => Promise<void>; time: () => boolean; save: (patch: Record<string, unknown>) => Promise<HuntRow> },
): Promise<"done" | "capped" | "later"> {
  const names = await categoryNames();
  const leaves = await incumbentLeaves(x.id, f.incumbentNiches);
  const found: Record<string, string[]> = { ...(h.progress?.incumbents ?? {}) };
  for (const leaf of leaves) {
    if (found[leaf]) continue;
    if (!x.time()) return "later";
    if (x.left() < DIRECT_PAGE_TOKENS) return "capped";
    await x.waitForTokens(DIRECT_PAGE_TOKENS);
    const r = await keepa.productFinder({ ...incumbentSelection(leaf, f.maxReviews), perPage: DIRECT_PAGE, page: 0 });
    await addTokens(x.id, r.tokensUsed, "finder");
    const top = r.asins.slice(0, INCUMBENT_TAKE).map((a) => a.toUpperCase());
    const cached = await freshHuntAsins(top);
    let need = top.filter((a) => !cached.has(a));
    const room = Math.max(0, Math.floor((x.left() - r.tokensUsed) / DETAIL_TOKENS_PER_ASIN));
    if (need.length > room) need = need.slice(0, room);
    const fetched: KeepaProduct[] = [];
    if (need.length) {
      await x.waitForTokens(need.length * DETAIL_TOKENS_PER_ASIN);
      let spent = 0;
      try {
        const res = await keepa.lookupByAsins(need, (m) => { spent += m.tokensConsumed; }, { buyBox: false, rating: true });
        fetched.push(...res.byAsin.values());
      } finally {
        await addTokens(x.id, spent, "detail");
      }
      const snaps = fetched.map((k) => huntSnapshot(k, names));
      if (snaps.length) must(await db().from("pl_hunt_asins").upsert(snaps, { onConflict: "asin" }), "save hunt snapshots");
    }
    found[leaf] = [...cached.keys(), ...fetched.map((k) => k.asin)];
    h = await x.save({ progress: { ...(h.progress ?? {}), incumbents: found } });
  }
  return "done";
}

/**
 * Run (or re-run) the incumbent check on a finished direct hunt: its spend cap is raised by the
 * check's estimate + 10% (niches × ~31), and the job carries on from the detailing stage.
 */
export async function recheckIncumbents(huntId: string, limit = LIMITS.incumbentNiches): Promise<{ niches: number; estimate: number }> {
  const d = db();
  const h = must(await d.from("pl_hunts").select(HUNT_COLS).eq("id", huntId).single(), "hunt") as HuntRow;
  if (h.leaves) throw new Error("The incumbent check is for direct-mode hunts (a leaf hunt sees its incumbents already)");
  if (RUNNING.includes(h.status)) throw new Error("The hunt is still running");
  const leaves = await incumbentLeaves(huntId, limit);
  const estimate = leaves.length * INCUMBENT_TOKENS;
  must(await d.from("pl_hunts").update({
    status: "detailing", finished_at: null, note: null, last_progress_at: new Date().toISOString(),
    filters: { ...validFiltersOrStored(h.filters), incumbentNiches: limit },
    progress: { ...(h.progress ?? {}), detailIndex: h.asins.length, capped: false, incumbents: {}, incumbentsDone: false, cap: (h.token_cost ?? 0) + spendCap(estimate) },
  }).eq("id", huntId), "recheck incumbents");
  return { niches: leaves.length, estimate };
}

/** The hunt reached its cap (the estimate + 10%) before a call it needed. */
class CapReached extends Error {}

/** Filters stored on a hunt, with defaults for anything added since. */
function validFiltersOrStored(f: NicheHuntFilters): NicheHuntFilters {
  // Hunts from before direct mode were leaf hunts; before the incumbent check, it was off.
  return { ...defaultFilters([]), ...f, mode: f.mode ?? "leaf", incumbentNiches: f.incumbentNiches ?? 0, categories: f.categories ?? [] };
}

/** Hunts whose chain has died: work left, no lease, nothing moved for 3 minutes (the watchdog restarts them). */
export async function stalledHunts(now = Date.now()): Promise<string[]> {
  const res = await db().from("pl_hunts").select("id, lease_until, last_progress_at, created_at").in("status", RUNNING);
  if (res.error) return []; // before the migration
  return (res.data as { id: string; lease_until: string | null; last_progress_at: string | null; created_at: string }[])
    .filter((h) => !(h.lease_until && Date.parse(h.lease_until) > now) && now - Date.parse(h.last_progress_at ?? h.created_at) > 3 * 60_000)
    .map((h) => h.id);
}

export async function cancelHunt(id: string) {
  must(await db().from("pl_hunts").update({ status: "cancelled", finished_at: new Date().toISOString(), lease_until: null }).eq("id", id).in("status", RUNNING), "cancel hunt");
}

/**
 * A hunt's niches, grouped now (so a dismissal or the "At least" control shows at once). A leaf
 * hunt: each detailed leaf is a niche of its best sellers. An older single-page hunt: grouped by
 * each product's own leaf category.
 */
export async function loadHunt(id: string, exhausted = false, override?: Partial<NicheHuntFilters>, opts: { strict?: boolean } = {}): Promise<HuntResult> {
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
  // Incumbents from the incumbent check: in their niche's leaf, counted as incumbents.
  const incumbentIds = new Set<string>();
  const extra: HuntAsin[] = [];
  const checked = Object.entries(hunt.progress?.incumbents ?? {});
  const want = checked.flatMap(([, a]) => a).filter((a) => !bySnap.has(a));
  const incSnaps = new Map<string, HuntAsin>();
  for (const c of chunks(want)) for (const r of must(await d.from("pl_hunt_asins").select(ASIN_COLS).in("asin", c), "incumbent snapshots") as Record<string, unknown>[]) incSnaps.set(r.asin as string, toHuntAsin(r));
  for (const [leaf, asins] of checked) {
    const name = snaps.find((x) => x.leaf_category_id === Number(leaf))?.leaf_category ?? null;
    for (const a of asins) {
      const s = incSnaps.get(a) ?? bySnap.get(a);
      if (!s || (s.review_count ?? 0) <= filters.maxReviews) continue;
      incumbentIds.add(a);
      if (!snaps.some((x) => x.asin === a)) extra.push({ ...s, leaf_category_id: Number(leaf), leaf_category: name ?? s.leaf_category, home_leaf_id: s.leaf_category_id ?? null });
    }
  }
  const grouped = [...snaps, ...extra];
  // A direct hunt's niches have a shape only once their leaf has had the incumbent check.
  const checkedLeaves = hunt.leaves ? undefined : new Set(checked.map(([leaf]) => `cat:${leaf}`));
  const niches = groupNiches(grouped, filters, dismissed, { ...opts, incumbents: incumbentIds, checkedLeaves });
  // Every niche with anything in it, for the totals; the funnel over the hunt's own detailed products.
  const all = groupNiches(grouped, { ...filters, minAsins: 0 }, dismissed, { incumbents: incumbentIds, checkedLeaves });
  return {
    hunt: { ...hunt, filters },
    niches,
    qualifying: all.reduce((a, n) => a + n.count, 0),
    near: all.reduce((a, n) => a + n.nearCount, 0),
    incumbents: all.reduce((a, n) => a + n.incumbentCount, 0),
    funnel: funnel([...new Map(snaps.map((x) => [x.asin, x])).values()], filters),
    exhausted,
  };
}

/** The qualifying thresholds (not the finder's), which a re-qualify may change. */
const QUALIFYING_KEYS = ["priceMin", "priceMax", "ratingMin", "ratingMax", "maxReviews", "minRankDrops90", "maxWeightG", "smallParcel", "noAmazon", "excludeAmazonBrands", "minAsins"] as const;

/**
 * Re-run qualification on a hunt's cached detail with new thresholds: 0 tokens. The finder filters
 * and the leaves are unchanged (they'd need a new hunt); the new thresholds are kept on the hunt.
 */
export async function requalifyHunt(id: string, thresholds: Partial<NicheHuntFilters>, opts: { strict?: boolean } = {}): Promise<HuntResult> {
  const hunt = must(await db().from("pl_hunts").select("filters").eq("id", id).single(), "hunt") as { filters: NicheHuntFilters };
  const next: Record<string, unknown> = { ...validFiltersOrStored(hunt.filters) };
  for (const k of QUALIFYING_KEYS) if (thresholds[k] !== undefined) next[k] = thresholds[k];
  must(await db().from("pl_hunts").update({ filters: next }).eq("id", id), "requalify");
  return loadHunt(id, false, undefined, opts);
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
 * root category, up to 10 of its page-one ASINs (qualifying, then incumbents by rank; the best seller
 * is the reference) with their
 * hunt snapshots copied across, then the usual Keepa fill. Only the reference's Buy Box history is
 * new (about 3 tokens); the rest reuse the hunt's snapshots.
 */
export async function candidateFromNiche(huntId: string, key: string) {
  const { niches } = await loadHunt(huntId, false, { minAsins: 1 });
  const niche = niches.find((n) => n.key === key);
  if (!niche) throw new Error("That niche isn't in this hunt (dismissed, or the hunt changed)");
  const card = await activeRateCard();
  // Page one: qualifying first (by sales), then the incumbents by rank, then near misses; up to 10.
  // The reference (first) is the best seller among them: the best 90-day sales rank (Amazon's own
  // measure; bought-past-month can disagree with it).
  const bySales = (a: { sales: number | null }, b: { sales: number | null }) => (b.sales ?? 0) - (a.sales ?? 0);
  const byRank = (a: { snap: HuntAsin }, b: { snap: HuntAsin }) => (a.snap.avg_rank_90d ?? a.snap.rank ?? Infinity) - (b.snap.avg_rank_90d ?? b.snap.rank ?? Infinity);
  const ordered = [...niche.asins.filter((a) => a.qualifies).sort(bySales), ...niche.asins.filter((a) => a.incumbent).sort(byRank), ...niche.asins.filter((a) => a.near).sort(bySales)].slice(0, 10);
  const best = [...ordered].sort((a, b) => byRank(a, b) || bySales(a, b))[0];
  const picked = best ? [best, ...ordered.filter((a) => a !== best)] : ordered;
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

/* ===================== an incumbent check on one search term (Niche Import) ===================== */

/** Products a niche's check details for their titles and sales: the finder's best 25 in the category, across its terms. */
export const TERM_CANDIDATES = 25;
/** Finder queries at most (one a distinct search term). */
export const TERM_FINDER_MAX = 3;
/** The finder pages (one a distinct search term) and up to 25 details. */
export const termCheckTokens = (finderQueries: number) => finderQueries * DIRECT_PAGE_TOKENS + TERM_CANDIDATES * DETAIL_TOKENS_PER_ASIN;
/** Fewer than this many found in the niche's categories: the same search again with no category (Amazon files some niches elsewhere). */
export const TERM_MIN_IN_CATEGORY = 5;
/** A rerun within this long reuses the finder's list (and the 7-day snapshots): no finder call. */
export const TERM_REUSE_MS = 7 * 86_400_000;
let termCheckRunning = false;

/**
 * The finder's selection for a search term: best sellers in the niche's root category whose titles
 * have the term's words (Keepa's title filter; the phrase and the off-niche words are checked after).
 */
export function termIncumbentSelection(term: string, rootCategoryIds: number[] = []): Record<string, unknown> {
  return {
    title: term.trim(), ...(rootCategoryIds.length ? { rootCategory: rootCategoryIds } : {}),
    current_SALES_gte: 1, productType: [0], singleVariation: true, sort: [["current_SALES", "asc"]],
  };
}

export interface TermReuse { asins: string[]; at: string; found?: number; outside?: boolean }

/** The previous check's finder list, when it's under 7 days old and was for the same terms. */
export function reusable(prev: { candidates?: string[]; finderAt?: string; checkedAt?: string; found?: number; terms?: string[]; term?: string; outside?: boolean } | null | undefined, terms: string[]): TermReuse | null {
  if (!prev?.candidates?.length) return null;
  const same = (prev.terms ?? (prev.term ? [prev.term] : [])).join("|").toLowerCase() === terms.join("|").toLowerCase();
  return same ? { asins: prev.candidates, at: prev.finderAt ?? prev.checkedAt ?? "", found: prev.found, outside: prev.outside } : null;
}

/**
 * What a check would cost now, and whether it may run (balance, reserve, nothing else on Keepa). A
 * rerun with the finder's list from the last 7 days costs only the snapshots that have aged out.
 * `fallback`: the extra finder pages if the niche's categories have too few (rooted checks only).
 */
export async function termCheckPlan(reuse?: TermReuse | null, terms: string[] = [], rooted = false): Promise<{ estimate: number; fallback: number; balance: number | null; reserve: number; fits: boolean; blocked: string | null; reusing: boolean; finderTerms: string[] }> {
  const keepa = getKeepa();
  const balance = keepa.available ? (await keepa.tokenStatus().catch(() => null))?.tokensLeft ?? null : null;
  let blocked: string | null = null;
  if (!keepa.available || !hasFinder(keepa)) blocked = "Keepa isn't set up (KEEPA_API_KEY)";
  else if (termCheckRunning) blocked = "Another incumbent check is running: one at a time";
  else {
    const hunts = await db().from("pl_hunts").select("id").in("status", RUNNING).limit(1);
    if ((hunts.data ?? []).length) blocked = "A Niche Hunt is running: it has Keepa until it finishes";
  }
  const reusing = !!reuse && Date.now() - Date.parse(reuse.at) < TERM_REUSE_MS && reuse.asins.length > 0;
  const ft = finderTerms(terms, TERM_FINDER_MAX);
  const estimate = reusing ? (reuse!.asins.length - (await freshHuntAsins(reuse!.asins)).size) * DETAIL_TOKENS_PER_ASIN : termCheckTokens(Math.max(1, ft.length));
  const fallback = !reusing && rooted ? Math.max(1, ft.length) * DIRECT_PAGE_TOKENS : 0;
  const most = estimate + fallback;
  return { estimate, fallback, balance, reserve: TOKEN_RESERVE, fits: most === 0 || (balance != null && balance - TOKEN_RESERVE >= most), blocked, reusing, finderTerms: ft };
}

/**
 * The incumbent check on a niche's search terms, on-niche only: a finder page of best sellers in the
 * niche's root categories for each distinct term (one containing another is covered by it), merged
 * in turn to 25, detailed for title, reviews and monthly sold (snapshots under 7 days old reused; a
 * rerun reuses the finder's list too); then only titles with one of the terms as a phrase and none
 * of the off-niche words count, and the 10 best sellers among them by monthly sold (else sales
 * rank) decide the shape: open (nobody over 1,000 reviews), contested (one), dominated (two, or one
 * over 5,000). When the niche's categories hold fewer than 5 products, the same search runs again
 * with no category (Amazon files hedgehog houses under Pet Supplies, not Garden): the result says
 * it was found outside them. One at a time, never over the estimate (and that fallback) + 10%.
 */
export async function termIncumbentCheck(termOrTerms: string | string[], o: { rootCategoryIds?: number[]; rootNames?: string[]; pet?: boolean; kids?: boolean; toys?: boolean; offNiche?: string[]; reuse?: TermReuse | null } = {}) {
  const terms = [...new Set((Array.isArray(termOrTerms) ? termOrTerms : [termOrTerms]).map((t) => t.trim()).filter(Boolean))];
  const term = terms[0] ?? "";
  const rooted = (o.rootCategoryIds?.length ?? 0) > 0;
  const plan = await termCheckPlan(o.reuse, terms, rooted);
  if (plan.blocked) throw new Error(plan.blocked);
  if (!plan.fits) throw new Error(`The check needs up to ${plan.estimate + plan.fallback} tokens: ${plan.balance ?? "?"} in the balance, ${plan.reserve} kept in reserve. Wait for the refill.`);
  const keepa = getKeepa() as Finder;
  const cap = spendCap(Math.max(plan.estimate + plan.fallback, 1));
  termCheckRunning = true;
  let spent = 0;
  try {
    let candidates: string[], found: number, finderAt: string, outside = false;
    if (plan.reusing) {
      candidates = o.reuse!.asins; found = o.reuse!.found ?? candidates.length; finderAt = o.reuse!.at; outside = !!o.reuse!.outside;
    } else {
      found = 0;
      const search = async (roots: number[]) => {
        const lists: string[][] = [];
        for (const t of plan.finderTerms) {
          const r = await keepa.productFinder({ ...termIncumbentSelection(t, roots), perPage: DIRECT_PAGE, page: 0 });
          spent += r.tokensUsed;
          found += r.total;
          lists.push(r.asins.map((a) => a.toUpperCase()));
        }
        return lists;
      };
      // Each term's best sellers in turn, so every term gets its share of the 25.
      const seen = new Set<string>();
      const take = (lists: string[][]) => {
        for (let i = 0; seen.size < TERM_CANDIDATES && lists.some((l) => i < l.length); i++) {
          for (const l of lists) if (i < l.length && seen.size < TERM_CANDIDATES) seen.add(l[i]);
        }
      };
      take(await search(o.rootCategoryIds ?? []));
      // Too few in the niche's categories: Amazon files it elsewhere. The same search on all of Amazon.
      if (rooted && seen.size < TERM_MIN_IN_CATEGORY) {
        outside = true;
        take(await search([]));
      }
      candidates = [...seen]; finderAt = new Date().toISOString();
    }
    const cached = await freshHuntAsins(candidates);
    let need = candidates.filter((a) => !cached.has(a));
    const room = Math.max(0, Math.floor((cap - spent) / DETAIL_TOKENS_PER_ASIN));
    if (need.length > room) need = need.slice(0, room);
    if (need.length) {
      const fetched: KeepaProduct[] = [];
      let detail = 0;
      try {
        const res = await keepa.lookupByAsins(need, (m) => { detail += m.tokensConsumed; }, { buyBox: false, rating: true });
        fetched.push(...res.byAsin.values());
      } finally {
        spent += detail;
      }
      const names = await categoryNames();
      const snaps = fetched.map((k) => huntSnapshot(k, names));
      if (snaps.length) must(await db().from("pl_hunt_asins").upsert(snaps, { onConflict: "asin" }), "save hunt snapshots");
    }
    const fresh = await freshHuntAsins(candidates);
    const products: IncumbentCandidate[] = candidates.map((a) => fresh.get(a)).filter((x): x is HuntAsin => !!x).map((x) => ({
      asin: x.asin, title: x.title, brand: x.brand, reviews: x.review_count, price: x.price, rank: x.rank,
      monthlySold: x.bought_past_month, category: x.leaf_category ?? x.root_category ?? null, rootCategory: x.root_category ?? null,
    }));
    const c = classifyIncumbents(products, terms, { pet: o.pet, kids: o.kids, toys: o.toys, words: o.offNiche });
    return {
      term, terms, finderTerms: plan.reusing ? null : plan.finderTerms, rootCategories: o.rootNames ?? [], outside, onNicheCategories: c.categories,
      found, shape: c.shape, onNiche: c.onNiche, incumbents: c.top,
      excluded: c.excluded.slice(0, 15).map((x) => ({ asin: x.asin, title: x.title, why: x.why })), excludedCount: c.excluded.length,
      candidates, finderAt, reusedFinder: plan.reusing, tokensUsed: spent, reused: candidates.filter((a) => cached.has(a)).length, checkedAt: new Date().toISOString(),
    };
  } finally {
    termCheckRunning = false;
  }
}
