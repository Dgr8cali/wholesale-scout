/**
 * End-to-end over ingest → process with an in-memory database and fake SP-API.
 * Keepa stays a stub, as it is in production until the key is set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyMapping, headerFingerprint, type Cell } from "../ingest/mapping";
import type { CatalogMatch } from "../spapi/types";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { ingest } from "./ingest";
import { processRun, rescreenRun } from "./process";

const catalogCalls: string[][] = [];
const calls = { catalog: 0, pricing: 0, restrictions: 0, fees: 0 };

const cat = (asin: string, ean: string, over: Partial<CatalogMatch> = {}): CatalogMatch => ({
  asin, eans: [ean], title: `Item ${asin}`, brand: "Brand", category: "DIY & Tools",
  dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, salesRank: 3000, parentAsin: null, variationCount: null,
  hazmat: [], batteries: false, ...over,
});

const CATALOG: Record<string, CatalogMatch[]> = {
  "4006381333931": [cat("B0TAPE0001", "4006381333931")],
  "5000000000011": [cat("B0FRAG0001", "5000000000011")],
  "5000000000035": [cat("B0CHEAP001", "5000000000035")],
  "5000000000042": [cat("B0MULTIA01", "5000000000042"), cat("B0MULTIB01", "5000000000042")],
};

const PRICES: Record<string, { buyBox: number; offers: number }> = {
  B0TAPE0001: { buyBox: 24.99, offers: 4 },
  B0FRAG0001: { buyBox: 30, offers: 5 },
  B0CHEAP001: { buyBox: 12.5, offers: 6 },
  B0MULTIA01: { buyBox: 22, offers: 4 },
  B0MULTIB01: { buyBox: 22, offers: 4 },
};

vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  return {
    ...real,
    getSpApi: () => ({
      async catalogByEans(eans: string[]) {
        calls.catalog++;
        catalogCalls.push(eans);
        return new Map(eans.filter((e) => CATALOG[e]).map((e) => [e, CATALOG[e]]));
      },
      async getCompetitivePricing(asins: string[]) {
        calls.pricing++;
        return new Map(asins.filter((a) => PRICES[a]).map((a) => [a, { asin: a, buyBox: PRICES[a].buyBox, newOffers: PRICES[a].offers, salesRank: 3000 }]));
      },
      async getListingsRestrictions(asin: string) {
        calls.restrictions++;
        return asin === "B0MULTIB01"
          ? { asin, status: "approval_required", reasons: [{ code: "APPROVAL_REQUIRED", message: "You need approval to list this brand." }] }
          : { asin, status: "open", reasons: [] };
      },
      async getMyFeesEstimates(items: { asin: string; price: number }[]) {
        calls.fees++;
        return items.map(({ asin }) => (asin === "B0TAPE0001"
          ? { asin, ok: true, referral: 3.25, fba: 2.9, total: 6.15 }
          : { asin, ok: false, referral: null, fba: null, total: null, error: "no estimate" }));
      },
    }),
  };
});

vi.mock("../keepa/client", async (orig) => {
  const real = await orig<typeof import("../keepa/client")>();
  return { ...real, getKeepa: () => new real.StubKeepaClient() };
});

function file(name: string, sheet: Cell[][], supplier: { name: string; vatBasis: "ex_vat" | "inc_vat"; vatRate: number; currency: string }, fx = { rate: 1, date: "2026-09-25" }) {
  const mapping = { headerRow: 0, columns: { ean: "EAN", title: "Name", unitPrice: "Price", moq: "MOQ" }, pricePer: "unit" as const };
  return {
    fileName: name, supplier, headers: sheet[0] as string[], fingerprint: headerFingerprint(sheet[0]), mapping, fx,
    rows: applyMapping(sheet, mapping, supplier, fx).rows,
  };
}

describe("ingest → process", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
    catalogCalls.length = 0;
    Object.assign(calls, { catalog: 0, pricing: 0, restrictions: 0, fees: 0 });
  });

  it("screens a combined upload in cost order and scores the survivors", async () => {
    const a = file("henbrandt.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "5.00", 12],
      ["5000000000011", "Hugo Boss Bottled Eau de Toilette 100ml", "8.00", 6],
      ["5000000000028", "Unlisted gadget", "4.00", 10],
      ["5000000000035", "Cheap widget", "6.00", 10],
      ["5000000000042", "Two-listing thing", "5.00", 10],
    ], { name: "Henbrandt", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const b = file("qogita.csv", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "7,00", 12],
    ], { name: "Qogita", vatBasis: "inc_vat", vatRate: 20, currency: "EUR" }, { rate: 0.85, date: "2026-09-25" });

    // Seed first so we can pick the Strict profile (compliance on fail).
    await import("./db").then((m) => m.ensureSeed());
    const strict = fake.tables.profiles.find((p) => p.name === "Strict")!;
    const { runId, rowCount, offerCount } = await ingest({ profileId: strict.id as string, files: [a, b] });
    expect(rowCount).toBe(5);
    expect(offerCount).toBe(6);

    // Mappings and supplier ledger facts are remembered.
    expect(fake.tables.supplier_mappings).toHaveLength(2);
    expect(fake.tables.suppliers.find((s) => s.name === "Qogita")).toMatchObject({ currency: "EUR", vat_basis: "inc_vat" });

    let guard = 0;
    while (!(await processRun(runId, 3)).done) if (++guard > 20) throw new Error("run never finished");

    const results = fake.tables.results.filter((r) => r.run_id === runId);
    const productOf = (r: Record<string, unknown>) => fake.tables.products.find((p) => p.id === r.product_id)!;
    const byAsin = (asin: string | null, ean?: string) => results.find((r) => productOf(r).asin === asin && (!ean || productOf(r).ean === ean))!;

    expect(results).toHaveLength(6); // five EANs, one of them on two ASINs
    expect(results.every((r) => r.status === "done")).toBe(true);
    expect(fake.tables.runs[0]).toMatchObject({ status: "done", processed_count: 6, row_count: 6 });

    // Fragrance fails compliance on the row's own text, before any API call is spent on it.
    const frag = results.find((r) => productOf(r).ean === "5000000000011")!;
    expect(frag).toMatchObject({ verdict: "fail", failed_gate: "compliance" });
    expect(frag.why).toContain("Hazmat: flammable liquid (Eau de Toilette); Liquid (100ml)");
    expect(catalogCalls.flat()).not.toContain("5000000000011");

    // The cheaper offer (Qogita, €7 inc VAT → £4.96 ex VAT) wins and is scored with Amazon's fees.
    const tape = byAsin("B0TAPE0001");
    const offer = fake.tables.offers.find((o) => o.id === tape.offer_id)!;
    expect(Number(offer.unit_cost_gbp)).toBeCloseTo((7 / 1.2) * 0.85, 3);
    expect(offer.currency).toBe("EUR");
    expect(tape.offer_count).toBe(2);
    expect(tape.verdict).not.toBe("fail");
    expect((tape.fees as { source: string }).source).toBe("amazon");
    expect(tape.score).not.toBeNull();
    expect(tape.why).toMatch(/^\d+ — /);
    expect(tape.band).toBe("amber"); // no Keepa history yet: green is held back

    // No listing → match quality fails.
    const unlisted = results.find((r) => productOf(r).ean === "5000000000028")!;
    expect(unlisted).toMatchObject({ verdict: "fail", failed_gate: "matchQuality" });

    // £12.50 on a £6 cost fails the fee gate and reports the hurdle price.
    const cheap = byAsin("B0CHEAP001");
    expect(cheap.failed_gate).toBe("fees");
    expect(Number(cheap.hurdle_price)).toBeGreaterThan(12.5);

    // One EAN, two ASINs: both scored; the one needing brand approval warns and says so.
    expect(byAsin("B0MULTIA01").failed_gate).not.toBe("gating");
    expect(byAsin("B0MULTIB01")).toMatchObject({ verdict: "warn", failed_gate: null });
    expect(byAsin("B0MULTIB01").why).toContain("Brand approval needed (Brand)");
  });

  it("re-screens from stored data, fetching only what a row never had", async () => {
    await import("./db").then((m) => m.ensureSeed());
    const strict = fake.tables.profiles.find((p) => p.name === "Strict")!;
    const testOrder = fake.tables.profiles.find((p) => p.name === "Test order")!;
    const f = file("henbrandt.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "5.00", 12],
      ["5000000000011", "Hugo Boss Bottled Eau de Toilette 100ml", "8.00", 6],
      ["5000000000035", "Cheap widget", "6.00", 10],
    ], { name: "Henbrandt", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const { runId } = await ingest({ profileId: strict.id as string, files: [f] });
    while (!(await processRun(runId)).done);
    const before = { ...calls };
    const results = () => fake.tables.results.filter((r) => r.run_id === runId);
    const ean = (r: Record<string, unknown>) => fake.tables.products.find((p) => p.id === r.product_id)!.ean;
    expect(results().find((r) => ean(r) === "5000000000011")!.failed_gate).toBe("compliance");

    // Same profile, tighter floor: re-scored in place, no calls at all.
    const cfg = structuredClone(strict.config) as { gates: { fees: { minProfit: number } } };
    cfg.gates.fees.minProfit = 50;
    strict.config = cfg;
    const r1 = await rescreenRun(runId);
    expect(r1.requeued).toBe(0);
    expect(calls).toEqual(before);
    expect(results().find((r) => ean(r) === "4006381333931")!.failed_gate).toBe("fees");
    expect(fake.tables.runs.find((r) => r.id === runId)!.status).toBe("done");

    // Test order only warns on fragrance, which never got a lookup: it alone is re-queued.
    const r2 = await rescreenRun(runId, testOrder.id as string);
    expect(r2.requeued).toBe(1);
    expect(calls).toEqual(before);
    while (!(await processRun(runId)).done);
    expect(catalogCalls.at(-1)).toEqual(["5000000000011"]);
    expect(calls.catalog).toBe(before.catalog + 1);
    expect(calls.restrictions).toBe(before.restrictions + 1);
    const frag = results().find((r) => ean(r) === "5000000000011")!;
    expect(frag.status).toBe("done");
    expect(frag.failed_gate).not.toBe("compliance");
    expect(fake.tables.runs.find((r) => r.id === runId)!.profile_id).toBe(testOrder.id);
  });

  it("recognises a re-uploaded layout by its fingerprint", async () => {
    const sheet: Cell[][] = [["EAN", "Name", "Price", "MOQ"], ["4006381333931", "Walker Tape 25mm", "5.00", 12]];
    const f = file("pharmazon-sept.xlsx", sheet, { name: "Pharmazon", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    await ingest({ files: [f] });
    const again = headerFingerprint(["mo q".replace(" ", ""), "price", "NAME", "ean"]);
    expect(fake.tables.supplier_mappings.find((m) => m.header_fingerprint === again)).toBeTruthy();
  });
});
