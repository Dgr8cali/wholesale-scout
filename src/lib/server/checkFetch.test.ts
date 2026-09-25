/** A check that fails before any API call: free SP-API data on the card, and "Fetch anyway". */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMatch } from "../spapi/types";
import { fetchAnyway, startCheck, verdictCard } from "./check";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { processRun } from "./process";

const calls = { keepa: 0, offers: 0 };
const cat: CatalogMatch = {
  asin: "B0AERO0001", eans: ["5012345678900"], title: "Brite Dry Shampoo Aerosol 200ml", brand: "Brite", category: "Beauty",
  dimsCm: { l: 15, w: 5, h: 5 }, weightG: 200, salesRank: 3000, parentAsin: null, variationCount: null, hazmat: [], batteries: false, imageUrl: null,
};

vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  return {
    ...real,
    getSpApi: () => ({
      async catalogByAsins() { return new Map([[cat.asin, cat]]); },
      async lookupEans() { return { matches: new Map(), traces: new Map() }; },
      async getCompetitivePricing(asins: string[]) { return new Map(asins.map((a) => [a, { asin: a, buyBox: 12.5, newOffers: 5, salesRank: 3000 }])); },
      async getItemOffersBatch(asins: string[]) { calls.offers++; return new Map(asins.map((a) => [a, { asin: a, amazon: true, fbaOffers: 4, totalOffers: 5, buyBox: 12.5, buyBoxSellerId: "AOTHER" }])); },
      async getListingsRestrictions(asin: string) { return { asin, status: "open", reasons: [] }; },
      async getMyFeesEstimates(items: { asin: string }[]) { return items.map(({ asin }) => ({ asin, ok: false, referral: null, fba: null, total: null })); },
      async imagesByAsins(asins: string[]) { return new Map(asins.map((a) => [a, null])); },
    }),
  };
});
vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const empty = { byEan: new Map(), byAsin: new Map(), tokensUsed: 0, tokensLeft: 100, requests: [] };
  return {
    ...real,
    getKeepa: () => ({
      available: true, name: "fake",
      async lookupByAsins() { calls.keepa++; return empty; },
      async lookupByEans() { return empty; },
      async lookupSellers() { return { profiles: new Map(), tokensUsed: 0 }; },
      async tokenStatus() { return { tokensLeft: 100, refillInMs: 60_000, refillRate: 5 }; },
    }),
  };
});

describe("a check that fails before any API call", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    Object.assign(calls, { keepa: 0, offers: 0 });
  });
  const finish = async (runId: string) => {
    let guard = 0;
    // Keepa having nothing for the ASIN mustn't send the row round again.
    while (!(await processRun(runId, { budgetMs: 3000 })).done) if (++guard > 5) throw new Error("never finished");
  };

  it("shows the free SP-API data, marks Keepa not fetched, and fetches anyway on request", async () => {
    const strict = fake.tables.profiles.find((p) => p.name === "Strict")!;
    const { runId } = await startCheck({ text: "B0AERO0001", profileId: strict.id as string });
    await finish(runId);
    const row = fake.tables.results.find((r) => r.run_id === runId)!;
    expect(row).toMatchObject({ verdict: "fail", failed_gate: "compliance" });
    expect(calls.keepa).toBe(0);

    const card = (await verdictCard(runId))!;
    expect(card).toMatchObject({ failedGate: "compliance", buyBox: 12.5, sellers: 3, amazon: { sellingNow: true }, salesPerMonth: null });
    expect(card.notFetched).toMatchObject({ gate: "compliance" });
    // The free data is kept on the row.
    expect((row.inputs as { market: { currentBuyBox: number } }).market.currentBuyBox).toBe(12.5);

    await fetchAnyway(runId);
    await finish(runId);
    expect(calls.keepa).toBeGreaterThan(0); // Keepa was asked this time
    const again = (await verdictCard(runId))!;
    expect(again).toMatchObject({ verdict: "fail", failedGate: "compliance", notFetched: null });
  });
});
