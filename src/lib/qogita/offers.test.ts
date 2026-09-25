import { describe, expect, it } from "vitest";
import type { QogitaOffer } from "./client";
import { chooseOffer, toSupplierOffer, type SupplierOffer } from "./offers";

const money = (amount: number) => ({ amount: amount.toFixed(2), currency: "EUR" });
const raw = (seller: string, tiers: [number, number][], over: Partial<QogitaOffer> = {}): QogitaOffer => ({
  qid: `q-${seller}`, unit: 1, inventory: 100, seller, estimatedDeliveryTime: 1,
  tieredPrices: tiers.map(([p, m]) => ({ tierPrice: money(p), tierMov: money(m) })), ...over,
});

describe("Qogita offers", () => {
  it("reads the entry tier (smallest MOV) as the base price and MOV", () => {
    const o = toSupplierOffer(raw("74ZGGG", [[8.73, 15000], [8.81, 10000], [8.9, 5000], [8.99, 1500], [9.04, 500]]))!;
    expect(o).toMatchObject({ seller: "74ZGGG", basePrice: 9.04, baseMov: 500, unit: 1, inventory: 100, deliveryWeeks: 1 });
    expect(o.tiers).toHaveLength(5);
  });

  it("chooses the cheapest offer whose MOV fits the budget", () => {
    const offers = [raw("A", [[8.53, 15000]]), raw("B", [[9.01, 500]]), raw("C", [[9.5, 250]])].map((x) => toSupplierOffer(x)!) as SupplierOffer[];
    const r = chooseOffer(offers, 1000, 0.86); // £1000 budget: A's €15,000 MOV doesn't fit
    expect(r.chosen?.seller).toBe("B");
    expect(r.reason).toBe("Cheapest offer whose MOV fits the budget (1 cheaper one doesn't)");
  });

  it("skips suppliers without a full case in stock", () => {
    const offers = [raw("A", [[5, 100]], { unit: 12, inventory: 6 }), raw("B", [[6, 100]], { unit: 12, inventory: 48 })].map((x) => toSupplierOffer(x)!);
    expect(chooseOffer(offers, 1000, 0.86).chosen?.seller).toBe("B");
  });

  it("keeps the cheapest and says so when no MOV fits", () => {
    const offers = [raw("A", [[8.53, 15000]]), raw("B", [[9, 5000]])].map((x) => toSupplierOffer(x)!);
    const r = chooseOffer(offers, 1000, 0.86);
    expect(r.chosen?.seller).toBe("A");
    expect(r.reason).toMatch(/No supplier's MOV fits the budget/);
    expect(chooseOffer([], 1000, 0.86)).toEqual({ chosen: null, reason: "No supplier offers" });
  });
});
