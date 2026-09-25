/** The brand map: results re-gated on the default profile, cached per product, refreshed when behind. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMatch } from "../spapi/types";
import { brandDetail, brandSummaries, refreshBrandMap } from "./brandMap";
import { startCheck } from "./check";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { processRun } from "./process";

const cat = (asin: string, ean: string, brand: string): CatalogMatch => ({
  asin, eans: [ean], title: `${brand} item ${asin}`, brand, category: "DIY & Tools",
  dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, salesRank: 3000, parentAsin: null, variationCount: null,
  hazmat: [], batteries: false, imageUrl: null,
});
const CATALOG: Record<string, CatalogMatch> = {
  B0BRAND001: cat("B0BRAND001", "5012345678900", "Brite"),
  B0BRAND002: cat("B0BRAND002", "5012345678917", "Brite"),
  B0BRAND003: cat("B0BRAND003", "5012345678924", "Other Co"),
};

vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  return {
    ...real,
    getSpApi: () => ({
      async catalogByAsins(asins: string[]) { return new Map(asins.filter((a) => CATALOG[a]).map((a) => [a, CATALOG[a]])); },
      async lookupEans() { return { matches: new Map(), traces: new Map() }; },
      async getCompetitivePricing(asins: string[]) { return new Map(asins.map((a) => [a, { asin: a, buyBox: 20, newOffers: 4, salesRank: 3000 }])); },
      async getListingsRestrictions(asin: string) {
        return asin === "B0BRAND003"
          ? { asin, status: "approval_required", reasons: [{ code: "APPROVAL_REQUIRED", message: "You need approval to list this brand.", links: [{ resource: "https://sellercentral.amazon.co.uk/apply?asin=B0BRAND003", verb: "GET", title: "Apply", type: "text/html" }] }] }
          : { asin, status: "open", reasons: [] };
      },
      async getMyFeesEstimates(items: { asin: string }[]) { return items.map(({ asin }) => ({ asin, ok: false, referral: null, fba: null, total: null })); },
      async imagesByAsins(asins: string[]) { return new Map(asins.map((a) => [a, null])); },
    }),
  };
});
vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  return { ...real, getKeepa: () => new real.StubKeepaClient() };
});

describe("brand map", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    fake.tables.brand_products = [];
    fake.tables.brand_map_state = [{ id: 1, profile_version: null, refreshed_at: null, lease_until: null, remaining: 0 }];
  });

  it("builds per product on the default profile, then only refreshes what changed", async () => {
    const { runId } = await startCheck({ text: "B0BRAND001, 6\nB0BRAND002\nB0BRAND003, 5", supplier: "Henbrandt" });
    let guard = 0;
    while (!(await processRun(runId)).done) if (++guard > 20) throw new Error("never finished");

    expect(await refreshBrandMap()).toEqual({ refreshed: 3, remaining: 0 });
    expect(fake.tables.brand_products).toHaveLength(3);
    // Nothing changed: nothing to do.
    expect(await refreshBrandMap()).toEqual({ refreshed: 0, remaining: 0 });

    const brands = await brandSummaries();
    const brite = brands.find((b) => b.key === "brite")!;
    expect(brite).toMatchObject({ brand: "Brite", asins: 2, gating: "open", suppliers: [{ name: "Henbrandt", count: 2 }], avgBuyBox: 20 });
    expect(brite.medianMaxLanded).toBeGreaterThan(0);
    const other = brands.find((b) => b.key === "otherco")!;
    expect(other).toMatchObject({ gating: "approval_needed", applyUrl: "https://sellercentral.amazon.co.uk/apply?asin=B0BRAND003" });

    // Saving the default profile re-evaluates everything; a changed result re-evaluates that product.
    const def = fake.tables.profiles.find((p) => p.is_default)!;
    def.updated_at = new Date(Date.now() + 1000).toISOString();
    expect((await refreshBrandMap()).refreshed).toBe(3);
    fake.tables.results[0].updated_at = new Date(Date.now() + 5000).toISOString();
    expect((await refreshBrandMap()).refreshed).toBe(1);

    // A brand's products, with the best costed offer per EAN.
    const detail = (await brandDetail("brite"))!;
    expect(detail.products).toHaveLength(2);
    const costed = detail.products.find((p) => p.asin === "B0BRAND001")!;
    expect(costed.bestOffer).toMatchObject({ supplier: "Henbrandt" });
    expect(detail.products.find((p) => p.asin === "B0BRAND002")!.bestOffer).toBeNull(); // no cost given
  });

  it("one refresh at a time", async () => {
    fake.tables.brand_map_state[0].lease_until = new Date(Date.now() + 60_000).toISOString();
    expect(await refreshBrandMap()).toMatchObject({ busy: true, refreshed: 0 });
  });
});
