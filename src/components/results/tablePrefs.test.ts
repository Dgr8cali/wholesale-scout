import { describe, expect, it } from "vitest";
import { isShown, normalizePrefs, pickerSummary, setShown, shiftColumn, visibilityOf } from "./tablePrefs";

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

describe("the column picker", () => {
  const all = ["select", "product", "verdict", "profit", "roi", "score", "why"];
  const defaults = ["product", "verdict", "profit", "roi"];
  const fixed = ["select", "product"];
  const base = normalizePrefs(null, all);

  it("shows the page's default set until you choose otherwise", () => {
    expect(visibilityOf(base, all, defaults, fixed)).toEqual({ select: true, product: true, verdict: true, profit: true, roi: true, score: false, why: false });
    const p = setShown(setShown(base, "score", true, fixed), "roi", false, fixed);
    expect(isShown(p, "score", defaults, fixed)).toBe(true);
    expect(isShown(p, "roi", defaults, fixed)).toBe(false);
    expect(pickerSummary(p, all, defaults, fixed)).toEqual({ hidden: 1, added: 1 });
  });

  it("never hides a fixed column", () => {
    const p = setShown(base, "product", false, fixed);
    expect(p).toBe(base);
    expect(isShown({ ...base, visibility: { product: false } }, "product", defaults, fixed)).toBe(true);
  });

  it("reorders the movable columns, fixed ones staying in front", () => {
    const p = shiftColumn(base, "profit", -1, fixed);
    expect(p.order).toEqual(["select", "product", "profit", "verdict", "roi", "score", "why"]);
    expect(shiftColumn(p, "profit", -1, fixed).order).toEqual(["select", "product", "profit", "verdict", "roi", "score", "why"]);
    expect(shiftColumn(base, "why", 1, fixed)).toBe(base);
    expect(shiftColumn(base, "product", 1, fixed)).toBe(base);
  });

  it("survives a save and reload", () => {
    const p = shiftColumn(setShown(base, "why", true, fixed), "why", -1, fixed);
    const back = normalizePrefs(JSON.parse(JSON.stringify(p)), all);
    expect(visibilityOf(back, all, defaults, fixed).why).toBe(true);
    expect(back.order.slice(-2)).toEqual(["why", "score"]);
  });
});
