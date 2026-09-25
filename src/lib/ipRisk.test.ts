import { describe, expect, it } from "vitest";
import { ipIndex, ipRiskText, matchIpRisk, parseIpCsv, type IpRiskBrand } from "./ipRisk";

const LIST: IpRiskBrand[] = [
  { brand: "The North Face", aliases: ["North Face", "TNF"], level: "high", note: "Counterfeit complaints", source: "seed, unverified", reported_on: null },
  { brand: "Ray-Ban", aliases: [], level: "medium", note: null, source: null, reported_on: null },
  { brand: "Apple", aliases: [], level: "high", note: "IP complaints", source: null, reported_on: null },
];

describe("IP-risk matching", () => {
  const idx = ipIndex(LIST);
  it("matches the brand or an alias, whatever the case or punctuation", () => {
    expect(matchIpRisk(idx, "the north face")?.brand).toBe("The North Face");
    expect(matchIpRisk(idx, "TNF")?.level).toBe("high");
    expect(matchIpRisk(idx, "RAYBAN")?.brand).toBe("Ray-Ban");
    expect(matchIpRisk(idx, "Ray Ban")?.brand).toBe("Ray-Ban");
  });
  it("matches the brand field, never words inside another brand", () => {
    expect(matchIpRisk(idx, "Apple Cider Co")).toBeNull();
    expect(matchIpRisk(idx, null, "Apple")?.brand).toBe("Apple"); // falls back to the offer's brand
    expect(matchIpRisk(idx, "Nuxe")).toBeNull();
  });
  it("reads as the why line wants it", () => {
    expect(ipRiskText(matchIpRisk(idx, "TNF")!)).toBe("IP risk (high): Counterfeit complaints");
    expect(ipRiskText(matchIpRisk(idx, "Ray-Ban")!)).toBe("IP risk (medium)");
  });
});

describe("IP-risk CSV import", () => {
  it("reads a header in any order, quoted cells, aliases and UK dates", () => {
    const r = parseIpCsv([
      "Level,Brand,Notes,Date,Aliases",
      'high,"Nike, Inc.","Test buys, then complaints",25/09/2026,Nike Golf; Jordan',
      "m,Olaplex,,2026-09-01,",
    ].join("\n"), { source: "community list" });
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { brand: "Nike, Inc.", level: "high", note: "Test buys, then complaints", source: "community list", reported_on: "2026-09-25", aliases: ["Nike Golf", "Jordan"] },
      { brand: "Olaplex", level: "medium", note: null, source: "community list", reported_on: "2026-09-01", aliases: [] },
    ]);
  });
  it("takes one brand per line with no header; level defaults to medium", () => {
    expect(parseIpCsv("Crocs\nYeti\n# comment\n").rows.map((r) => [r.brand, r.level])).toEqual([["Crocs", "medium"], ["Yeti", "medium"]]);
  });
  it("says which lines it couldn't read", () => {
    const r = parseIpCsv("brand,level\nCrocs,extreme\n,high\nCrocs,low\ncrocs,high");
    expect(r.rows.map((x) => x.brand)).toEqual(["Crocs"]);
    expect(r.errors).toEqual(['line 2: level "extreme" isn\'t low, medium or high', "line 3: no brand", "line 5: crocs is already listed"]);
  });
});
