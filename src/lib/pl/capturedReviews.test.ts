import { describe, expect, it } from "vitest";
import { cleanCaptured, mergeCaptured, renderCaptured, starCounts } from "./capturedReviews";
import { splitReviews } from "./reviews";

const raw = [
  { id: "R1AAAAAAAA", stars: 1, date: "Reviewed in the United Kingdom on 2 September 2026", title: "Lid snapped", body: "The lid snapped clean off after ten days.", variant: "Colour: Blue | Size: Large", helpful: 12 },
  { id: "R2BBBBBBBB", stars: 3, date: "Reviewed in the United Kingdom on 30 August 2026", title: "Too small", body: "Compartments too small, my capsules barely fit.", variant: "Material Type: Plastic", helpful: 1 },
  { id: "R3CCCCCCCC", stars: 5, date: null, title: "Love it", body: "Perfect.", variant: null, helpful: null },
  { id: "bad id!", stars: 9, title: "", body: "No stars read on this one" },
  { stars: 2, title: "", body: "   " },
];

describe("reviews captured by the extension", () => {
  it("cleans: stars 1–5 or none, empty ones dropped, a key for reviews without an id", () => {
    const c = cleanCaptured(raw);
    expect(c).toHaveLength(4);
    expect(c[3]).toMatchObject({ stars: null, body: "No stars read on this one" });
    expect(c[3].id).toMatch(/^t:/);
    expect(starCounts(c)).toEqual({ 1: 1, 3: 1, 5: 1, "?": 1 });
  });

  it("renders 1–3★ in Amazon's layout, which the miner splits back with stars, titles and bodies only", () => {
    const text = renderCaptured(cleanCaptured(raw));
    expect(text).not.toContain("Love it");
    expect(text).not.toContain("Material Type");
    const back = splitReviews("B0TEST0001", text);
    // 5★ and the one whose stars weren't read stay out; variant and helpful lines are skipped as noise.
    expect(back.map((r) => [r.stars, r.title, r.body])).toEqual([
      [1, "Lid snapped", "The lid snapped clean off after ten days."],
      [3, "Too small", "Compartments too small, my capsules barely fit."],
    ]);
  });

  it("merges by review id: a resend adds only the new ones", () => {
    const a = cleanCaptured(raw.slice(0, 2));
    const m = mergeCaptured(a, cleanCaptured(raw.slice(1, 3)));
    expect(m).toMatchObject({ added: 1 });
    expect(m.reviews.map((r) => r.id)).toEqual(["R1AAAAAAAA", "R2BBBBBBBB", "R3CCCCCCCC"]);
  });
});
