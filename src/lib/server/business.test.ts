/** Settings → Business: the VAT basis kept in every profile, loadProfile following it, Recalculate all. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __setDbForTests, loadProfile } from "./db";
import { FakeDb } from "./fakeDb";
import { businessSettings, saveBusinessSettings } from "./business";

const kicked = vi.hoisted(() => ({ runs: [] as string[] }));
vi.mock("./kick", async (orig) => ({ ...(await orig<typeof import("./kick")>()), scheduleRescreen: (_o: string, id: string) => { kicked.runs.push(id); }, scheduleCall: () => {} }));

describe("business settings", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    kicked.runs.length = 0;
    fake.tables.profiles = [
      { id: "p1", name: "Strict", is_default: true, config: { fees: { vatRegistered: false, vatRatePct: 20 } } },
      { id: "p2", name: "Loose", is_default: false, config: { fees: { vatRegistered: false, vatRatePct: 20 } } },
    ];
  });

  it("defaults to VAT registered at 20% and the UK Qogita account", async () => {
    expect(await businessSettings()).toEqual({ vatRegistered: true, vatRate: 20, qogitaRegion: "UK", priceBasis: "lower90" });
  });

  it("a change of VAT basis is written into every profile, and loadProfile follows the business", async () => {
    const r = await saveBusinessSettings({ vatRegistered: true, vatRate: 20 });
    // Same as the defaults: nothing to write.
    expect(r.profilesUpdated).toBe(0);
    fake.tables.business_settings = [{ key: "vatRegistered", value: false }, { key: "vatRate", value: 20 }, { key: "qogitaRegion", value: "UK" }];
    const on = await saveBusinessSettings({ vatRegistered: true });
    expect(on).toMatchObject({ settings: { vatRegistered: true, vatRate: 20 }, profilesUpdated: 2 });
    expect(fake.tables.profiles.every((p) => (p.config as { fees: { vatRegistered: boolean } }).fees.vatRegistered)).toBe(true);
    // A profile saved on the old basis still loads on the business's.
    (fake.tables.profiles[0].config as { fees: { vatRegistered: boolean } }).fees.vatRegistered = false;
    expect((await loadProfile("p1")).config.fees.vatRegistered).toBe(true);
    expect((await saveBusinessSettings({ qogitaRegion: "EU", vatRate: 999 })).settings).toEqual({ vatRegistered: true, vatRate: 20, qogitaRegion: "EU", priceBasis: "lower90" });
    // A new price basis is written into every profile too, and loadProfile follows it.
    expect(await saveBusinessSettings({ priceBasis: "current" })).toMatchObject({ settings: { priceBasis: "current" }, profilesUpdated: 2 });
    expect(fake.tables.profiles.every((p) => (p.config as { scoringPrice: string }).scoringPrice === "current")).toBe(true);
    (fake.tables.profiles[0].config as { scoringPrice: string }).scoringPrice = "lower90";
    fake.tables.business_settings.push({ key: "priceBasis", value: "current" });
    expect((await loadProfile("p1")).config.scoringPrice).toBe("current");
  });

  it("Recalculate all: every finished run re-screened from stored data, the biggest profit changes reported", async () => {
    const { recalcStatus, startRecalc } = await import("./recalc");
    fake.tables.runs = [
      { id: "r1", profile_id: "p1", status: "done", archived_at: null, paused_at: null, stats: {} },
      { id: "r2", profile_id: "p1", status: "done", archived_at: "2026-01-01", paused_at: null, stats: {} },
    ];
    fake.tables.products = [{ id: "pr1", asin: "B0WIPES001", title: "Lens wipes" }];
    fake.tables.results = [{ id: "res1", run_id: "r1", product_id: "pr1", profit: 2.5 }, { id: "res2", run_id: "r1", product_id: "pr1", profit: 1 }];
    const s = await startRecalc("http://x");
    expect(s).toMatchObject({ runs: 1, results: 2, basis: "VAT registered at 20%" });
    expect(kicked.runs).toEqual(["r1"]);
    expect(await recalcStatus(s.jobId)).toMatchObject({ pending: 1, done: false });
    // The re-screen finishes, the profits change.
    fake.tables.runs[0].stats = { rescreen: { startedAt: new Date(Date.now() + 1000).toISOString(), finishedAt: new Date(Date.now() + 2000).toISOString() } };
    fake.tables.results[0].profit = 3.06;
    const done = await recalcStatus(s.jobId);
    expect(done).toMatchObject({ pending: 0, done: true, changed: 1 });
    expect(done.top).toEqual([{ id: "res1", runId: "r1", asin: "B0WIPES001", title: "Lens wipes", before: 2.5, after: 3.06, change: 0.56 }]);
  });
});
