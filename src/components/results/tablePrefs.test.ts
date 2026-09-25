import { describe, expect, it } from "vitest";
import { normalizePrefs } from "./tablePrefs";

const cols = ["select", "product", "verdict", "score", "profit", "why"];

describe("normalizePrefs", () => {
  it("defaults when nothing is saved", () => {
    expect(normalizePrefs(null, cols)).toEqual({ visibility: {}, order: cols, sizing: {}, density: "comfortable" });
    expect(normalizePrefs("junk", cols).order).toEqual(cols);
  });

  it("keeps the saved order, drops unknown columns and slots new ones after their default neighbour", () => {
    const p = normalizePrefs({ order: ["select", "product", "profit", "gone", "score", "why", "profit"] }, cols);
    expect(p.order).toEqual(["select", "product", "verdict", "profit", "score", "why"]);
  });

  it("keeps visibility and widths for known columns, clamped, and the density", () => {
    const p = normalizePrefs({ visibility: { why: false, gone: false, score: "no" }, sizing: { product: 9999, score: 50.4, gone: 10 }, density: "compact" }, cols, { product: { min: 200, max: 600 } });
    expect(p.visibility).toEqual({ why: false });
    expect(p.sizing).toEqual({ product: 600, score: 50 });
    expect(p.density).toBe("compact");
  });
});
