import { describe, expect, it } from "vitest";
import { reviewBoxes } from "./reviewBoxes";

const MOUSE = ["B089XYF1HQ", "B0CPDBHHJT", "B08X7L9RL3", "B0FSSXX8H2", "B0CVSDJ4NJ", "B0FY3H7Y9R"];

describe("Gate 4's review boxes", () => {
  it("one box for every ASIN on the candidate, in order, no cap of five", () => {
    const b = reviewBoxes(MOUSE.map((asin, i) => ({ asin, brand: i === 0 ? "ROSHIELD" : null })), []);
    expect(b.map((x) => x.asin)).toEqual(MOUSE);
    expect(b[0]).toEqual({ asin: "B089XYF1HQ", brand: "ROSHIELD", state: "on" });
    expect(b[5]).toEqual({ asin: "B0FY3H7Y9R", brand: null, state: "on" });
    expect(reviewBoxes(Array.from({ length: 10 }, (_, i) => ({ asin: `B0TEST000${i}` })), [])).toHaveLength(10);
  });

  it("adding an ASIN adds its box", () => {
    const before = reviewBoxes(MOUSE.slice(0, 5).map((asin) => ({ asin })), []);
    const after = reviewBoxes(MOUSE.map((asin) => ({ asin })), []);
    expect([before.length, after.length]).toEqual([5, 6]);
    expect(after.at(-1)!.asin).toBe("B0FY3H7Y9R");
  });

  it("saved reviews for an ASIN not on the candidate keep a box: removed, waiting, or kept separate", () => {
    const b = reviewBoxes(MOUSE.slice(0, 2).map((asin) => ({ asin })), [
      { asin: "B089XYF1HQ" },
      { asin: "B0FY3H7Y9R" },
      { asin: "B0CVSDJ4NJ", removed_at: "2026-10-06T10:00:00Z" },
      { asin: "B0SEPARATE", kept_separate: true, removed_at: "2026-10-06T10:00:00Z" },
    ]);
    expect(b.map((x) => [x.asin, x.state])).toEqual([
      ["B089XYF1HQ", "on"], ["B0CPDBHHJT", "on"], ["B0FY3H7Y9R", "pending"], ["B0CVSDJ4NJ", "removed"], ["B0SEPARATE", "separate"],
    ]);
  });
});
