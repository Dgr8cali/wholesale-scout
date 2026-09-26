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
const FLAKY_EAN = "5000000000059";
const APPLY = { resource: "https://sellercentral.amazon.co.uk/hz/approvalrequest/restrictions/approve?asin=B0MULTIB01", verb: "GET", title: "Request Approval via Seller Central.", type: "text/html" };
const calls = { catalog: 0, pricing: 0, restrictions: 0, fees: 0 };

const cat = (asin: string, ean: string, over: Partial<CatalogMatch> = {}): CatalogMatch => ({
  asin, eans: [ean], title: `Item ${asin}`, brand: "Brand", category: "DIY & Tools",
  dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, salesRank: 3000, parentAsin: null, variationCount: null,
  hazmat: [], batteries: false, imageUrl: `https://m.media-amazon.com/images/I/${asin}-main.jpg`, ...over,
});

const CATALOG: Record<string, CatalogMatch[]> = {
  "3401399277092": [
    cat("B0060OMXUA", "3401399277092", { brand: "Bioderma", title: "Bioderma Sebium Purifying Cleansing Foaming Gel 500ml" }),
    cat("B076HZHD2X", "3401399277092", { brand: "Bioderma", title: "Onagrine CC Cream Extreme Perfection Complexion Perfecting Care 40ml - Dark" }),
  ],
  "4006381333931": [cat("B0TAPE0001", "4006381333931")],
  "5000000000011": [cat("B0FRAG0001", "5000000000011")],
  "5000000000035": [cat("B0CHEAP001", "5000000000035")],
  "5000000000042": [cat("B0MULTIA01", "5000000000042", { title: "Two-listing thing, single" }), cat("B0MULTIB01", "5000000000042", { title: "Two-listing thing, large" })],
  "5000000000066": [cat("B0PACK0003", "5000000000066", { title: "Brite Scouring Pads (Pack of 3)", pack: { itemPackageQuantity: 3, numberOfItems: 3 } })],
  "5000000000073": [cat("B0PACKMIS1", "5000000000073", { title: "Brite Sponge Cloth Twin Pack", pack: { itemPackageQuantity: 1, numberOfItems: 1 } })],
};

const PRICES: Record<string, { buyBox: number; offers: number }> = {
  B0TAPE0001: { buyBox: 24.99, offers: 4 },
  B0FRAG0001: { buyBox: 30, offers: 5 },
  B0CHEAP001: { buyBox: 12.5, offers: 6 },
  B0MULTIA01: { buyBox: 22, offers: 4 },
  B0MULTIB01: { buyBox: 22, offers: 4 },
  B0060OMXUA: { buyBox: 21.5, offers: 5 },
  B076HZHD2X: { buyBox: 23, offers: 3 },
  B0PACK0003: { buyBox: 24, offers: 4 },
  B0PACKMIS1: { buyBox: 20, offers: 4 },
};

