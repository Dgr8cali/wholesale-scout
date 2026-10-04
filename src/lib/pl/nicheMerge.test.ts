import { describe, expect, it } from "vitest";
import { mergeGroup, nicheKey, type MergeRow } from "./nicheMerge";

const row = (o: Partial<MergeRow>): MergeRow => ({ id: "a", customer_need: "pool heater", categories: ["DIY & Tools"], status: "new", notes: null, shape: null, candidate_id: null, extra: { aliases: [] }, keepa_by_day: {}, created_at: "2026-10-04T10:00:00Z", ...o });

describe("one niche across categories", () => {
  it("the key: the same search terms (any order or case) and the same search volume", () => {
    expect(nicheKey(["Pool Heater", "solar pool heater", "pool heater"], 380388)).toBe(nicheKey(["solar pool heater", "pool heater"], 380388));
    expect(nicheKey(["pool heater"], 380388)).not.toBe(nicheKey(["pool heater"], 380389));
    expect(nicheKey([], 1)).toBeNull();
  });
  it("keeps the oldest row, with every category, the further status, both notes, the shape, summed Keepa", () => {
    const m = mergeGroup([
      row({ id: "diy", categories: ["DIY & Tools"], notes: "check the 6kW ones", keepa_by_day: { "2026-10-04": 31 }, extra: { aliases: ["swimming pool heater"] } }),
      row({ id: "gdn", customer_need: "pool heaters", categories: ["Garden"], status: "shortlisted", shape: "open", extra: { incumbents: { term: "pool heater" } }, keepa_by_day: { "2026-10-04": 5, "2026-10-05": 9 }, created_at: "2026-10-05T10:00:00Z" }),
    ]);
    // The shortlisted one is further along: it's kept, though newer.
    expect(m.keep.id).toBe("gdn");
    expect(m.drop).toEqual(["diy"]);
    expect(m.patch).toMatchObject({
      categories: ["Garden", "DIY & Tools"], status: "shortlisted", shape: "open", notes: "check the 6kW ones",
      keepa_by_day: { "2026-10-04": 36, "2026-10-05": 9 },
      extra: { aliases: ["pool heater", "swimming pool heater"], incumbents: { term: "pool heater" } },
    });
  });
  it("a candidate always wins; ties go to the oldest; notes are joined", () => {
    expect(mergeGroup([row({ id: "x", status: "shortlisted" }), row({ id: "y", candidate_id: "c1", status: "dismissed" })]).keep.id).toBe("y");
    const m = mergeGroup([row({ id: "late", notes: "b", created_at: "2026-10-05T00:00:00Z" }), row({ id: "early", notes: "a" })]);
    expect(m.keep.id).toBe("early");
    expect(m.patch.notes).toBe("a\n\nb");
  });
});
