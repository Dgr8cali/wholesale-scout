import { beforeEach, describe, expect, it } from "vitest";
import { applyMapping, headerFingerprint } from "../ingest/mapping";
import { __setDbForTests, ensureSeed } from "./db";
import { FakeDb } from "./fakeDb";
import { ingest } from "./ingest";
import { checkNewOffers, finishWatchRun, setWatch } from "./watchlist";
import { withDefaults } from "../screening/config";

const EAN_A = "5000000000011", EAN_B = "5000000000028", EAN_C = "5000000000035";

describe("watchlist", () => {
  let fake: FakeDb;
  beforeEach(async () => {
    fake = new FakeDb();
    __setDbForTests(fake);
    for (const t of ["watch_alerts", "runs", "results", "products", "favourites"]) fake.tables[t] ??= [];
    delete process.env.RESEND_API_KEY;
    await ensureSeed();
  });

  /** A finished re-check run with one result per product. */
  const recheck = (rows: { ean: string; asin: string; verdict: "pass" | "warn" | "fail"; buyBox: number }[]) => {
    const runId = "run-watch";
    fake.tables.runs.push({ id: runId, status: "done", profile_snapshot: withDefaults(null), stats: { watch: { startedAt: new Date().toISOString() } } });
    for (const r of rows) {
      const pid = `p-${r.ean}`;
      fake.tables.products.push({ id: pid, ean: r.ean, asin: r.asin, title: `Item ${r.asin}`, brand: "Brite" });
      fake.tables.results.push({ id: `r-${r.ean}`, run_id: runId, product_id: pid, offer_id: `o-${r.ean}`, status: "done", verdict: r.verdict, sell_price: r.buyBox,
        inputs: { market: { hasHistory: true, currentBuyBox: r.buyBox, fbaOffers: 4, amazonLastSeenDays: null }, maxLandedGbp: 8, restriction: { status: "open" } } });
    }
    return runId;
  };

  it("records each check, alerts on a flip to pass or a met condition, once", async () => {
    await setWatch({ ean: EAN_A, asin: "B0WATCH001", condition: { kind: "buyBox", value: 24 } });
    await setWatch({ ean: EAN_B, asin: "B0WATCH002", condition: null });
    await setWatch({ ean: EAN_C, asin: "B0WATCH003", condition: { kind: "buyBox", value: 30 } });
    const runId = recheck([
      { ean: EAN_A, asin: "B0WATCH001", verdict: "warn", buyBox: 24.5 }, // condition met
      { ean: EAN_B, asin: "B0WATCH002", verdict: "pass", buyBox: 20 },   // now passes
      { ean: EAN_C, asin: "B0WATCH003", verdict: "warn", buyBox: 25 },   // nothing
    ]);
    expect(await finishWatchRun(runId)).toEqual({ checked: 3, alerts: 2, emailed: false }); // no RESEND_API_KEY
    expect(fake.tables.watch_alerts.map((a) => [a.ean, a.kind, a.detail])).toEqual([
      [EAN_A, "condition", "Buy Box ≥ £24.00: Buy Box £24.50"],
      [EAN_B, "passes", "Now passes · Buy Box £20.00"],
    ]);
    const a = fake.tables.favourites.find((f) => f.ean === EAN_A)!;
    expect(a.last_check).toMatchObject({ met: true, verdict: "warn", buyBox: 24.5, maxLanded: 8, runId });
    // Evaluated once per run.
    expect(await finishWatchRun(runId)).toBeNull();

    // Next week, still met / still passing: no new alert.
    const second = "run-watch-2";
    fake.tables.runs.push({ id: second, status: "done", profile_snapshot: withDefaults(null), stats: { watch: { startedAt: new Date().toISOString() } } });
    for (const r of fake.tables.results.filter((x) => x.run_id === runId)) fake.tables.results.push({ ...r, id: `${r.id}-2`, run_id: second });
    expect((await finishWatchRun(second))!.alerts).toBe(0);
  });

  it("alerts at once when an upload offers a no-supplier product at or under its max landed", async () => {
    await setWatch({ ean: EAN_A, asin: "B0PARAFLU1", condition: { kind: "landed", value: 8 }, noSupplier: true });
    const fees = withDefaults(null).fees;
    expect(await checkNewOffers("run-x", [{ ean: EAN_A, unitCostGbp: 30, vatRatePct: 20, supplier: "Pricey Ltd", costKnown: true }], fees)).toBe(0);
    expect(await checkNewOffers("run-x", [{ ean: EAN_A, unitCostGbp: 1, vatRatePct: 20, supplier: "No cost", costKnown: false }], fees)).toBe(0);

    const sheet = [["EAN", "Name", "Price", "MOQ"], [EAN_A, "Paraflu 50ml", "3.00", 6]];
    const mapping = { headerRow: 0, columns: { ean: "EAN", title: "Name", unitPrice: "Price", moq: "MOQ" }, pricePer: "unit" as const };
    const supplier = { name: "Henbrandt", vatBasis: "ex_vat" as const, vatRate: 20, currency: "GBP" };
    await ingest({ files: [{ fileName: "h.xlsx", supplier, headers: sheet[0] as string[], fingerprint: headerFingerprint(sheet[0]), mapping, fx: { rate: 1, date: "2026-09-25" }, rows: applyMapping(sheet, mapping, supplier, { rate: 1, date: "2026-09-25" }).rows }] });
    expect(fake.tables.watch_alerts).toHaveLength(1);
    expect(fake.tables.watch_alerts[0]).toMatchObject({ ean: EAN_A, kind: "supplier", detail: expect.stringMatching(/^Henbrandt offers it at £\d+\.\d\d landed \(max £8\.00\)$/) });
    // The same offer again that week: no second alert.
    expect(await checkNewOffers("run-y", [{ ean: EAN_A, unitCostGbp: 3, vatRatePct: 20, supplier: "Henbrandt", costKnown: true }], fees)).toBe(0);
  });
});
