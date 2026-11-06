import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTestSet } from "./testSet";

describe("parseTestSet", () => {
  it("the committed set has 20 products: 6 branded, 6 generic, 8 manufacturer", () => {
    const items = parseTestSet(JSON.parse(readFileSync("scripts/supplier-spike/test-set.json", "utf8")));
    expect(items).toHaveLength(20);
    expect(new Set(items.map((i) => i.id)).size).toBe(20);
    expect(items.filter((i) => i.kind === "branded")).toHaveLength(6);
    expect(items.filter((i) => i.kind === "generic")).toHaveLength(6);
    expect(items.filter((i) => i.kind === "manufacturer")).toHaveLength(8);
  });

  it("rejects an unknown kind and names the entry", () => {
    expect(() => parseTestSet([{ id: "x", query: "y", kind: "other" }])).toThrow(/x/);
  });

  it("rejects a repeated id", () => {
    expect(() => parseTestSet([{ id: "x", query: "y", kind: "generic" }, { id: "x", query: "z", kind: "generic" }])).toThrow(/x/);
  });
});
