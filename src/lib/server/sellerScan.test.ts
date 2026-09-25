/** Seller scans: storefront (cached 7 days) → a no-cost run → rows marked with the Buy Box holder. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMatch, ListingOffers } from "../spapi/types";
import type { Storefront } from "../keepa/types";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { processRun } from "./process";
import { scanPreview, startScan, STOREFRONT_TTL_MS } from "./sellerScan";

const SELLER = "A30PLPOC3L6XYK";
const ASINS = ["B0SCAN0001", "B0SCAN0002", "B0SCAN0003"];
const calls = { storefront: 0, catalogByAsins: 0, lookupEans: 0, offers: 0 };
const keepa = { available: true };

const cat = (asin: string, ean: string): CatalogMatch => ({
  asin, eans: [ean], title: `Item ${asin}`, brand: "Emper", category: "DIY & Tools",
  dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, salesRank: 3000, parentAsin: null, variationCount: null,
  hazmat: [], batteries: false, imageUrl: null,
});

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const stub = new real.StubKeepaClient();
  return {
    ...real,
    getKeepa: () => Object.assign(Object.create(stub), {
      get available() { return keepa.available; },
      async storefront(id: string): Promise<Storefront> {
        calls.storefront++;
        return {
          profile: { sellerId: id, name: "Lauren Jay", ratingPct: 76, ratingCount: 50, storefrontSize: 3, brands: [{ brand: "Emper", count: 3 }] },
          businessName: "LAUREN JAY PARIS LTD", buyBoxOwnershipPct: 87, asins: ASINS, tokensUsed: 10,
        };
      },
      async tokenStatus() { return { tokensLeft: 500, refillInMs: 60_000, refillRate: 5 }; },
    }),
  };
});

vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  return {
    ...real,
    getSpApi: () => ({
      async catalogByAsins(asins: string[]) { calls.catalogByAsins++; return new Map(asins.map((a, i) => [a, cat(a, `501234567890${i}`)])); },
      async lookupEans() { calls.lookupEans++; return { matches: new Map(), traces: new Map() }; },
      async getCompetitivePricing(asins: string[]) { return new Map(asins.map((a) => [a, { asin: a, buyBox: 20, newOffers: 3, salesRank: 3000 }])); },
      async getItemOffersBatch(asins: string[]) {
        calls.offers++;
        // The scanned seller wins the first two; someone else the third.
        return new Map<string, ListingOffers>(asins.map((a) => [a, { asin: a, amazon: false, fbaOffers: 3, totalOffers: 3, buyBox: 20, buyBoxSellerId: a === "B0SCAN0003" ? "AOTHER00001" : SELLER }]));
      },
      async getListingsRestrictions(asin: string) { return { asin, status: "open", reasons: [] }; },
      async getMyFeesEstimates(items: { asin: string }[]) { return items.map(({ asin }) => ({ asin, ok: false, referral: null, fba: null, total: null })); },
      async imagesByAsins(asins: string[]) { return new Map(asins.map((a) => [a, null])); },
    }),
  };
});

describe("seller scan", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    Object.assign(calls, { storefront: 0, catalogByAsins: 0, lookupEans: 0, offers: 0 });
    keepa.available = true;
    fake.tables.keepa_sellers = [];
  });

  it("asks before spending: a preview without lookup uses only a cached storefront", async () => {
    expect(await scanPreview(SELLER, { lookup: false })).toBeNull();
    expect(calls.storefront).toBe(0);
    const p = (await scanPreview(SELLER, { lookup: true }))!;
    expect(p).toMatchObject({ cached: false, asins: { total: 3, scanned: 3, more: 0 }, tokens: { storefront: 10, history: 3, buyBoxEach: 3, fresh: 0 }, tokensLeft: 500 });
    expect(p.seller).toMatchObject({ name: "Lauren Jay", ratingPct: 76, buyBoxOwnershipPct: 87, brands: [{ brand: "Emper", count: 3 }] });
    // Cached for 7 days: free, without asking Keepa again.
    expect((await scanPreview(SELLER, { lookup: false }))!.cached).toBe(true);
    expect(calls.storefront).toBe(1);
    // Older than 7 days: looked up again.
    fake.tables.keepa_sellers[0].storefront_fetched_at = new Date(Date.now() - STOREFRONT_TTL_MS - 60_000).toISOString();
    expect(await scanPreview(SELLER, { lookup: false })).toBeNull();
  });

  it("screens the storefront with no cost and marks where the seller holds the Buy Box", async () => {
    await scanPreview(SELLER, { lookup: true });
    const { runId, asins, more } = await startScan(SELLER);
    expect({ asins, more }).toEqual({ asins: 3, more: 0 });
    expect(calls.storefront).toBe(1); // the cached list, not a second lookup
    const run = fake.tables.runs.find((r) => r.id === runId)!;
    expect(run).toMatchObject({ name: "Seller scan · Lauren Jay", token_cost: 10 }); // the storefront's tokens are on the run
    expect(fake.tables.keepa_sellers[0]).toMatchObject({ last_scan_run_id: runId, storefront_unbilled_tokens: 0 });

    keepa.available = false; // screen on SP-API only
    let guard = 0;
    while (!(await processRun(runId)).done) if (++guard > 20) throw new Error("never finished");
    expect(calls.lookupEans).toBe(0);
    expect(calls.catalogByAsins).toBeGreaterThan(0);

    const results = fake.tables.results.filter((r) => r.run_id === runId);
    expect(results).toHaveLength(3);
    const productOf = (r: Record<string, unknown>) => fake.tables.products.find((p) => p.id === r.product_id)!;
    // ASIN-only products took the listing's EAN once the catalog was read.
    expect(results.map((r) => productOf(r).ean).sort()).toEqual(["5012345678900", "5012345678901", "5012345678902"]);
    const holder = (a: string) => (results.find((r) => productOf(r).asin === a)!.inputs as { market: { buyBoxSellerId: string } }).market.buyBoxSellerId;
    expect([holder("B0SCAN0001"), holder("B0SCAN0002"), holder("B0SCAN0003")]).toEqual([SELLER, SELLER, "AOTHER00001"]);
    for (const r of results) {
      expect(r.landed_cost).toBeNull();
      // Every row with a sell price says the most it can cost landed, whatever its verdict.
      expect((r.inputs as { maxLandedGbp: number }).maxLandedGbp).toBeGreaterThan(0);
      expect((r.gate_outcomes as { gate: string; status: string }[]).find((g) => g.gate === "fees")?.status ?? "skipped").toBe("skipped");
    }
  });
});
