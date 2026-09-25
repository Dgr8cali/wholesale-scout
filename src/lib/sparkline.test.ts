import { describe, expect, it } from "vitest";
import { sampleSeries } from "./sparkline";

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 25);

describe("sampleSeries", () => {
  it("reads the value in force at each sample, carrying steps forward", () => {
    const s: [number, number | null][] = [[now - 200 * DAY, 10], [now - 45 * DAY, 20], [now - 10 * DAY, 30]];
    const out = sampleSeries(s, now, 90, 10)!;
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(10); // the point from before the window is in force at its start
    expect(out[4]).toBe(10); // day -50
    expect(out[5]).toBe(20); // day -40
    expect(out[9]).toBe(30);
  });

  it("treats null, negative and non-finite values as gaps, and all-gap as no data", () => {
    const s: [number, number | null][] = [[now - 80 * DAY, 5], [now - 40 * DAY, null], [now - 20 * DAY, -1]];
    const out = sampleSeries(s, now, 90, 10)!;
    expect(out.slice(0, 2)).toEqual([null, 5]);
    expect(out.slice(6)).toEqual([null, null, null, null]);
    expect(sampleSeries([[now - 10 * DAY, null]], now)).toBeNull();
    expect(sampleSeries([], now)).toBeNull();
    expect(sampleSeries(null, now)).toBeNull();
  });

  it("orders unsorted points first", () => {
    const out = sampleSeries([[now - DAY, 2], [now - 100 * DAY, 1]], now, 90, 3)!;
    expect(out).toEqual([1, 1, 2]);
  });
});
