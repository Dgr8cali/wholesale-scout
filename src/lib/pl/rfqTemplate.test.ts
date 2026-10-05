import { describe, expect, it } from "vitest";
import { DEFAULT_RFQ_TEMPLATE, renderRfq, rfqVars } from "./rfqTemplate";

describe("RFQ template", () => {
  it("fills the candidate in, with the fixed closing", () => {
    const t = renderRfq(DEFAULT_RFQ_TEMPLATE, rfqVars({ name: "Lens cleaning wipes", niche_keyword: "lens wipes" }, { sixWordsText: "the only wipes that leave no streaks", spec: "6×12 cm, 100 per box" }, 1.29, 1000, "box"));
    expect(t).toContain("I'm sourcing lens wipes");
    expect(t).toContain("What makes ours different: the only wipes that leave no streaks");
    expect(t).toContain("Target price: £1.29 per box, ex-works");
    expect(t).toContain("First order: up to 1,000 units");
    expect(t).toContain("6×12 cm, 100 per box");
    expect(t).toContain("FOB price at your MOQ and at 2× MOQ (about 2,000 units)");
    for (const ask of ["Unit weight", "Carton dimensions", "lead time", "Sample cost", "SDS, REACH"]) expect(t).toContain(ask);
  });

  it("leaves out lines with nothing to say (or an unknown placeholder)", () => {
    const t = renderRfq(DEFAULT_RFQ_TEMPLATE, rfqVars({ name: "Pill box", niche_keyword: null }, {}, null, 500, "piece"));
    expect(t).not.toContain("What makes ours different");
    expect(t).not.toContain("Target price");
    expect(t).not.toMatch(/\n\n\n/);
    expect(t).not.toContain("Specification");
    expect(renderRfq("Hi {{who}}\nFor {{product}}", { product: "x" })).toBe("For x");
  });
});
