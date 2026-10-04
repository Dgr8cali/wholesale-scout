/** The Niches incumbent check: in the niche's Keepa category, on-niche titles only, the best sellers decide. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeepaProduct, KeepaSummary } from "../keepa/types";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { checkNicheIncumbents, nicheCheckPlan } from "./plNiches";

const k = vi.hoisted(() => ({ selections: [] as Record<string, unknown>[], lookups: [] as string[][] }));

/** A fake Keepa response for "fishing rod": a kids' bath toy, a cat toy, and three real rods. */
const ITEMS: Record<string, { title: string; reviews: number; sold: number | null; rank: number; leaf: string }> = {
  B0BATHTOY1: { title: "Magnetic Fishing Rod Bath Toy for Kids, 10 Floating Fish", reviews: 8_200, sold: 2_000, rank: 150, leaf: "Bath Toys" },
  B0CATTOY01: { title: "Interactive Cat Toy Fishing Rod with Feathers and Bell", reviews: 12_400, sold: 3_000, rank: 90, leaf: "Cat Teasers" },
  B0ROD00001: { title: "Shakespeare Ugly Stik Fishing Rod, 9ft Spinning", reviews: 1_600, sold: 400, rank: 2_100, leaf: "Fishing Rods" },
  B0ROD00002: { title: "Telescopic Fishing Rod and Reel Combo, Carbon Fibre", reviews: 640, sold: 600, rank: 1_800, leaf: "Fishing Rods" },
  B0ROD00003: { title: "Carp Fishing Rods 12ft 3lb Test Curve (Pair)", reviews: 210, sold: null, rank: 9_500, leaf: "Fishing Rods" },
};

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const summary = (rank: number, sold: number | null) => ({ rankNow: rank, monthlySold: sold, avgRank90d: rank, offersNow: 5, currentBuyBox: null, amazonLastSeenDays: null } as unknown as KeepaSummary);
  const product = (asin: string): KeepaProduct => {
    const x = ITEMS[asin];
    return {
      asin, eans: [], title: x.title, brand: "Brand", category: null, dimsCm: null, weightG: null, parentAsin: null, variationCount: null, imageUrl: null,
      reviewsNow: x.reviews, leafCategory: { id: 1, name: x.leaf }, summary: summary(x.rank, x.sold), buyBoxSellers: [],
      series: { rank: [], buyBox: [], newPrice: [[Date.now() - 86_400_000, 19.99]], offerCount: [], amazon: [], reviewCount: [] },
    } as unknown as KeepaProduct;
  };
  const fake = {
    available: true,
    async productFinder(selection: Record<string, unknown>) { k.selections.push(selection); return { asins: Object.keys(ITEMS), total: 5, tokensUsed: 11, tokensLeft: 900 }; },
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
    fake.tables.pl_niches.push({ id: "n1", customer_need: "fishing", search_terms: ["fishing rod", "fishing rods"], categories: ["Sports & Outdoors"], extra: {}, keepa_by_day: null, shape: null });
    k.selections.length = 0; k.lookups.length = 0;
  });

  it("counts only the rods: the bath toy and the cat toy are left out, the rods ranked by monthly sold", async () => {
    const r = await checkNicheIncumbents("n1");
    expect(k.selections[0]).toMatchObject({ title: "fishing rod", rootCategory: [318949011] });
    expect(r.incumbents.map((x) => x.asin)).toEqual(["B0ROD00002", "B0ROD00001", "B0ROD00003"]);
    expect(r.incumbents[0]).toMatchObject({ monthlySold: 600, category: "Fishing Rods", reviews: 640 });
    expect(r).toMatchObject({ onNiche: 3, excludedCount: 2, rootCategories: ["Sports & Outdoors"], tokensUsed: 21 });
    expect(r.excluded.map((x) => [x.asin, x.why])).toEqual([["B0BATHTOY1", '"toy" in the title'], ["B0CATTOY01", '"toy" in the title']]);
    // One rod over 1,000 reviews: contested (with the toys counted it would read dominated).
    expect(r.shape).toBe("contested");
    expect(fake.tables.pl_niches[0]).toMatchObject({ shape: "contested", shape_rank: 1 });
  });

  it("a rerun reuses the finder's list and the fresh snapshots: no Keepa tokens", async () => {
    await checkNicheIncumbents("n1");
    expect(await nicheCheckPlan("n1", true)).toMatchObject({ reusing: true, estimate: 0 });
    const r = await checkNicheIncumbents("n1", true);
    expect(k.selections).toHaveLength(1);
    expect(k.lookups).toHaveLength(1);
    expect(r).toMatchObject({ reusedFinder: true, tokensUsed: 0, reused: 5, shape: "contested" });
  });
});
