import { describe, expect, it } from "vitest";
import { compareValues, dateOf, firstDir, inferKind, nextSort, numberOf, parseStoredSort, sortRows } from "./sort";

describe("table sorting", () => {
  it("reads numbers the way tables show them", () => {
    expect(["≥ 201", "£1,234.50", "45%", "−3", "12", "1.2k", "~40"].map(numberOf)).toEqual([201, 1234.5, 45, -3, 12, 1200, 40]);
    expect(["abc", "B0H9ZKYYHZ", "10 Aug", "", null].map(numberOf)).toEqual([null, null, null, null, null]);
  });

  it("works out a column's kind", () => {
    expect(inferKind([3, "≥ 201", "£4", null, "—"])).toBe("number");
    expect(inferKind(["2026-10-02", "2026-09-30T12:00:00Z", null])).toBe("date");
    expect(inferKind(["pill box", "12"])).toBe("text");
    expect(dateOf("2026-10-02")).toBe(Date.UTC(2026, 9, 2));
  });

  it("numbers numerically, blanks last either way", () => {
    const rows = ["9", "≥ 201", null, "10", "—", "100"];
    expect(sortRows(rows, (r) => r, "number", "desc")).toEqual(["≥ 201", "100", "10", "9", null, "—"]);
    expect(sortRows(rows, (r) => r, "number", "asc")).toEqual(["9", "10", "100", "≥ 201", null, "—"]);
  });

  it("text A–Z (numbers inside text in order), dates newest first", () => {
    expect(sortRows(["b", "A", "a10", "a9", ""], (r) => r, "text", "asc")).toEqual(["A", "a9", "a10", "b", ""]);
    expect(sortRows(["2026-01-02", null, "2026-10-02"], (r) => r, "date", "desc")).toEqual(["2026-10-02", "2026-01-02", null]);
    expect(compareValues(2, 1, "number", "asc")).toBeGreaterThan(0);
  });

  it("first click: numbers and dates descending, text ascending; the second flips; stable", () => {
    expect([firstDir("number"), firstDir("date"), firstDir("text")]).toEqual(["desc", "desc", "asc"]);
    expect(nextSort(null, "clicks", "number")).toEqual({ key: "clicks", dir: "desc" });
    expect(nextSort({ key: "clicks", dir: "desc" }, "clicks", "number")).toEqual({ key: "clicks", dir: "asc" });
    expect(nextSort({ key: "clicks", dir: "asc" }, "name", "text")).toEqual({ key: "name", dir: "asc" });
    const rows = [{ k: "a", v: 1 }, { k: "b", v: 1 }, { k: "c", v: 2 }];
    expect(sortRows(rows, (r) => r.v, "number", "desc").map((r) => r.k)).toEqual(["c", "a", "b"]);
  });

  it("remembered sorts are checked", () => {
    expect(parseStoredSort('{"key":"cost","dir":"desc"}', ["cost"])).toEqual({ key: "cost", dir: "desc" });
    expect(parseStoredSort('{"key":"gone","dir":"desc"}', ["cost"])).toBeNull();
    expect(parseStoredSort("not json")).toBeNull();
    expect(parseStoredSort('{"key":"cost","dir":"up"}')).toBeNull();
  });
});