vi.mock("../spapi/client", async (orig) => {
  const real = await orig<typeof import("../spapi/client")>();
  return {
    ...real,
    getSpApi: () => ({
      async lookupEans(eans: string[]) {
        calls.catalog++;
        catalogCalls.push(eans);
        const traces = new Map(eans.map((e) => [e, CATALOG[e]
          ? { outcome: "matched", attempts: [{ identifiersType: "EAN", code: `batch of ${eans.length}`, items: CATALOG[e].length }] }
          : e === FLAKY_EAN
            ? { outcome: "api_error", attempts: [{ identifiersType: "EAN", code: e, items: 0, error: "SP-API catalog 503" }] }
            : { outcome: "search_miss", attempts: [{ identifiersType: "EAN", code: `batch of ${eans.length}`, items: 0 }, { identifiersType: "EAN", code: e, items: 0, total: 0 }], raw: "{}" }]));
        return { matches: new Map(eans.filter((e) => CATALOG[e]).map((e) => [e, CATALOG[e]])), traces };
      },
      async imagesByAsins(asins: string[]) {
        return new Map(asins.map((a) => [a, a === "B0NOIMAGE1" ? null : `https://m.media-amazon.com/images/I/${a}-bf.jpg`]));
      },
      async getCompetitivePricing(asins: string[]) {
        calls.pricing++;
        return new Map(asins.filter((a) => PRICES[a]).map((a) => [a, { asin: a, buyBox: PRICES[a].buyBox, newOffers: PRICES[a].offers, salesRank: 3000 }]));
      },
      async getListingsRestrictions(asin: string) {
        calls.restrictions++;
        return asin === "B0MULTIB01"
          ? { asin, status: "approval_required", reasons: [{ code: "APPROVAL_REQUIRED", message: "You need approval to list this brand.", links: [APPLY] }] }
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

  it("scales a single's cost to a multipack listing and flags a pack mismatch", async () => {
    const f = file("packs.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["5000000000066", "Brite Scouring Pads", "4.00", 12],
      ["5000000000073", "Brite Sponge Cloth", "3.00", 12],
    ], { name: "Suds Ltd", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    await import("./db").then((m) => m.ensureSeed());
    const profile = fake.tables.profiles.find((p) => p.name === "Balanced") ?? fake.tables.profiles[0];
    const { runId } = await ingest({ profileId: profile.id as string, files: [f] });
    let guard = 0;
    while (!(await processRun(runId)).done) if (++guard > 20) throw new Error("run never finished");
    const results = fake.tables.results.filter((r) => r.run_id === runId);
    const productOf = (r: Record<string, unknown>) => fake.tables.products.find((p) => p.id === r.product_id)!;
    const byAsin = (asin: string) => results.find((r) => productOf(r).asin === asin)!;

    const three = byAsin("B0PACK0003");
    expect(productOf(three)).toMatchObject({ pack_count: 3, pack_attrs: { itemPackageQuantity: 3, numberOfItems: 3 } });
    // Three of the supplier's £4.00 items per listing; prep and inbound once per listing.
    const m = String(three.why).match(/Listing is a 3-pack: landed £(\d+\.\d\d) for 3 × £4\.00 \(plus [a-z, ]+\)\./i);
    expect(m, String(three.why)).toBeTruthy();
    expect(Number(three.landed_cost)).toBeCloseTo(Number(m![1]), 1);
    expect(Number(three.landed_cost)).toBeGreaterThan(12);
    expect((three.inputs as { pack: unknown }).pack).toEqual({ listing: 3, supplier: 1, ratio: 3 });
    expect((three.gate_outcomes as { gate: string; status: string }[]).find((g) => g.gate === "matchQuality")!.status).toBe("pass");

    // Title says twin, the catalog says single: scaled by the title, and flagged.
    const twin = byAsin("B0PACKMIS1");
    const mq = (twin.gate_outcomes as { gate: string; status: string; detail: string; tags?: string[] }[]).find((g) => g.gate === "matchQuality")!;
    expect(mq).toMatchObject({ status: "warn", tags: ["PACK_MISMATCH"] });
    expect(mq.detail).toBe("pack mismatch, check: title says 2, Amazon's attributes say 1");
    expect(twin.why).toContain("Listing is a 2-pack");

    // Re-screen reads the stored product: correcting the attributes clears the flag, no fetching.
    Object.assign(productOf(twin), { pack_attrs: { itemPackageQuantity: 2, numberOfItems: 2 } });
    const before = { ...calls };
    while ((await rescreenRun(runId)).remaining) if (++guard > 40) throw new Error("rescreen never finished");
    expect(calls).toEqual(before);
    const again = fake.tables.results.find((r) => r.id === twin.id)!;
    expect((again.gate_outcomes as { gate: string; status: string }[]).find((g) => g.gate === "matchQuality")!.status).toBe("pass");
  });

  it("screens a combined upload in cost order and scores the survivors", async () => {
    const a = file("henbrandt.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "5.00", 12],
      ["5000000000011", "Hugo Boss Bottled Eau de Toilette 100ml", "8.00", 6],
      ["5000000000028", "Unlisted gadget", "4.00", 10],
      ["5000000000035", "Cheap widget", "6.00", 10],
      ["5000000000042", "Two-listing thing", "5.00", 10],
      ["5000000000059", "Lookup times out", "5.00", 10],
    ], { name: "Henbrandt", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const b = file("qogita.csv", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "7,00", 12],
    ], { name: "Qogita", vatBasis: "inc_vat", vatRate: 20, currency: "EUR" }, { rate: 0.85, date: "2026-09-25" });

    // Seed first so we can pick the Strict profile (compliance on fail).
    await import("./db").then((m) => m.ensureSeed());
    const strict = fake.tables.profiles.find((p) => p.name === "Strict")!;
    const { runId, rowCount, offerCount } = await ingest({ profileId: strict.id as string, files: [a, b] });
    expect(rowCount).toBe(6);
    expect(offerCount).toBe(7);

    // Mappings and supplier ledger facts are remembered.
    expect(fake.tables.supplier_mappings).toHaveLength(2);
    expect(fake.tables.suppliers.find((s) => s.name === "Qogita")).toMatchObject({ currency: "EUR", vat_basis: "inc_vat" });

    let guard = 0;
    while (!(await processRun(runId)).done) if (++guard > 20) throw new Error("run never finished");

    const results = fake.tables.results.filter((r) => r.run_id === runId);
    const productOf = (r: Record<string, unknown>) => fake.tables.products.find((p) => p.id === r.product_id)!;
    const byAsin = (asin: string | null, ean?: string) => results.find((r) => productOf(r).asin === asin && (!ean || productOf(r).ean === ean))!;

    expect(results).toHaveLength(7); // six EANs, one of them on two ASINs
    expect(results.filter((r) => r.status === "done")).toHaveLength(6);
    expect(fake.tables.runs[0]).toMatchObject({ status: "done", processed_count: 7, row_count: 7 });

    // Fragrance fails compliance on the row's own text, before any API call is spent on it.
    const frag = results.find((r) => productOf(r).ean === "5000000000011")!;
    expect(frag).toMatchObject({ verdict: "fail", failed_gate: "compliance" });
    expect(frag.why).toContain("Hazmat: flammable liquid (keyword match: Eau de Toilette); Liquid (keyword match: 100ml)");
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

    // No listing → match quality fails, and says what was tried.
    const unlisted = results.find((r) => productOf(r).ean === "5000000000028")!;
    expect(unlisted).toMatchObject({ verdict: "fail", failed_gate: "matchQuality" });
    expect(unlisted.why).toMatch(/: search miss: tried an EAN batch of \d+, EAN 5000000000028; Amazon returned no items/);
    expect((unlisted.inputs as { lookup: { outcome: string } }).lookup.outcome).toBe("search_miss");

    // Amazon failing to answer isn't a verdict: the row is an error to retry, not a failed match.
    const flaky = results.find((r) => productOf(r).ean === FLAKY_EAN)!;
    expect(flaky.status).toBe("error");
    expect(flaky.error).toMatch(/Catalog lookup failed for EAN 5000000000059: SP-API catalog 503/);

    // £12.50 on a £6 cost fails the fee gate and reports the hurdle price.
    const cheap = byAsin("B0CHEAP001");
    expect(cheap.failed_gate).toBe("fees");
    expect(Number(cheap.hurdle_price)).toBeGreaterThan(12.5);

    // One EAN, two ASINs: both scored; the one needing brand approval warns and says so.
    expect(byAsin("B0MULTIA01").failed_gate).not.toBe("gating");
    expect(byAsin("B0MULTIB01")).toMatchObject({ verdict: "warn", failed_gate: null });
    expect(byAsin("B0MULTIB01").why).toContain("Brand approval needed (Brand)");
    const gating = (byAsin("B0MULTIB01").gate_outcomes as { gate: string; links?: unknown[] }[]).find((g) => g.gate === "gating")!;
    expect(gating.links).toEqual([APPLY]);

    // A restriction stored before links were kept is checked again on Re-screen, once.
    const multiB = byAsin("B0MULTIB01");
    const legacy = structuredClone(multiB.inputs) as { restriction: { links?: unknown } };
    delete legacy.restriction.links;
    multiB.inputs = legacy;
    const before = calls.restrictions;
    const rs = await rescreenRun(runId);
    expect(rs.requeued).toBe(1 + 1); // this row, plus the errored lookup row
    while (!(await processRun(runId)).done);
    expect(calls.restrictions).toBe(before + 1);
    expect(((byAsin("B0MULTIB01").inputs as { restriction: { links: unknown[] } }).restriction.links)).toEqual([APPLY]);

    // A late "carry on" for a re-screen that has finished does nothing (it once started a new,
    // full re-screen that fetched missing data).
    const statsBefore = JSON.stringify(fake.tables.runs.find((r) => r.id === runId)!.stats);
    expect(await rescreenRun(runId, null, { continuing: true })).toMatchObject({ rescored: 0, requeued: 0, remaining: 0 });
    expect(JSON.stringify(fake.tables.runs.find((r) => r.id === runId)!.stats)).toBe(statsBefore);

    // Recording the brand as approved opens gate 11 on the next re-screen, with no calls.
    fake.tables.brand_approvals = [{ id: "a1", brand_key: "brand", brand: "Brand", status: "approved", status_date: "2026-09-26" }];
    const callsBefore = { ...calls };
    await rescreenRun(runId);
    expect(calls).toEqual(callsBefore);
    const opened = (byAsin("B0MULTIB01").gate_outcomes as { gate: string; status: string; detail: string }[]).find((g) => g.gate === "gating")!;
    expect(opened).toMatchObject({ status: "pass", detail: "Open: brand approval for Brand recorded as approved on 2026-09-26" });
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

  it("keeps an EAN's sibling ASINs on a second upload and on Re-screen (Onagrine doubtful match)", async () => {
    const sebium = () => file("pharmazon.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["3401399277092", "Bioderma Sébium Purifying and Foaming Cleansing Gel 500 ml", "6.00", 6],
    ], { name: "Pharmazon", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    // Brand column mapped too, as on the live sheet.
    const withBrand = () => {
      const f = sebium();
      f.mapping.columns = { ...f.mapping.columns };
      f.rows = f.rows.map((r) => ({ ...r, brand: "Bioderma" }));
      return f;
    };
    const onagrine = (runId: string) => fake.tables.results.find((r) => r.run_id === runId &&
      fake.tables.products.find((p) => p.id === r.product_id)!.asin === "B076HZHD2X")!;

    const first = await ingest({ files: [withBrand()] });
    while (!(await processRun(first.runId)).done);
    expect(onagrine(first.runId)).toMatchObject({ failed_gate: "matchQuality", score: null });

    // Second upload within 7 days: the catalog is fresh, so no lookup. The sibling must still count.
    const second = await ingest({ files: [withBrand()] });
    while (!(await processRun(second.runId)).done);
    const r2 = onagrine(second.runId);
    expect(r2).toMatchObject({ failed_gate: "matchQuality", score: null });
    expect(r2.why).toMatch(/^Failed match quality: Doubtful match: Amazon's title "Onagrine CC Cream/);

    // A row stored with the wrong count (as on the live run) is corrected on Re-screen, no calls.
    const stored = r2.inputs as { match: { asinCount: number } };
    stored.match.asinCount = 1;
    r2.gate_outcomes = [];
    r2.failed_gate = null;
    const before = { ...calls };
    await rescreenRun(second.runId);
    expect(calls).toEqual(before);
    expect(onagrine(second.runId)).toMatchObject({ failed_gate: "matchQuality", score: null });
    expect((onagrine(second.runId).inputs as { match: { asinCount: number } }).match.asinCount).toBe(2);
  });

  it("recognises a re-uploaded layout by its fingerprint", async () => {
    const sheet: Cell[][] = [["EAN", "Name", "Price", "MOQ"], ["4006381333931", "Walker Tape 25mm", "5.00", 12]];
    const f = file("pharmazon-sept.xlsx", sheet, { name: "Pharmazon", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    await ingest({ files: [f] });
    const again = headerFingerprint(["mo q".replace(" ", ""), "price", "NAME", "ean"]);
    expect(fake.tables.supplier_mappings.find((m) => m.header_fingerprint === again)).toBeTruthy();
  });
});

describe("upload limits", () => {
  it("refuses more than 5,000 rows in one upload", async () => {
    __setDbForTests(new FakeDb());
    const row = { ean: "4006381333931", unitCost: 1, unitCostGbp: 1, packUnits: 1, moq: null, stock: null, title: null, brand: null, category: null, sourceRow: 2, eanValid: true };
    const f = { fileName: "big.csv", supplier: { name: "S", vatBasis: "ex_vat" as const, vatRate: 20, currency: "GBP" }, headers: [], fingerprint: "x",
      mapping: { headerRow: 0, columns: {}, pricePer: "unit" as const }, fx: { rate: 1, date: "2026-09-25" }, rows: Array(5_001).fill(row) };
    await expect(ingest({ files: [f] })).rejects.toThrow(/5,001 rows is over the 5,000-row limit/);
  });
});

describe("run names", () => {
  it("names a run after its files unless given a name", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const f = file("pharmazon-sept.xlsx", [["EAN", "Name", "Price", "MOQ"], ["4006381333931", "Walker Tape 25mm", "5.00", 12]],
      { name: "Pharmazon", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const a = await ingest({ files: [f] });
    const b = await ingest({ files: [f], name: "Pharmazon September" });
    expect(fake.tables.runs.find((r) => r.id === a.runId)!.name).toBe("pharmazon-sept.xlsx");
    expect(fake.tables.runs.find((r) => r.id === b.runId)!.name).toBe("Pharmazon September");
  });
});

describe("favourites", () => {
  it("stars by EAN + ASIN across runs, shows the latest result, and re-screens only favourites", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const { addFavourite, favouritesWithLatest, favouritesRunName, removeFavourite, rescreenFavourites } = await import("./favourites");
    const f = file("pharmazon.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "5.00", 12],
      ["5000000000035", "Cheap widget", "6.00", 10],
    ], { name: "Pharmazon", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const first = await ingest({ files: [f] });
    while (!(await processRun(first.runId)).done);

    const star = await addFavourite("4006381333931", "B0TAPE0001", "Try 24 units");
    expect((await addFavourite("4006381333931", "B0TAPE0001")).id).toBe(star.id); // idempotent

    // A later run of the same product: the favourite follows the product, not the run.
    const second = await ingest({ files: [f] });
    while (!(await processRun(second.runId)).done);
    const [view] = await favouritesWithLatest();
    expect(view.favourite.note).toBe("Try 24 units");
    expect((view.latest as { run_id: string }).run_id).toBe(second.runId);
    expect((view.latest as { offer: { supplier: { name: string } } }).offer.supplier.name).toBe("Pharmazon");
    expect(view.outdated).toBe(false);

    // Re-screen: a run with only the favourite, named for the date.
    const r = await rescreenFavourites();
    expect(r).toMatchObject({ count: 1, skipped: 0 });
    const run = fake.tables.runs.find((x) => x.id === r.runId)!;
    expect(run.name).toBe(favouritesRunName());
    expect(run.name).toMatch(/^Favourites \d{1,2} \w{3,4} \d{4}$/); // e.g. "Favourites 25 Sept 2026"
    expect(fake.tables.results.filter((x) => x.run_id === r.runId)).toHaveLength(1);

    await removeFavourite(star.id);
    expect(await favouritesWithLatest()).toEqual([]);
  });

  it("marks a favourite outdated when its latest result is over 7 days old", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const { addFavourite, favouritesWithLatest } = await import("./favourites");
    const f = file("p.xlsx", [["EAN", "Name", "Price", "MOQ"], ["4006381333931", "Walker Tape 25mm", "5.00", 12]],
      { name: "P", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const { runId } = await ingest({ files: [f] });
    while (!(await processRun(runId)).done);
    await addFavourite("4006381333931", "B0TAPE0001");
    for (const r of fake.tables.results) r.updated_at = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect((await favouritesWithLatest())[0].outdated).toBe(true);
  });
});

describe("gate overrides", () => {
  it("waiving a failed gate re-screens the product's row: warn, later gates run, fees and score", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const { addOverride, removeOverride } = await import("./overrides");
    const { resultIdsFor } = await import("./runRows");
    const f = file("p.xlsx", [["EAN", "Name", "Price", "MOQ"], ["5000000000035", "Cheap widget", "6.00", 10]],
      { name: "P", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const { runId } = await ingest({ files: [f] });
    while (!(await processRun(runId)).done);
    const row = () => fake.tables.results.find((r) => r.run_id === runId)!;
    expect(row().failed_gate).toBe("fees");

    // Waive the price band? It passed. Waive the fee gate: the row still can't pass fees, but it's scored.
    await addOverride("5000000000035", "B0CHEAP001", "fees", "Supplier will drop to £4");
    const ids = await resultIdsFor(runId, [{ ean: "5000000000035", asin: "B0CHEAP001" }]);
    await rescreenRun(runId, null, { resultIds: ids });
    const fee = (row().gate_outcomes as { gate: string; status: string; detail: string; tags: string[] }[]).find((g) => g.gate === "fees")!;
    expect(row().failed_gate).toBeNull();
    expect(row().verdict).toBe("warn");
    expect(fee.status).toBe("warn");
    expect(fee.detail).toMatch(/\(waived by you: Supplier will drop to £4\)$/);
    expect(row().why).toMatch(/waived by you/);

    await removeOverride({ ean: "5000000000035", asin: "B0CHEAP001", gate: "fees" });
    await rescreenRun(runId, null, { resultIds: ids });
    expect(row().failed_gate).toBe("fees");
  });

  it("a waived early gate sends the row back for the data it never fetched", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const { addOverride } = await import("./overrides");
    await import("./db").then((m) => m.ensureSeed());
    const strict = fake.tables.profiles.find((p) => p.name === "Strict")!;
    const f = file("p.xlsx", [["EAN", "Name", "Price", "MOQ"], ["4006381333931", "Walker Tape 25mm Eau de Toilette", "5.00", 12]],
      { name: "P", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const { runId } = await ingest({ profileId: strict.id as string, files: [f] });
    while (!(await processRun(runId)).done);
    expect(fake.tables.results[0].failed_gate).toBe("compliance");
    await addOverride("4006381333931", null, "compliance", "Not actually a fragrance");
    const r = await rescreenRun(runId, null, { resultIds: [fake.tables.results[0].id as string] });
    expect(r.requeued).toBe(1);
    while (!(await processRun(runId)).done);
    expect(fake.tables.results[0].failed_gate).not.toBe("compliance");
    // Now the ASIN is known; the EAN-only waiver still applies on the next re-screen.
    expect(fake.tables.products[0].asin).toBe("B0TAPE0001");
    await rescreenRun(runId);
    expect(fake.tables.results[0].failed_gate).not.toBe("compliance");
  });
});

describe("bulk actions", () => {
  it("re-screens a selection as a new run, removes rows from a run, and stars in bulk", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const { runFromSelection, removeFromRun } = await import("./runs");
    const { bulkFavourites, listFavourites } = await import("./favourites");
    const f = file("pharmazon-sept.xlsx", [
      ["EAN", "Name", "Price", "MOQ"],
      ["4006381333931", "Walker Tape 25mm", "5.00", 12],
      ["5000000000035", "Cheap widget", "6.00", 10],
      ["5000000000028", "Unlisted gadget", "4.00", 10],
    ], { name: "Pharmazon", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const { runId } = await ingest({ files: [f], name: "Pharmazon September" });
    while (!(await processRun(runId)).done);
    const ids = fake.tables.results.filter((r) => r.run_id === runId).map((r) => r.id as string);

    const sel = await runFromSelection(runId, ids.slice(0, 2));
    expect(sel.count).toBe(2);
    const newRun = fake.tables.runs.find((r) => r.id === sel.runId)!;
    expect(newRun.name).toBe("Pharmazon September — 2 selected");
    expect(fake.tables.results.filter((r) => r.run_id === sel.runId)).toHaveLength(2);

    expect(await removeFromRun(runId, [ids[2]])).toBe(1);
    expect(fake.tables.results.filter((r) => r.run_id === runId)).toHaveLength(2);
    expect(fake.tables.runs.find((r) => r.id === runId)!.row_count).toBe(2);

    await bulkFavourites([{ ean: "4006381333931", asin: "B0TAPE0001" }, { ean: "5000000000035", asin: "B0CHEAP001" }], "star");
    expect(await listFavourites()).toHaveLength(2);
    await bulkFavourites([{ ean: "4006381333931", asin: "B0TAPE0001" }], "unstar");
    expect((await listFavourites()).map((x) => x.ean)).toEqual(["5000000000035"]);
  });
});

describe("product images", () => {
  it("stores the catalog's main image when a product is matched, and backfills older products", async () => {
    const fake = new FakeDb();
    __setDbForTests(fake);
    const f = file("p.xlsx", [["EAN", "Name", "Price", "MOQ"], ["4006381333931", "Walker Tape 25mm", "5.00", 12]],
      { name: "P", vatBasis: "ex_vat", vatRate: 20, currency: "GBP" });
    const { runId } = await ingest({ files: [f] });
    while (!(await processRun(runId)).done);
    expect(fake.tables.products[0].image_url).toBe("https://m.media-amazon.com/images/I/B0TAPE0001-main.jpg");

    fake.tables.products.push(
      { id: "old1", ean: "1", asin: "B0OLDPROD1", image_url: null },
      { id: "old2", ean: "2", asin: "B0NOIMAGE1", image_url: null },
      { id: "old3", ean: "3", asin: null, image_url: null },
    );
    const { backfillImages } = await import("./images");
    expect(await backfillImages()).toEqual({ looked: 2, found: 1 });
    const byId = (id: string) => fake.tables.products.find((p) => p.id === id)!;
    expect(byId("old1").image_url).toBe("https://m.media-amazon.com/images/I/B0OLDPROD1-bf.jpg");
    expect(byId("old2").image_url).toBe(""); // looked, none: not asked again
    expect(byId("old3").image_url).toBeNull(); // no ASIN yet
  });
});
