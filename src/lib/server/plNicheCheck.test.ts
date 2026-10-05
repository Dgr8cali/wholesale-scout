/** The Niches incumbent check: in the niche's Keepa category, on-niche titles only, the best sellers decide. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeepaProduct, KeepaSummary } from "../keepa/types";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { candidateSeed, checkNicheIncumbents, nicheCheckPlan, nicheToCandidate } from "./plNiches";

const k = vi.hoisted(() => ({ selections: [] as Record<string, unknown>[], lookups: [] as string[][] }));

/** A fake Keepa response for "fishing rod": a kids' bath toy, a cat toy, and three real rods; for "fishing pole", a pole and a rod again. */
const ITEMS: Record<string, { title: string; reviews: number; sold: number | null; rank: number; leaf: string; root?: string }> = {
  B0BATHTOY1: { title: "Magnetic Fishing Rod Bath Toy for Kids, 10 Floating Fish", reviews: 8_200, sold: 2_000, rank: 150, leaf: "Bath Toys" },
  B0CATTOY01: { title: "Interactive Cat Toy Fishing Rod with Feathers and Bell", reviews: 12_400, sold: 3_000, rank: 90, leaf: "Cat Teasers" },
  B0ROD00001: { title: "Shakespeare Ugly Stik Fishing Rod, 9ft Spinning", reviews: 1_600, sold: 400, rank: 2_100, leaf: "Fishing Rods" },
  B0ROD00002: { title: "Telescopic Fishing Rod and Reel Combo, Carbon Fibre", reviews: 640, sold: 600, rank: 1_800, leaf: "Fishing Rods" },
  B0ROD00003: { title: "Carp Fishing Rods 12ft 3lb Test Curve (Pair)", reviews: 210, sold: null, rank: 9_500, leaf: "Fishing Rods" },
  B0POLE0001: { title: "Telescopic Fishing Pole 2.1m, Carbon", reviews: 300, sold: 800, rank: 1_200, leaf: "Fishing Rods" },
};
// Hedgehog houses: none in Garden, all filed under Pet Supplies or Garden → Wildlife elsewhere.
Object.assign(ITEMS, {
  B0HOG00001: { title: "Wooden Hedgehog House, Weatherproof", reviews: 2_300, sold: 500, rank: 900, leaf: "Wildlife Houses", root: "Pet Supplies" },
  B0HOG00002: { title: "Hedgehog House with Tunnel Entrance", reviews: 450, sold: 300, rank: 1_500, leaf: "Small Animal Houses", root: "Pet Supplies" },
  B0HOG00003: { title: "Hedgehog Houses for the Garden, Pack of 2", reviews: 120, sold: 100, rank: 4_000, leaf: "Bird & Wildlife Care", root: "Home & Kitchen" },
  B0HOGTOY01: { title: "Hedgehog House Plush Toy for Kids", reviews: 80, sold: 50, rank: 8_000, leaf: "Soft Toys", root: "Toys & Games" },
});
const FINDER: Record<string, string[]> = {
  "hedgehog house": ["B0HOG00001", "B0HOG00002", "B0HOG00003", "B0HOGTOY01"],
  "fishing rod": ["B0BATHTOY1", "B0CATTOY01", "B0ROD00001", "B0ROD00002", "B0ROD00003"],
  "fishing pole": ["B0POLE0001", "B0ROD00001"],
};

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const summary = (rank: number, sold: number | null) => ({ rankNow: rank, monthlySold: sold, avgRank90d: rank, offersNow: 5, currentBuyBox: null, amazonLastSeenDays: null } as unknown as KeepaSummary);
  const product = (asin: string): KeepaProduct => {
    const x = ITEMS[asin];
    return {
      asin, eans: [], title: x.title, brand: "Brand", category: x.root ?? null, dimsCm: null, weightG: null, parentAsin: null, variationCount: null, imageUrl: null,
      reviewsNow: x.reviews, leafCategory: { id: 1, name: x.leaf }, summary: summary(x.rank, x.sold), buyBoxSellers: [],
      series: { rank: [], buyBox: [], newPrice: [[Date.now() - 86_400_000, 19.99]], offerCount: [], amazon: [], reviewCount: [] },
    } as unknown as KeepaProduct;
  };
  const fake = {
    available: true,
    async productFinder(selection: Record<string, unknown>) {
      k.selections.push(selection);
      // Nothing filed under Garden for the hedgehog house.
      const asins = selection.title === "hedgehog house" && selection.rootCategory ? [] : FINDER[selection.title as string] ?? [];
      return { asins, total: asins.length, tokensUsed: 11, tokensLeft: 900 };
    },
    async lookupByAsins(asins: string[], onResponse?: (m: { tokensConsumed: number }) => void) {
      k.lookups.push(asins);
      onResponse?.({ tokensConsumed: 2 * asins.length });
      return { byEan: new Map(), byAsin: new Map(asins.map((a) => [a, product(a)])), tokensUsed: 2 * asins.length, tokensLeft: 880, requests: [] };
    },
    async tokenStatus() { return { tokensLeft: 900, refillInMs: 60_000, refillRate: 20 }; },
  };
  return { ...real, getKeepa: () => fake };
});

