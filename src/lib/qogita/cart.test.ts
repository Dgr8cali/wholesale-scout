import { describe, expect, it } from "vitest";
import { cartView, quantityForBudget, validQuantity } from "./cart";
import type { QogitaClient } from "./client";

describe("Qogita cart", () => {
  it("defaults to the most whole cases the budget buys, within stock, at least one case", () => {
    expect(quantityForBudget(300, 7.5, 6, 1000)).toBe(36); // 40 units fit; 6 cases of 6
    expect(quantityForBudget(300, 7.5, 6, 20)).toBe(18); // stock allows 3 cases
    expect(quantityForBudget(10, 7.5, 6, 1000)).toBe(6); // under a case fits: one case
    expect(quantityForBudget(300, null, 12, 1000)).toBe(12);
  });

  it("accepts only whole cases", () => {
    expect(validQuantity("24", 12)).toBe(24);
    expect(() => validQuantity(10, 12)).toThrow(/multiple of the case size \(12\)/);
    expect(() => validQuantity(0, 1)).toThrow(/above zero/);
  });

  it("joins each allocation with its lines", async () => {
    const q = {
      allocations: async () => [{ qid: "A1", fid: "J3QXWV", mov: { amount: "500.00", currency: "EUR" }, subtotal: { amount: "511.20", currency: "EUR" }, movProgress: "1.00", isMovMet: true, estimatedDeliveryTime: null }],
      allocationLines: async () => [{
        qid: "L1", offerQid: "O1", quantity: 80, unit: 1, availableQuantity: 543,
        activeTierPrice: { amount: "6.39", currency: "EUR" }, subtotal: { amount: "511.20", currency: "EUR" },
        variant: { name: "Dettol 0.25L Multicolor Soap Dispenser", gtin: "5997321780351" }, warnings: [{ status: "PRICE_DECREASED", previousValue: "6.45" }],
      }],
    } as unknown as QogitaClient;
    const v = await cartView(q);
    expect(v[0]).toMatchObject({ qid: "A1", movProgress: 1, isMovMet: true });
    expect(v[0].lines[0]).toMatchObject({ qid: "L1", offerQid: "O1", name: "Dettol 0.25L Multicolor Soap Dispenser", quantity: 80, warnings: ["price went down (was 6.45)"] });
  });
});
