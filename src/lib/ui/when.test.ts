import { describe, expect, it } from "vitest";
import { ago, amazonLastSeen, isStale, stamp } from "./when";

const now = Date.parse("2026-09-25T20:14:00Z");
describe("times", () => {
  it("how long ago", () => {
    expect(ago("2026-09-25T20:13:40Z", now)).toBe("just now");
    expect(ago("2026-09-25T19:50:00Z", now)).toBe("24 min ago");
    expect(ago("2026-09-25T18:00:00Z", now)).toBe("2 h ago");
    expect(ago("2026-09-24T18:00:00Z", now)).toBe("1 day ago");
    expect(ago(null, now)).toBeNull();
  });
  it("a reading's time in UK time, stale after 7 days", () => {
    expect(stamp("2026-09-25T20:14:00Z", now)).toMatch(/^25 Sept? 21:14$/);
    expect(stamp("2025-12-01T10:00:00Z", now)).toMatch(/^1 Dec 2025 10:00$/);
    expect(isStale("2026-09-19T20:00:00Z", now)).toBe(false);
    expect(isStale("2026-09-18T20:00:00Z", now)).toBe(true);
  });
  it("Amazon last seen: a date and days ago, from Keepa's date or the days before the check", () => {
    expect(amazonLastSeen(3, "2026-09-12T10:00:00Z", null, now)?.label).toMatch(/^last seen 12 Sept? 2026 \(13 days ago\)$/);
    // An older snapshot: 10 days before a check on 20 Sept.
    expect(amazonLastSeen(10, null, "2026-09-20T12:00:00Z", now)?.label).toMatch(/^last seen 10 Sept? 2026 \(15 days ago\)$/);
    expect(amazonLastSeen(10, null, null, now)?.label).toBe("last seen 10 days ago");
    expect(amazonLastSeen(null, null, "2026-09-20T12:00:00Z", now)).toBeNull();
  });
});
