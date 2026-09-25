import { describe, expect, it } from "vitest";
import { lineQty, planOrder, type PlanCandidate, type PlanControls } from "./plan";

let n = 0;
const c = (over: Partial<PlanCandidate> = {}): PlanCandidate => {
  const id = `p${++n}`;
  return {
    key: `${id}|${over.supplierKey ?? "s1"}`, productId: id, ean: `50${n}`, asin: `B0${n}`, title: `Item ${n}`, brand: "Brand",
    supplierKey: "s1", supplierName: "Henbrandt", supplierId: "s1", movGbp: null, unitCostGbp: 5, landedGbp: 6, profitUnit: 4,
    sellPrice: 20, shareMonth: 10, moq: null, step: 1, maxUnits: null, verdict: "pass", approvalOnly: false, ...over,
  };
};
const limits = { budget: 300, lineCap: 100, maxMonths: 3 };
const none = (): PlanControls => ({ pinned: new Set(), excluded: new Set(), qty: new Map() });

describe("line quantity", () => {
  it("the most within the line cap and the months limit, rounded to the case", () => {
    expect(lineQty(c(), limits)).toEqual({ qty: 16 });                       // £100 cap ÷ £6
    expect(lineQty(c({ shareMonth: 3 }), limits)).toEqual({ qty: 9 });       // 3 a month × 3 months
    expect(lineQty(c({ step: 6 }), limits)).toEqual({ qty: 12 });
    expect(lineQty(c({ maxUnits: 5 }), limits)).toEqual({ qty: 5 });
    // A month's profit is capped by what was bought: 5 in stock, 10 a month at your share.
    const p = planOrder([c({ maxUnits: 5 })], limits, none());
    expect(p.groups[0].lines[0]).toMatchObject({ qty: 5, profitMonth: 20, notes: ["only 5 in stock"] });
  });
  it("says why a line can't be bought", () => {
    expect(lineQty(c({ moq: 24 }), limits)).toEqual({ reason: "MOQ 24 × £6.00 is over the £100.00 line cap" });
    expect(lineQty(c({ moq: 12, shareMonth: 2 }), limits)).toEqual({ reason: "MOQ 12 takes 6.0 months to sell, over 3" });
    expect(lineQty(c({ shareMonth: null }), limits)).toEqual({ reason: "no sales share to size an order" });
  });
});

describe("planning", () => {
  it("takes the most profit a month per £ within the budget", () => {
    const best = c({ profitUnit: 8 }), mid = c({ profitUnit: 5 }), low = c({ profitUnit: 1 }), worst = c({ profitUnit: 0.5 });
    const p = planOrder([low, best, worst, mid], limits, none());
    const keys = p.groups.flatMap((g) => g.lines.map((x) => x.c.key));
    expect(keys).toEqual([best.key, mid.key, low.key]); // 3 × £96 = £288; the 4th doesn't fit
    expect(p.total).toBeCloseTo(288);
    expect(p.profitMonth).toBeCloseTo(10 * (8 + 5 + 1));
    expect(p.skipped.find((s) => s.c.key === worst.key)?.reason).toBe("doesn't fit the budget");
    expect(p.paybackMonths).toBeCloseTo(288 / (10 * (6 + 8) + 10 * (6 + 5) + 10 * (6 + 1)));
  });

  it("orders from a supplier only if its lines reach its MOV; otherwise spends elsewhere", () => {
    const big = { supplierKey: "big", supplierName: "Big MOV", supplierId: "big", movGbp: 500 };
    const a = c({ ...big, profitUnit: 9 }), b = c({ ...big, profitUnit: 9 });
    const other = c({ profitUnit: 2 });
    const p = planOrder([a, b, other], limits, none());
    expect(p.groups.map((g) => g.name)).toEqual(["Henbrandt"]);
    expect(p.skipped.find((s) => s.c.key === a.key)?.reason).toBe("Big MOV's MOV £500.00 not reachable within the budget");

    // Reachable: kept, topped up from the same supplier.
    const small = { supplierKey: "sm", supplierName: "Small MOV", supplierId: "sm", movGbp: 150 };
    const x = c({ ...small, profitUnit: 9 }), y = c({ ...small, profitUnit: 1 });
    const q = planOrder([x, y, c({ profitUnit: 5 })], limits, none());
    const g = q.groups.find((g) => g.name === "Small MOV")!;
    expect(g.movMet).toBe(true);
    expect(g.goods).toBeGreaterThanOrEqual(150);
  });

  it("one supplier per product: the better offer", () => {
    const cheap = c({ productId: "same", key: "same|s1", landedGbp: 5, profitUnit: 5 });
    const dear = c({ productId: "same", key: "same|s2", supplierKey: "s2", supplierName: "Other", landedGbp: 7, profitUnit: 3 });
    const p = planOrder([dear, cheap], limits, none());
    expect(p.groups.flatMap((g) => g.lines.map((x) => x.c.key))).toEqual(["same|s1"]);
    expect(p.skipped.find((s) => s.c.key === "same|s2")?.reason).toBe("bought from Henbrandt instead");
  });

  it("pins, excludes and your quantities", () => {
    const a = c({ profitUnit: 8 }), b = c({ profitUnit: 1, moq: 24 }), appr = c({ approvalOnly: true, verdict: "warn" });
    const ctl: PlanControls = { pinned: new Set([b.key]), excluded: new Set([a.key]), qty: new Map([[b.key, 20]]) };
    const p = planOrder([a, b, appr], limits, ctl);
    const line = p.groups[0].lines[0];
    expect(line.c.key).toBe(b.key);
    expect(line.qty).toBe(24); // raised to the MOQ
    expect(line.notes).toEqual(["raised to 24 (MOQ / case of 1)", "£144.00, over the £100.00 line cap"]);
    expect(p.skipped.find((s) => s.c.key === a.key)?.reason).toBe("excluded by you");
    // Approval-only products aren't planned (they're listed separately).
    expect(p.groups.flatMap((g) => g.lines).some((x) => x.c.key === appr.key)).toBe(false);
  });
});
