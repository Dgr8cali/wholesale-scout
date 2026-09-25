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
import { ukDay } from "../keepaLedger";

const k = vi.hoisted(() => ({
  live: true, asinCalls: [] as string[][], codeCalls: [] as string[][], sellerCalls: [] as string[][],
  tokens: { tokensLeft: 1000, refillInMs: 60_000, refillRate: 21 },
}));

const summary = (over: Partial<KeepaSummary> = {}): KeepaSummary => ({
  historyDays: 1200, rankNow: 5568, rankDrops30d: 68, monthlySold: 300, avgRank90d: 6562, rankTrendPct12m: -5,
  currentBuyBox: 23.55, medianBuyBox12m: 22.9, bbSlopePctYr: 2, bbVolatilityPct: 8, offersNow: 5, offers90dAgo: 5,
  fbaOffers: 4, amazonLastSeenDays: null, topSellerBbSharePct: 35, reviewJumpPct: 2, youngerThanParent: null,
  keepaRankDrops30: 70, fbaFee: 3.09, referralFeePct: 15, packageDims: { l: 21.2, w: 7.1, h: 7 }, packageWeightG: 570, variationCount: 4,
  topSellers: [{ sellerId: "S1", sharePct: 35 }, { sellerId: "S2", sharePct: 30 }, { sellerId: "S3", sharePct: 20 }], ...over,
});
const product = (asin: string, s: KeepaSummary): KeepaProduct => ({
  asin, eans: [], title: null, brand: null, category: null, dimsCm: null, weightG: null, parentAsin: null, variationCount: null, imageUrl: null,
  summary: s, buyBoxSellers: [], series: { rank: [[Date.now() - 86_400_000, 5000]], buyBox: [], newPrice: [], offerCount: [], amazon: [], reviewCount: [] },
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
    async tokenStatus() {
      return { ...k.tokens };
    },
    async lookupSellers(ids: string[], onResponse?: OnKeepaResponse) {
      k.sellerCalls.push(ids);
      await onResponse?.({ kind: "seller", count: ids.length, status: 200, tokensConsumed: ids.length, tokensLeft: 270, refillInMs: 7000, processingTimeInMs: 100, products: ids.length });
      const profiles: Record<string, object> = {
        S1: { sellerId: "S1", name: "Pierre Fabre UK", ratingPct: 99, ratingCount: 5000, storefrontSize: 400, brands: [{ brand: "bioderma", count: 312 }] },
        S2: { sellerId: "S2", name: "Cosmeco", ratingPct: 98, ratingCount: 1289, storefrontSize: 766, brands: [{ brand: "bioderma", count: 110 }] },
        S3: { sellerId: "S3", name: "Small shop", ratingPct: 90, ratingCount: 40, storefrontSize: 30, brands: [] },
      };
      return { profiles: new Map(ids.map((id) => [id, profiles[id]])), tokensUsed: ids.length };
    },
  };
  return { ...real, getKeepa: () => (k.live ? fake : new real.StubKeepaClient()) };
});

