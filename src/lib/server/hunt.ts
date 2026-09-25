import "server-only";
import { finderSelection, finderTokens, huntName, shapeFromProfile, type HuntShape } from "../hunt";
import { getKeepa, hasFinder } from "../keepa/client";
import { db, loadProfile, must } from "./db";
import { startAsinRun } from "./sellerScan";

export interface HuntCategory { id: number; name: string; products: number | null }

// Keepa's root list includes digital and service stores no wholesaler sells in.
const NOT_WHOLESALE = /alexa|apps & games|audible|books|cds|credit|cushion covers|digital|dvd|gift cards|handmade|business services|kindle|kosmetik|outlet|prime video|software/i;
const wholesale = (cs: HuntCategory[]) => cs.filter((c) => !NOT_WHOLESALE.test(c.name));

/** Amazon UK's top-level categories: kept once looked up (1 token); `lookup` asks Keepa when there are none. */
export async function huntCategories(lookup: boolean): Promise<{ categories: HuntCategory[]; tokensUsed: number }> {
  const d = db();
  const have = must(await d.from("keepa_categories").select("id, name, products").order("name"), "categories") as HuntCategory[];
  if (have.length || !lookup) return { categories: wholesale(have), tokensUsed: 0 };
  const keepa = getKeepa();
  if (!hasFinder(keepa)) throw new Error("Keepa isn't set up (KEEPA_API_KEY)");
  const r = await keepa.rootCategories();
  if (r.categories.length) {
    must(await d.from("keepa_categories").upsert(r.categories.map((c) => ({ id: c.id, name: c.name, products: c.products, fetched_at: new Date().toISOString() }))), "save categories");
  }
  return { categories: wholesale(r.categories), tokensUsed: r.tokensUsed };
}

/** The default profile's shape for the page to start from, and the balance to show the cost against. */
export async function huntStart(): Promise<{ profile: string; shape: HuntShape; rankByCategory: Record<string, number>; categories: HuntCategory[]; tokensLeft: number | null; keepa: boolean }> {
  const profile = await loadProfile(null);
  const keepa = getKeepa();
  const [status, cats] = await Promise.all([
    keepa.available ? keepa.tokenStatus().catch(() => null) : null,
    huntCategories(false),
  ]);
  return {
    profile: profile.name,
    shape: shapeFromProfile(profile.config),
    rankByCategory: profile.config.gates.demand.maxRankByCategory ?? {},
    categories: cats.categories,
    tokensLeft: status?.tokensLeft ?? null,
    keepa: hasFinder(keepa),
  };
}

/**
 * Run the Product Finder with the shape and screen what it finds as a run with no cost (like a
 * seller scan). The finder's tokens go on the run. Nothing found: no run.
 */
export async function startHunt(shape: HuntShape): Promise<{ runId: string | null; total: number; taken: number; tokensUsed: number }> {
  const keepa = getKeepa();
  if (!hasFinder(keepa)) throw new Error("Keepa isn't set up (KEEPA_API_KEY)");
  const found = await keepa.productFinder(finderSelection(shape));
  const asins = [...new Set(found.asins.map((a) => a.toUpperCase()))].slice(0, shape.results);
  if (!asins.length) return { runId: null, total: found.total, taken: 0, tokensUsed: found.tokensUsed };
  const profile = await loadProfile(null);
  const { runId } = await startAsinRun({
    asins,
    name: huntName(shape),
    profileId: profile.id,
    stats: { hunt: { shape, total: found.total, taken: asins.length, finderTokens: found.tokensUsed } },
    tokens: { count: found.tokensUsed, stage: "lookup" },
  });
  return { runId, total: found.total, taken: asins.length, tokensUsed: found.tokensUsed };
}

export { finderTokens };
