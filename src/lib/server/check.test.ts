/** ASIN checks end to end: pasted lines → a run through the normal pipeline → the verdict card. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogMatch } from "../spapi/types";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { startCheck, verdictCard } from "./check";
import { processRun } from "./process";

const cat = (asin: string, over: Partial<CatalogMatch> = {}): CatalogMatch => ({
  asin, eans: ["5012345678900"], title: `Item ${asin}`, brand: "Brand", category: "DIY & Tools",
  dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, salesRank: 3000, parentAsin: null, variationCount: null,
  hazmat: [], batteries: false, imageUrl: null, pack: { itemPackageQuantity: 1, numberOfItems: 1 }, dg: { hazmat: null, ghs: [], declared: [], heatSensitive: false }, ...over,
});
const CATALOG: Record<string, CatalogMatch> = {
  B0CHECK001: cat("B0CHECK001"),
  B0CHECK002: cat("B0CHECK002", { eans: ["5012345678917"], title: "Brite Scouring Pads (Pack of 3)" }),
};
const calls = { lookupEans: 0 };

vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  return {
    ...real,
    getSpApi: () => ({
      async catalogByAsins(asins: string[]) { return new Map(asins.filter((a) => CATALOG[a]).map((a) => [a, CATALOG[a]])); },
      async lookupEans() { calls.lookupEans++; return { matches: new Map(), traces: new Map() }; },
      async getCompetitivePricing(asins: string[]) { return new Map(asins.map((a) => [a, { asin: a, buyBox: 20, newOffers: 4, salesRank: 3000 }])); },
      async getListingsRestrictions(asin: string) {
        return { asin, status: "approval_required", reasons: [{ code: "APPROVAL_REQUIRED", message: "You need approval to list this brand.", links: [{ resource: `https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=${asin}`, verb: "GET", title: "Request Approval", type: "text/html" }] }] };
      },
      async getMyFeesEstimates(items: { asin: string }[]) { return items.map(({ asin }) => ({ asin, ok: false, referral: null, fba: null, total: null, error: "no estimate" })); },
      async imagesByAsins(asins: string[]) { return new Map(asins.map((a) => [a, null])); },
    }),
  };
});
vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  return { ...real, getKeepa: () => new real.StubKeepaClient() };
});

describe("ASIN check", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    calls.lookupEans = 0;
  });

  const finish = async (runId: string) => {
    let guard = 0;
    while (!(await processRun(runId)).done) if (++guard > 20) throw new Error("never finished");
  };

  it("screens an ASIN with no cost: fees shown, fee gate skipped, hurdle as a landed cost", async () => {
    const { runId, lines, errors } = await startCheck({ text: "https://www.amazon.co.uk/dp/B0CHECK001/ref=x\nB0NOTREAL1" });
    expect(lines).toBe(1);
    expect(errors).toEqual(["line 2: B0NOTREAL1 isn't on Amazon UK"]);
    const run = fake.tables.runs.find((r) => r.id === runId)!;
    expect(run).toMatchObject({ name: "ASIN check · B0CHECK001" });
    expect((run.stats as { check: unknown }).check).toMatchObject({ supplier: "Manual", codes: ["B0CHECK001"] });
    expect(fake.tables.suppliers.map((s) => s.name)).toEqual(["Manual"]);
    expect(fake.tables.products.find((p) => p.asin === "B0CHECK001")).toMatchObject({ ean: "5012345678900", title: "Item B0CHECK001" });

    await finish(runId);
    expect(calls.lookupEans).toBe(0); // matched from the start
    const card = (await verdictCard(runId))!;
    expect(card).toMatchObject({ asin: "B0CHECK001", costKnown: false, landed: null, profit: null, sellPrice: 20, pending: false });
    expect(card.hurdle.kind).toBe("landed");
    expect(card.hurdle.value).toBeGreaterThan(0);
    expect(card.hurdle.value).toBeLessThan(20);
    expect(card.fees?.fba).toBeGreaterThan(0);
    expect(card.gates.find((g) => g.gate === "fees")).toMatchObject({ status: "skipped", detail: expect.stringMatching(/^No cost given: clears the floors at £\d+\.\d\d landed or less/) });
    expect(card.gates.find((g) => g.gate === "budgetFit")).toMatchObject({ status: "skipped" });
    expect(card.gating).toMatchObject({ status: "approval_required", applyUrl: expect.stringContaining("asin=B0CHECK001") });
    expect(card.verdict).not.toBe("fail");
  });

  it("takes a landed cost per line and screens it at that cost, under the named supplier", async () => {
    const { runId } = await startCheck({ text: "B0CHECK001, £9.50\nB0CHECK002 6", supplier: "Henbrandt" });
    await finish(runId);
    const results = fake.tables.results.filter((r) => r.run_id === runId);
    expect(results).toHaveLength(2);
    const byAsin = (a: string) => results.find((r) => fake.tables.products.find((p) => p.id === r.product_id)!.asin === a)!;
    // The landed cost typed in is the landed cost screened.
    expect(Number(byAsin("B0CHECK001").landed_cost)).toBeCloseTo(9.5, 2);
    // A multipack ASIN's cost is for the listing as sold: not scaled again.
    expect(Number(byAsin("B0CHECK002").landed_cost)).toBeCloseTo(6, 2);
    expect(byAsin("B0CHECK002").why).not.toContain("Listing is a");
    expect(fake.tables.suppliers.map((s) => s.name)).toEqual(["Henbrandt"]);
  });

  it("refuses a cost that doesn't cover inbound and prep", async () => {
    const r = await startCheck({ text: "B0CHECK001, 9\nB0CHECK002, 0.10" });
    expect(r.lines).toBe(1);
    expect(r.errors[0]).toMatch(/^line 2: £0\.10 landed doesn't cover inbound and prep/);
  });
});
