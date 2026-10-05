import { describe, expect, it } from "vitest";
import { defaultReference, listingAge } from "./fill";

describe("Gate 2's reference listing", () => {
  it("defaults to the longest Keepa history; ties and unknowns by position", () => {
    const a = (asin: string, position: number, first_seen: string | null) => ({ asin, position, first_seen });
    expect(defaultReference([a("NEW", 1, "2026-03-03"), a("OLD", 6, "2022-07-07"), a("MID", 2, "2023-06-21")])).toBe("OLD");
    expect(defaultReference([a("X", 2, null), a("Y", 1, null)])).toBe("Y");
    expect(defaultReference([a("X", 2, "2020-01-01"), a("Y", 1, "2020-01-01")])).toBe("Y");
    expect(defaultReference([])).toBeNull();
  });

  it("listing age", () => {
    const now = Date.parse("2026-10-05");
    expect(listingAge("2026-03-03", now)).toMatchObject({ text: "7 mths" });
    expect(listingAge("2022-07-07", now)?.text).toBe("4 yrs 2 mths");
    expect(listingAge("2026-09-20", now)?.text).toBe("2 wks");
    expect(listingAge(null)).toBeNull();
  });
});
