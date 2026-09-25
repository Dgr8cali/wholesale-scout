/**
 * The Keepa path end to end: fetch → snapshot stored before gating → gates read it →
 * the run's token total is Keepa's own figure → no re-fetch inside 24 hours.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMapping, headerFingerprint, type Cell } from "../ingest/mapping";
import type { KeepaProduct, KeepaSummary, OnKeepaResponse } from "../keepa/types";
import type { CatalogMatch } from "../spapi/types";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { ingest } from "./ingest";
import { processRun, rescreenRun } from "./process";

const k = vi.hoisted(() => ({ live: true, asinCalls: [] as string[][], codeCalls: [] as string[][] }));

const summary = (over: Partial<KeepaSummary> = {}): KeepaSummary => ({
  historyDays: 1200, rankNow: 5568, rankDrops30d: 68, monthlySold: 300, avgRank90d: 6562, rankTrendPct12m: -5,
  currentBuyBox: 23.55, medianBuyBox12m: 22.9, bbSlopePctYr: 2, bbVolatilityPct: 8, offersNow: 5, offers90dAgo: 5,
  fbaOffers: 4, amazonLastSeenDays: null, topSellerBbSharePct: 35, reviewJumpPct: 2, youngerThanParent: null, ...over,
});
const product = (asin: string, s: KeepaSummary): KeepaProduct => ({
  asin, eans: [], title: null, brand: null, category: null, dimsCm: null, weightG: null, parentAsin: null, variationCount: null,
  summary: s, series: { rank: [[Date.now() - 86_400_000, 5000]], buyBox: [], newPrice: [], offerCount: [], amazon: [], reviewCount: [] },
});

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  const fake = {
    name: "fake-keepa",
    get available() { return k.live; },
    async lookupByAsins(asins: string[], onResponse?: OnKeepaResponse) {
      k.asinCalls.push(asins);
      await onResponse?.({ kind: "asin", count: asins.length, status: 200, tokensConsumed: 3 * asins.length, tokensLeft: 279, refillInMs: 7000, processingTimeInMs: 400, products: asins.length });
      return { byEan: new Map(), byAsin: new Map(asins.map((a) => [a, product(a, summary())])), tokensUsed: 3 * asins.length, tokensLeft: 279, requests: [] };
    },
    async lookupByEans(eans: string[]) {
      k.codeCalls.push(eans);
      return { byEan: new Map(), byAsin: new Map(), tokensUsed: 0, tokensLeft: null, requests: [] };
    },
  };
  return { ...real, getKeepa: () => (k.live ? fake : new real.StubKeepaClient()) };
});

const cat = (asin: string, ean: string, title: string): CatalogMatch => ({
  asin, eans: [ean], title, brand: "Bioderma", category: "Beauty", dimsCm: { l: 15, w: 8, h: 6 }, weightG: 300,
  salesRank: 9000, parentAsin: null, variationCount: null, hazmat: [], batteries: false,
});
vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  const catalog = (): Record<string, CatalogMatch[]> => ({
    "3401399277092": [cat("B0060OMXUA", "3401399277092", "Bioderma Sebium Purifying Cleansing Foaming Gel 500ml")],
    "3701129812105": [cat("B002XZLAWM", "3701129812105", "Bioderma Sensibio H2O Micellar Water 500ml")],
  });
  return {
    ...real,
    getSpApi: () => ({
      async lookupEans(eans: string[]) {
        const CATALOG = catalog();
        return {
          matches: new Map(eans.filter((e) => CATALOG[e]).map((e) => [e, CATALOG[e]])),
          traces: new Map(eans.map((e) => [e, { outcome: "matched", attempts: [] }])),
        };
      },
      async getCompetitivePricing(asins: string[]) {
        return new Map(asins.map((a) => [a, { asin: a, buyBox: 23.55, newOffers: 7, salesRank: 9000 }]));
      },
      async getListingsRestrictions(asin: string) {
        return { asin, status: "open", reasons: [] };
      },
      async getMyFeesEstimates(items: { asin: string; price: number }[]) {
        return items.map(({ asin }) => ({ asin, ok: true, referral: 3.5, fba: 2.9, total: 6.4 }));
      },
    }),
  };
});

function upload() {
  const sheet: Cell[][] = [
    ["EAN", "Name", "Brand", "Price", "MOQ"],
    ["3401399277092", "Bioderma Sébium Purifying and Foaming Cleansing Gel 500 ml", "Bioderma", "6.00", 6],
    ["3701129812105", "Bioderma Sensibio H2o 500ml Micellar Water", "Bioderma", "5.50", 6],
  ];
  const supplier = { name: "Pharmazon", vatBasis: "ex_vat" as const, vatRate: 20, currency: "GBP" };
  const mapping = { headerRow: 0, columns: { ean: "EAN", title: "Name", brand: "Brand", unitPrice: "Price", moq: "MOQ" }, pricePer: "unit" as const };
  const fx = { rate: 1, date: "2026-09-25" };
  return { fileName: "pharmazon.xlsx", supplier, headers: sheet[0] as string[], fingerprint: headerFingerprint(sheet[0]), mapping, fx, rows: applyMapping(sheet, mapping, supplier, fx).rows };
}

describe("Keepa path", () => {
  let fake: FakeDb;
  const results = (runId: string) => fake.tables.results.filter((r) => r.run_id === runId);
  const tokens = (runId: string) => fake.tables.runs.find((r) => r.id === runId)!.token_cost;
  const gate = (r: Record<string, unknown>, g: string) => (r.gate_outcomes as { gate: string; status: string; detail: string }[]).find((o) => o.gate === g);
  const until = async (runId: string) => {
    for (let i = 0; i < 20; i++) if ((await processRun(runId)).done) return;
    throw new Error("run never finished");
  };

  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    k.live = true;
    k.asinCalls.length = 0;
    k.codeCalls.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores snapshots before gating, gates read them, and the run records Keepa's tokens", async () => {
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);

    expect(k.asinCalls).toEqual([["B0060OMXUA", "B002XZLAWM"]]);
    expect(k.codeCalls).toEqual([]); // the catalog resolved both EANs
    expect(fake.tables.keepa_snapshots.map((x) => x.asin).sort()).toEqual(["B002XZLAWM", "B0060OMXUA"]);
    expect(tokens(runId)).toBe(6);

    for (const r of results(runId)) {
      expect((r.inputs as { market: { hasHistory: boolean; monthlySold: number } }).market).toMatchObject({ hasHistory: true, monthlySold: 300 });
      for (const g of ["mirage", "amazonPresence", "priceRegime", "priceDrift"]) expect(gate(r, g)?.status, g).not.toBe("skipped");
      expect(gate(r, "demand")!.detail).toMatch(/68 drops\/30d, avg rank 6,562/);
      expect(r.why).not.toMatch(/No Keepa history/);
    }
    expect(fake.tables.products.every((p) => p.keepa_updated_at)).toBe(true);
  });

  it("never re-fetches a snapshot under 24 hours old", async () => {
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    await rescreenRun(runId);
    await until(runId);
    const second = await ingest({ files: [upload()] });
    await until(second.runId);
    expect(k.asinCalls).toHaveLength(1);
    expect(tokens(runId)).toBe(6);
    expect(tokens(second.runId)).toBe(0);
    expect(results(second.runId).every((r) => (r.inputs as { market: { hasHistory: boolean } }).market.hasHistory)).toBe(true);
  });

  it("Re-screen fetches history once for rows screened while Keepa was a stub", async () => {
    k.live = false;
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    expect(results(runId).every((r) => gate(r, "mirage")?.status === "skipped")).toBe(true);

    k.live = true;
    const r1 = await rescreenRun(runId);
    expect(r1.requeued).toBe(2);
    await until(runId);
    expect(k.asinCalls).toEqual([["B0060OMXUA", "B002XZLAWM"]]);
    expect(tokens(runId)).toBe(6);
    expect(results(runId).every((r) => gate(r, "mirage")?.status === "pass")).toBe(true);

    const r2 = await rescreenRun(runId);
    expect(r2.requeued).toBe(0);
    expect(k.asinCalls).toHaveLength(1);
  });

  it("uses fetched history even if storing the snapshot fails, and says so", async () => {
    fake.failInserts.add("keepa_snapshots");
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    expect(tokens(runId)).toBe(6);
    const r = results(runId)[0];
    expect((r.inputs as { market: { hasHistory: boolean } }).market.hasHistory).toBe(true);
    expect(r.why).toMatch(/Keepa snapshot not stored: request entity too large/);
  });
});
