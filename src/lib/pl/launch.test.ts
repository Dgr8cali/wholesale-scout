import { describe, expect, it } from "vitest";
import { budgetTracker, nextStep, statusFromSteps, type LaunchStep } from "./launch";

const done = (step: string, spend: number | null = null): LaunchStep => ({ step, done: true, done_on: "2026-10-02", note: null, spend });

describe("launch checklist", () => {
  it("status follows the steps, forwards only, never off dropped", () => {
    expect(statusFromSteps("draft", [])).toBe("draft");
    expect(statusFromSteps("draft", [done("trademark_filed")])).toBe("researching");
    expect(statusFromSteps("researching", [done("samples_ordered")])).toBe("samples");
    expect(statusFromSteps("samples", [done("samples_ordered"), done("listing_live")])).toBe("launched");
    expect(statusFromSteps("launched", [])).toBe("launched");
    expect(statusFromSteps("dropped", [done("listing_live")])).toBe("dropped");
  });
  it("the next step is the first not done", () => {
    expect(nextStep([])!.key).toBe("samples_ordered");
    expect(nextStep([done("samples_ordered"), done("samples_received")])!.label).toBe("Sample chosen");
  });
  it("budget: Gate 7's lines against the spend entered on the steps", () => {
    const b = budgetTracker({ stock: 600, samples: 60, inspection: 120, photography: 100, trademark: 170, launchAds: 300 }, [done("samples_ordered", 45), done("trademark_filed", 170), done("po_placed", 300), done("shipped", 250)], 1000);
    expect(b.rows.find((r) => r.line === "stock")).toMatchObject({ planned: 600, actual: 550 });
    expect(b.rows.find((r) => r.line === "buffer")!.planned).toBeCloseTo(135);
    expect(b.plannedTotal).toBeCloseTo(1485);
    expect(b.spent).toBe(765);
    expect(b.spentRatio).toBeCloseTo(0.765);
  });
});