describe("Niches incumbent check (fake Keepa)", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    for (const t of ["pl_niches", "pl_niche_settings", "pl_hunts", "pl_hunt_asins", "keepa_categories"]) fake.tables[t] ??= [];
    fake.tables.pl_niches.push({ id: "n1", customer_need: "fishing", search_terms: ["fishing rod", "fishing pole", "fishing rods"], categories: ["Sports & Outdoors"], extra: {}, keepa_by_day: null, shape: null });
    k.selections.length = 0; k.lookups.length = 0;
  });

  it("counts only the rods and the pole: the bath toy and the cat toy are left out, ranked by monthly sold", async () => {
    const r = await checkNicheIncumbents("n1");
    // One finder page a distinct term ("fishing rods" is covered by "fishing rod"), in the niche's category.
    expect(k.selections.map((x) => x.title)).toEqual(["fishing rod", "fishing pole"]);
    expect(k.selections[0]).toMatchObject({ rootCategory: [318949011] });
    expect(r.incumbents.map((x) => [x.asin, x.matchedTerm])).toEqual([
      ["B0POLE0001", "fishing pole"], ["B0ROD00002", "fishing rod"], ["B0ROD00001", "fishing rod"], ["B0ROD00003", "fishing rod"],
    ]);
    expect(r.incumbents[1]).toMatchObject({ monthlySold: 600, category: "Fishing Rods", reviews: 640 });
    expect(r).toMatchObject({ onNiche: 4, excludedCount: 2, rootCategories: ["Sports & Outdoors"], tokensUsed: 2 * 11 + 6 * 2 });
    expect(r.excluded.map((x) => [x.asin, x.why])).toEqual([["B0BATHTOY1", '"toy" in the title'], ["B0CATTOY01", '"toy" in the title']]);
    // One rod over 1,000 reviews: contested (with the toys counted it would read dominated).
    expect(r.shape).toBe("contested");
    expect(fake.tables.pl_niches[0]).toMatchObject({ shape: "contested", shape_rank: 1 });
  });

  it("a rerun reuses the finder's list and the fresh snapshots: no Keepa tokens", async () => {
    await checkNicheIncumbents("n1");
    expect(await nicheCheckPlan("n1", true)).toMatchObject({ reusing: true, estimate: 0 });
    const r = await checkNicheIncumbents("n1", true);
    expect(k.selections).toHaveLength(2);
    expect(k.lookups).toHaveLength(1);
    expect(r).toMatchObject({ reusedFinder: true, tokensUsed: 0, reused: 6, shape: "contested" });
  });

  it("too few in the niche's category: the same search on all of Amazon, labelled, with where they're filed", async () => {
    fake.tables.pl_niches.push({ id: "n2", customer_need: "hedgehog house", search_terms: ["hedgehog house"], categories: ["Garden"], extra: {}, keepa_by_day: null, shape: null });
    const plan = await nicheCheckPlan("n2");
    expect(plan).toMatchObject({ estimate: 11 + 50, fallback: 11 });
    const r = await checkNicheIncumbents("n2");
    expect(k.selections.map((x) => x.rootCategory ?? null)).toEqual([[11052671], null]);
    expect(r).toMatchObject({ outside: true, rootCategories: ["Garden"], onNiche: 3, excludedCount: 1, shape: "contested", tokensUsed: 2 * 11 + 4 * 2 });
    expect(r.incumbents.map((x) => x.asin)).toEqual(["B0HOG00001", "B0HOG00002", "B0HOG00003"]);
    expect(r.onNicheCategories).toEqual([{ name: "Pet Supplies", count: 2 }, { name: "Home & Kitchen", count: 1 }]);
    // A rerun keeps the label, and spends nothing.
    const again = await checkNicheIncumbents("n2", true);
    expect(again).toMatchObject({ outside: true, tokensUsed: 0, reusedFinder: true });
  });

  it("enough in the category: no search outside it", async () => {
    await checkNicheIncumbents("n1");
    expect(k.selections.every((x) => x.rootCategory)).toBe(true);
  });

  it("Create candidate carries the on-niche ASINs, the best-converting term and the average price", async () => {
    await ensureSeed();
    fake.tables.pl_niche_imports = [{ id: "imp1", category: "Sports & Outdoors" }];
    Object.assign(fake.tables.pl_niches[0], { import_id: "imp1", status: "new", flags: [], avg_price: 24.5, sv_360: 100000, candidate_id: null });
    // Before a check or a capture: no ASINs, the first term.
    expect(candidateSeed(fake.tables.pl_niches[0] as never)).toEqual({ asins: [], keyword: "fishing rod", keywordFrom: "first term" });
    await checkNicheIncumbents("n1");
    const n = fake.tables.pl_niches[0] as { extra: Record<string, unknown> };
    n.extra = { ...n.extra, poe: { snapshotId: "s1", capturedAt: "2026-10-01", terms: [{ term: "fishing rod", conversion: 2.2 }, { term: "sea fishing rod", conversion: 6.1 }, { term: "fishing pole", conversion: null }] } };
    const r = await nicheToCandidate("n1");
    expect(r).toMatchObject({ existed: false, asins: 4, keyword: "sea fishing rod", keywordFrom: "conversion", sell: 24.5 });
    const cand = fake.tables.pl_candidates.find((c) => c.id === r.candidateId)!;
    expect(cand).toMatchObject({ niche_keyword: "sea fishing rod", status: "researching" });
    // Gate 0's page-one ASINs: the check's top by sales, in that order (the first the reference).
    const asins = fake.tables.pl_candidate_asins.filter((a) => a.candidate_id === r.candidateId).sort((a, b) => Number(a.position) - Number(b.position));
    expect(asins.map((a) => a.asin)).toEqual(["B0POLE0001", "B0ROD00002", "B0ROD00001", "B0ROD00003"]);
    expect(asins[0].is_reference).toBe(true);
    expect(fake.tables.pl_candidate_fields.find((f) => f.candidate_id === r.candidateId && f.key === "sell")).toMatchObject({ value: "24.50", source: "poe" });
  });
});
