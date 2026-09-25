/** Hunt: the Product Finder's ASINs become a no-cost run, with the finder's tokens on it. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shapeFromProfile } from "../hunt";
import { defaultProfiles } from "../screening/config";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { startHunt } from "./hunt";

const seen: { selection?: Record<string, unknown> } = {};
let asins = ["B0HUNT0001", "B0HUNT0002", "B0HUNT0001"];

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const stub = new real.StubKeepaClient();
  return {
    ...real,
    getKeepa: () => Object.assign(Object.create(stub), {
      available: true,
      async productFinder(selection: Record<string, unknown>) { seen.selection = selection; return { asins, total: 812, tokensUsed: 11, tokensLeft: 900 }; },
      async rootCategories() { return { categories: [], tokensUsed: 1 }; },
      async tokenStatus() { return { tokensLeft: 900, refillInMs: 60_000, refillRate: 20 }; },
    }),
  };
});

describe("hunt", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    await ensureSeed();
    asins = ["B0HUNT0001", "B0HUNT0002", "B0HUNT0001"];
  });
  const shape = shapeFromProfile(defaultProfiles()[0].config, { id: 117332031, name: "Beauty" });

  it("screens what the finder found as a run with no cost, the finder's tokens on it", async () => {
    const r = await startHunt(shape);
    expect(r).toMatchObject({ total: 812, taken: 2, tokensUsed: 11 });
    expect(seen.selection).toMatchObject({ rootCategory: [117332031], avg90_SALES_lte: 60_000 });
    const run = fake.tables.runs.find((x) => x.id === r.runId)!;
    expect(run).toMatchObject({ name: "Hunt · Beauty · £12–35 · 2–8 sellers · rank ≤ 60,000 · no Amazon", token_cost: 11 });
    expect((run.stats as { hunt: { total: number; finderTokens: number } }).hunt).toMatchObject({ total: 812, taken: 2, finderTokens: 11 });
    const offers = fake.tables.offers.filter((o) => fake.tables.results.some((x) => x.run_id === r.runId && x.offer_id === o.id));
    expect(offers).toHaveLength(2);
    expect(offers.every((o) => o.cost_known === false)).toBe(true);
  });

  it("no matches: no run", async () => {
    asins = [];
    expect(await startHunt(shape)).toMatchObject({ runId: null, taken: 0, total: 812 });
    expect(fake.tables.runs ?? []).toHaveLength(0);
  });
});
