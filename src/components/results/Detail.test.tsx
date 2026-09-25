import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Detail } from "./Detail";
import type { Result } from "./types";

const offer = (seller: string, price: number, mov: number) => ({ qid: `q-${seller}`, seller, unit: 1, inventory: 500, deliveryWeeks: 1, basePrice: price, baseMov: mov, tiers: [{ price, mov }] });

describe("expanded row: Qogita offers", () => {
  it("lists every supplier's offer, cheapest first, and highlights the one that fits the budget", () => {
    const r = {
      id: "r1", status: "done", verdict: "pass", failed_gate: null, gate_outcomes: [], fees: null, sell_price: 20, price_source: null, landed_cost: 8,
      profit: 5, roi: 60, margin: 25, hurdle_price: null, score: 70, group_scores: null, why: null, band: "amber", offer_count: 1, error: null,
      product: { ean: "1", asin: "B000000001", title: "x", brand: null, category: null }, offer: null,
      inputs: { qogita: { fid: "f", currency: "EUR", fxRate: 0.86, fetchedAt: "2026-09-25T12:00:00Z", movLimit: 500, excluded: 6, chosen: "q-1VK6YM", reason: "Cheapest offer, and its MOV fits the budget",
        offers: [offer("74ZGGG", 9.04, 500), offer("1VK6YM", 9.01, 500)] } },
    } as unknown as Result;
    const html = renderToStaticMarkup(<Detail r={r} onNote={() => {}} onWaive={async () => {}} />);
    expect(html).toContain("Qogita offers (2)");
    expect(html).toContain("6 left out by the €500.00 MOV limit");
    expect(html.indexOf("1VK6YM")).toBeLessThan(html.indexOf("74ZGGG"));
    expect(html).toMatch(/1VK6YM<\/span><span[^>]*>fits the budget/);
    expect(html).toContain("€9.01");
  });
});
