import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canTake, costSnapshot, dailyDemand, daysOfCover, levelStatus, levelsByItem, reorderFor, totalOf } from "./levels";
import { planItemsCsv, planStockPilotRaw } from "./stockpilot";

describe("levels", () => {
  const mv = (bucket: "home" | "tiktok_fbt" | "fba", quantity: number) => ({ item_id: "a", bucket, quantity, kind: "receipt" as const, date: "2026-07-15" });
  it("sums movements per bucket; FBA from SP-API replaces any FBA movements", () => {
    const l = levelsByItem([mv("home", 93), mv("home", -36), mv("tiktok_fbt", 36), mv("fba", 5)], new Map([["a", 12]])).get("a")!;
    expect(l).toEqual({ home: 57, fba: 12, tiktok_fbt: 36 });
    expect(totalOf(l)).toBe(105);
  });
  it("demand, cover, status", () => {
    const d = dailyDemand({ amazonUnits: 30, sales: [{ bucket: "home", quantity: 15 }, { bucket: "tiktok_fbt", quantity: 15 }], days: 30 });
    expect(d).toMatchObject({ fba: 1, home: 0.5, tiktok_fbt: 0.5, total: 2 });
    expect([daysOfCover(60, 2), daysOfCover(10, 0), daysOfCover(0, 2)]).toEqual([30, null, 0]);
    expect([levelStatus(0, 10), levelStatus(8, 10), levelStatus(30, 10), levelStatus(5, null)]).toEqual(["out", "low", "ok", "ok"]);
  });
  it("reorder: point = (lead + buffer) × demand, quantity = 30 days of demand", () => {
    expect(reorderFor({ total: 40, perDay: 2, leadTimeDays: 14, bufferDays: 7, coverDays: 30 })).toMatchObject({ reorderPoint: 42, suggestedQty: 60, status: "due", daysToReorder: 0 });
    expect(reorderFor({ total: 50, perDay: 2, leadTimeDays: 14, bufferDays: 7, coverDays: 30 }).status).toBe("soon");
    expect(reorderFor({ total: 200, perDay: 2, leadTimeDays: 14, bufferDays: 7, coverDays: 30 }).status).toBe("ok");
    expect(reorderFor({ total: 5, perDay: 0, leadTimeDays: 14, bufferDays: 7, coverDays: 30 }).status).toBe("no demand");
  });
  it("a sale's cost snapshot and the stock check", () => {
    expect(costSnapshot({ unitCost: 1.31, packagingCost: 0.2, feePct: 12.8, priceEach: 9.99 })).toEqual({ unit_cost: 1.31, packaging_cost: 0.2, fee_pct: 12.8, fee_each: 1.28, cost_each: 2.79, profit_each: 7.2 });
    expect(canTake({ home: 5, fba: 0, tiktok_fbt: 0 }, "home", 6)).toMatch(/Only 5 in Self-ship/);
    expect(canTake({ home: 5, fba: 9, tiktok_fbt: 0 }, "fba", 1)).toMatch(/SP-API/);
    expect(canTake({ home: 5, fba: 0, tiktok_fbt: 0 }, "home", 5)).toBeNull();
  });
});

describe("StockPilot raw export", () => {
  const raw = JSON.parse(readFileSync(join(__dirname, "../../../docs/samples/stockpilot-raw.json"), "utf8"));
  const plan = planStockPilotRaw(raw, { "HEALTH-PILL-7DAY": "B0H9ZKYYHZ", "PET-CAR-HARNESS": "B0H9ZH3RV5" });
  const end = (sku: string) => {
    const it = plan.items.find((i) => i.sku === sku)!;
    const l = { home: 0, tiktok_fbt: 0 };
    for (const m of plan.movements.filter((x) => x.item_ref === it.ref)) l[m.bucket as "home" | "tiktok_fbt"] += m.quantity;
    return l;
  };
  it("3 items, matched to the Ads products by ASIN; the padlock has none and gets a SKU", () => {
    expect(plan.items.map((i) => [i.sku, i.asin])).toEqual([[expect.stringMatching(/^SP-0E0380C8$/), null], ["HEALTH-PILL-7DAY", "B0H9ZKYYHZ"], ["PET-CAR-HARNESS", "B0H9ZH3RV5"]]);
    expect(plan.items.every((i) => i.image_url == null || /^https?:/.test(i.image_url))).toBe(true);
  });
  it("opening balances plus the 2 transfers land exactly on StockPilot's levels", () => {
    expect(end("HEALTH-PILL-7DAY")).toEqual({ home: 57, tiktok_fbt: 36 });
    expect(end("PET-CAR-HARNESS")).toEqual({ home: 130, tiktok_fbt: 60 });
    expect(end("SP-0E0380C8")).toEqual({ home: 10, tiktok_fbt: 0 });
    expect(plan.movements.filter((m) => m.kind === "transfer_out" || m.kind === "transfer_in")).toHaveLength(4);
    const pill = plan.movements.filter((m) => m.item_ref === "seed-pill-organiser");
    expect(pill.map((m) => [m.kind, m.bucket, m.quantity, m.date])).toEqual([
      ["receipt", "home", 93, "2026-07-15"], ["transfer_out", "home", -36, "2026-07-15"], ["transfer_in", "tiktok_fbt", 36, "2026-07-15"],
    ]);
  });
  it("listings kept; FBA, photos and Amazon sales noted; ids stable for re-import", () => {
    expect(plan.listings.length).toBeGreaterThan(0);
    expect(plan.notes.join(" ")).toMatch(/Amazon FBA levels come from SP-API/);
    expect(planStockPilotRaw(raw).movements.map((m) => m.ref)).toEqual(planStockPilotRaw(raw).movements.map((m) => m.ref));
  });
});

describe("items CSV", () => {
  it("StockPilot's column names, a 0 is a 0", () => {
    const { plan, unknownColumns } = planItemsCsv("product_name,sku,cost_price,stock_quantity,reorder_level,supplier,colour\nTape,TAPE-1,0.50,0,0,Acme,red\n\"Box, large\",BOX-L,1.2,12,5,,\n");
    expect(plan.items.map((i) => [i.sku, i.name, i.unit_cost, i.reorder_level, i.exported.home])).toEqual([["TAPE-1", "Tape", 0.5, 0, 0], ["BOX-L", "Box, large", 1.2, 5, 12]]);
    expect(plan.movements).toHaveLength(1);
    expect(unknownColumns).toEqual(["colour"]);
  });
});
