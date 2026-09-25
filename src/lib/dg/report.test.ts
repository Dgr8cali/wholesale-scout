import { describe, expect, it } from "vitest";
import { dgLookupText, dgStatusOf, parseDgReport } from "./report";

describe("Seller Central's DG lookup file", () => {
  it("reads Amazon's wording as a status", () => {
    expect(dgStatusOf("Not dangerous goods")).toBe("not_dg");
    expect(dgStatusOf("Non-DG")).toBe("not_dg");
    expect(dgStatusOf("Dangerous goods - fulfillable")).toBe("dg_fulfillable");
    expect(dgStatusOf("Hazmat")).toBe("dg_fulfillable");
    expect(dgStatusOf("Dangerous goods – not eligible for FBA")).toBe("dg_not_fulfillable");
    expect(dgStatusOf("Under review")).toBe("review_required");
    expect(dgStatusOf("More information needed: upload SDS")).toBe("review_required");
    expect(dgStatusOf("Something new")).toBe("unknown");
  });

  it("finds the columns by header, one status per ASIN, and says what it didn't understand", () => {
    const rows = [
      ["Dangerous goods lookup results"],
      [],
      ["ASIN", "Product name", "Dangerous goods classification", "Program"],
      ["B0AERO0001", "Brite Dry Shampoo", "Dangerous goods - fulfillable", "FBA"],
      ["B0SOAP0002", "Bar soap", "Not dangerous goods", "Pan-European FBA"],
      ["B0CHEM0003", "Cleaner", "Review required", null],
      ["B0ODD00004", "Thing", "Classification in progress (new)", "FBA"],
      ["not-an-asin", "junk", "Not dangerous goods", ""],
    ];
    const r = parseDgReport(rows);
    expect(r.error).toBeNull();
    expect(r.columns).toEqual({ asin: "ASIN", status: "Dangerous goods classification", programme: "Program" });
    expect(r.entries.map((e) => [e.asin, e.status, e.programme])).toEqual([
      ["B0AERO0001", "dg_fulfillable", "FBA"],
      ["B0SOAP0002", "not_dg", "Pan-European FBA"],
      ["B0CHEM0003", "review_required", null],
      ["B0ODD00004", "unknown", "FBA"],
    ]);
    expect(r.unrecognised).toEqual([{ text: "Classification in progress (new)", rows: 1 }]);
    expect(r.skipped).toBe(1);
  });

  it("explains a file it can't read", () => {
    expect(parseDgReport([["SKU", "Status"], ["x", "y"]]).error).toMatch(/No ASIN column/);
    expect(parseDgReport([["ASIN", "Title"], ["B0AERO0001", "x"]]).error).toMatch(/No dangerous-goods status column/);
  });

  it("the Compliance line's words", () => {
    expect(dgLookupText({ status: "dg_fulfillable", text: "x", programme: "FBA" })).toBe("Amazon DG lookup: dangerous goods, fulfillable (FBA)");
    expect(dgLookupText({ status: "unknown", text: "Odd", programme: null })).toBe("Amazon DG lookup: “Odd”");
  });
});