const cat = (asin: string, ean: string, title: string): CatalogMatch => ({
  asin, eans: [ean], title, brand: "Bioderma", category: "Beauty", dimsCm: { l: 15, w: 8, h: 6 }, weightG: 300,
  salesRank: 9000, parentAsin: null, variationCount: null, hazmat: [], batteries: false, imageUrl: `https://m.media-amazon.com/images/I/${asin}.jpg`,
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
    k.sellerCalls.length = 0;
    k.tokens = { tokensLeft: 1000, refillInMs: 60_000, refillRate: 21 };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("stores snapshots before gating, gates read them, and the run records Keepa's tokens", async () => {
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);

    expect(k.asinCalls).toEqual([["B0060OMXUA", "B002XZLAWM"]]);
    expect(k.codeCalls).toEqual([]); // the catalog resolved both EANs
    expect(fake.tables.keepa_snapshots.map((x) => x.asin).sort()).toEqual(["B002XZLAWM", "B0060OMXUA"]);
    expect(fake.tables.keepa_snapshots[0]).toMatchObject({ monthly_sold: 300, keepa_rank_drops_30d: 70, fba_fee: 3.09, referral_fee_pct: 15, variation_count: null });
    expect(tokens(runId)).toBe(6 + 3); // 3 per ASIN, then 1 per seller (the same three sellers for both rows)

    for (const r of results(runId)) {
      expect((r.inputs as { market: { hasHistory: boolean; monthlySold: number } }).market).toMatchObject({ hasHistory: true, monthlySold: 300 });
      for (const g of ["mirage", "amazonPresence", "priceRegime", "priceDrift"]) expect(gate(r, g)?.status, g).not.toBe("skipped");
      expect(gate(r, "demand")!.detail).toMatch(/300 sales\/mo, your share 60\/mo, avg rank 6,562/);
      expect(r.why).not.toMatch(/No Keepa history/);
    }
    expect(fake.tables.products.every((p) => p.keepa_updated_at)).toBe(true);
  });

  it("compares fees by source, profiles top sellers once, and flags a likely distributor", async () => {
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    const r = results(runId)[0];
    const fees = r.fees as { compare: { amazon: object; keepa: { fba: number; referral: number }; rateCard: { fba: number } } };
    expect(fees.compare.amazon).toEqual({ referral: 3.5, fba: 2.9 });
    expect(fees.compare.keepa.fba).toBe(3.09);
    expect(fees.compare.keepa.referral).toBe(3.44); // 15% of £22.90, to the penny
    expect(fees.compare.rateCard.fba).toBeGreaterThan(0);

    expect(k.sellerCalls).toEqual([["S1", "S2", "S3"]]);
    const sellers = (r.inputs as { sellers: { sellerId: string; brandSharePct: number }[] }).sellers;
    expect(sellers.map((x) => [x.sellerId, x.brandSharePct])).toEqual([["S1", 78], ["S2", 14.4], ["S3", null]]);
    expect(gate(r, "competition")).toMatchObject({ status: "warn" });
    expect(gate(r, "competition")!.detail).toMatch(/^likely brand distributor: Pierre Fabre UK \(78% of 400 storefront listings are Bioderma/);
    expect(r.why).toContain("Watch: likely brand distributor: Pierre Fabre UK");

    // A second run within 7 days reuses the cached profiles: no seller tokens.
    const again = await ingest({ files: [upload()] });
    await until(again.runId);
    expect(k.sellerCalls).toHaveLength(1);
    expect(fake.tables.keepa_sellers).toHaveLength(3);
  });

  it("never re-fetches a snapshot under 24 hours old", async () => {
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    await rescreenRun(runId);
    await until(runId);
    const second = await ingest({ files: [upload()] });
    await until(second.runId);
    expect(k.asinCalls).toHaveLength(1);
    expect(tokens(runId)).toBe(9);
    expect(tokens(second.runId)).toBe(0);
    expect(results(second.runId).every((r) => (r.inputs as { market: { hasHistory: boolean } }).market.hasHistory)).toBe(true);
  });

  it("Re-screen from stored data only fetches nothing and leaves rows that need data as they were", async () => {
    k.live = false;
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    const before = results(runId).map((r) => ({ status: r.status, why: r.why }));
    k.live = true;
    const r = await rescreenRun(runId, null, { storedOnly: true });
    expect(r).toMatchObject({ requeued: 0, leftAsIs: 2 });
    expect(k.asinCalls).toEqual([]);
    expect(results(runId).map((x) => ({ status: x.status, why: x.why }))).toEqual(before);
    expect(fake.tables.runs.find((x) => x.id === runId)!.status).toBe("done");
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
    expect(tokens(runId)).toBe(9);
    expect(results(runId).every((r) => gate(r, "mirage")?.status === "pass")).toBe(true);

    const r2 = await rescreenRun(runId);
    expect(r2.requeued).toBe(0);
    expect(k.asinCalls).toHaveLength(1);
  });

  it("still stores snapshots (and so never re-fetches) before the extras migration is run", async () => {
    fake.missingColumns.keepa_snapshots = ["monthly_sold", "package", "fba_fee", "buybox_seller_history"];
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    expect(fake.tables.keepa_snapshots).toHaveLength(2);
    expect((fake.tables.keepa_snapshots[0].summary as { fbaFee: number }).fbaFee).toBe(3.09);
    await rescreenRun(runId);
    await until(runId);
    expect(k.asinCalls).toHaveLength(1);
  });

  it("paces Keepa by its token balance: fetches what it can afford, waits for the rest", async () => {
    k.tokens = { tokensLeft: 4, refillInMs: 60_000, refillRate: 21 }; // enough for one ASIN (3 tokens)
    const { runId } = await ingest({ files: [upload()] });
    const p1 = await processRun(runId, { budgetMs: 1_000 });
    expect(k.asinCalls).toEqual([["B0060OMXUA"]]);
    expect(p1.done).toBe(false);
    expect(p1.waiting).toEqual({ amazon: 0, keepa: 1 });
    expect(Date.parse(p1.keepaResumeAt!)).toBeGreaterThan(Date.now() + 50_000);
    // Each batch records the run's measured rate and Keepa's own token figures for the estimate.
    const stats = fake.tables.runs.find((r) => r.id === runId)!.stats as { amazonPerMin: number; keepa: { tokensLeft: number; refillRate: number } };
    expect(stats.amazonPerMin).toBeGreaterThan(0);
    expect(stats.keepa).toMatchObject({ tokensLeft: 4, refillRate: 21 });
    expect(p1.eta.minutes).not.toBeNull();
    // The waiting row kept its SP-API price and match; nothing was finalised without history.
    const waiting = results(runId).find((r) => r.status === "pending")!;
    expect((waiting.inputs as { stage: string; market: { currentBuyBox: number } })).toMatchObject({ stage: "priced", market: { currentBuyBox: 23.55 } });

    k.tokens = { tokensLeft: 300, refillInMs: 60_000, refillRate: 21 };
    const p2 = await processRun(runId, { budgetMs: 1_000 });
    expect(p2.done).toBe(true);
    expect(k.asinCalls).toEqual([["B0060OMXUA"], ["B002XZLAWM"]]);
    expect(results(runId).every((r) => (r.inputs as { market: { hasHistory: boolean } }).market.hasHistory)).toBe(true);
  });

  it("records the run's Keepa tokens against today for the dashboard", async () => {
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    const stats = fake.tables.runs.find((r) => r.id === runId)!.stats as { keepaByDay: Record<string, number> };
    expect(tokens(runId)).toBeGreaterThan(0);
    expect(stats.keepaByDay).toEqual({ [ukDay()]: tokens(runId) });
  });

  it("lets one worker hold a run at a time", async () => {
    const { runId } = await ingest({ files: [upload()] });
    fake.tables.runs.find((r) => r.id === runId)!.lease_until = new Date(Date.now() + 30_000).toISOString();
    const p = await processRun(runId);
    expect(p.busy).toBe(true);
    expect(k.asinCalls).toEqual([]);
  });

  it("uses fetched history even if storing the snapshot fails, and says so", async () => {
    fake.failInserts.add("keepa_snapshots");
    const { runId } = await ingest({ files: [upload()] });
    await until(runId);
    expect(tokens(runId)).toBe(9);
    const r = results(runId)[0];
    expect((r.inputs as { market: { hasHistory: boolean } }).market.hasHistory).toBe(true);
    expect(r.why).toMatch(/Keepa snapshot not stored: request entity too large/);
  });
});
