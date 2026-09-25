import { describe, expect, it } from "vitest";
import { asinFromUrl, parseCheckInput } from "./parse";

describe("asinFromUrl", () => {
  it.each([
    ["https://www.amazon.co.uk/Avene-Thermal-Spring-Water-150ml/dp/B003AVM7XE/ref=sr_1_1?crid=X", "B003AVM7XE"],
    ["https://www.amazon.co.uk/gp/product/B0C62XSQS9?th=1", "B0C62XSQS9"],
    ["https://amazon.co.uk/dp/b0c62xsqs9", "B0C62XSQS9"],
    ["https://www.amazon.co.uk/gp/aw/d/B0F2HKZMPT", "B0F2HKZMPT"],
    ["https://www.amazon.co.uk/s?k=avene", null],
  ])("%s", (u, a) => expect(asinFromUrl(u)).toBe(a));
});

describe("parseCheckInput", () => {
  it("reads ASINs, EANs and links, with or without a cost", () => {
    const r = parseCheckInput([
      "B003AVM7XE",
      "b0c62xsqs9, 4.73",
      "3337875597197\t£6,20",
      "https://www.amazon.co.uk/dp/B0F2HKZMPT/ref=x 12.5",
      "",
      "# a comment",
    ].join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.lines).toEqual([
      { kind: "asin", code: "B003AVM7XE", landedGbp: null, line: 1 },
      { kind: "asin", code: "B0C62XSQS9", landedGbp: 4.73, line: 2 },
      { kind: "ean", code: "3337875597197", landedGbp: 6.2, line: 3 },
      { kind: "asin", code: "B0F2HKZMPT", landedGbp: 12.5, line: 4 },
    ]);
  });

  it("says which lines it couldn't read, and skips repeats", () => {
    const r = parseCheckInput("hello\nB003AVM7XE abc\nB003AVM7XE\nB003AVM7XE\nhttps://www.amazon.co.uk/s?k=x");
    expect(r.lines.map((l) => l.code)).toEqual(["B003AVM7XE"]);
    expect(r.errors).toEqual([
      'line 1: "hello" isn\'t an ASIN, EAN or Amazon link',
      'line 2: "abc" isn\'t a cost',
      "line 4: B003AVM7XE is already listed",
      "line 5: no ASIN in that link",
    ]);
  });

  it("takes a 10-digit ISBN as an ASIN", () => {
    expect(parseCheckInput("014103614X").lines[0]).toMatchObject({ kind: "asin", code: "014103614X" });
  });
});
