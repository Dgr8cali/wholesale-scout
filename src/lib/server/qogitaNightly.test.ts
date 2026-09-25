import { beforeEach, describe, expect, it, vi } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { duePresets, nightlyStep, nightlySummaries } from "./qogitaNightly";

vi.mock("./fx", () => ({ gbpRate: async () => ({ rate: 0.86, date: "2026-09-25", source: "test" }) }));
const qg = vi.hoisted(() => ({ products: [] as unknown[], fail: false }));
vi.mock("../qogita/client", async (orig) => {
  const real = await orig<typeof import("../qogita/client")>();
  return {
    ...real,
    getQogita: () => ({
      categories: async () => [],
      async *products() {
        if (qg.fail) throw new Error("Qogita login failed (401)");
        yield { count: qg.products.length, results: qg.products };
      },
    }),
  };
});

const product = (gtin: string, price: string) => ({
  availability: "in_stock", gtin, name: `P${gtin}`, brand: "Biodance", category: "Sheet Mask",
  productUrl: `https://www.qogita.com/products/${gtin.padStart(32, "a")}/p/`, price: { amount: price, currency: "EUR" }, unit: 1, inventory: 50, estimatedDeliveryTime: 1,
});

describe("nightly Qogita re-pull", () => {
  let fake: FakeDb;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake as never);
    qg.fail = false;
    fake.tables.profiles = [{ id: "p1", name: "Test order", is_default: true, config: {} }];
    fake.tables.qogita_presets = [
      { id: "a", name: "Masks", filters: { brands: ["Biodance"] }, profile_id: null, nightly: true, last_pulled_at: hoursAgo(30), last_prices: { "8809937361657": 8.53, "3337875597197": 12 } },
      { id: "b", name: "Fresh", filters: { brands: ["Nivea"] }, profile_id: null, nightly: true, last_pulled_at: hoursAgo(2), last_prices: {} },
      { id: "c", name: "Off", filters: { brands: ["Garnier"] }, profile_id: null, nightly: false, last_pulled_at: null, last_prices: {} },
    ];
  });

  it("is due only for nightly presets not pulled in the last 20 hours", async () => {
    expect((await duePresets()).map((p) => p.name)).toEqual(["Masks"]);
  });

  it("screens only new and re-priced EANs, then shows the new passes on Home", async () => {
    qg.products = [product("8809937361657", "8.53"), product("3337875597197", "11.50"), product("5000157024671", "3.00")];
    const step = await nightlyStep();
    expect(step).toMatchObject({ preset: "Masks", remaining: 0 });
    expect(step.result!.stats).toMatchObject({ kept: 3, screened: 2, new: 1, moved: 1, unchanged: 1 });
    const runId = step.result!.runId!;
    expect(fake.tables.runs.find((r) => r.id === runId)!.name).toMatch(/\(nightly\)$/);
    expect((await duePresets()).length).toBe(0);

    // Pretend screening finished with one pass.
    const rs = fake.tables.results.filter((r) => r.run_id === runId);
    Object.assign(rs[0], { status: "done", verdict: "pass" });
    Object.assign(rs[1], { status: "done", verdict: "fail" });
    const s = await nightlySummaries();
    expect(s).toEqual([expect.objectContaining({ preset: "Masks", runId, screened: 2, new: 1, moved: 1, unchanged: 1, passes: 1, stillScreening: false, error: null })]);
  });

  it("records a failed pull and moves on", async () => {
    qg.fail = true;
    const step = await nightlyStep();
    expect(step).toMatchObject({ preset: "Masks", error: expect.stringMatching(/login failed/) });
    expect(fake.tables.qogita_pulls).toEqual([expect.objectContaining({ preset_id: "a", kind: "nightly", error: expect.stringMatching(/login failed/) })]);
    expect((await duePresets()).length).toBe(0);
    expect((await nightlySummaries())[0]).toMatchObject({ preset: "Masks", error: expect.stringMatching(/login failed/), runId: null });
  });
});
