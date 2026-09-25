import { describe, expect, it } from "vitest";
import {
  applyMapping,
  currencyFromHeader,
  detectHeaderRow,
  guessMapping,
  headerFingerprint,
  normalizeEan,
  parseMoney,
  validGtin,
  type Cell,
} from "./mapping";

describe("fingerprint", () => {
  it("ignores order, case and spacing", () => {
    expect(headerFingerprint(["EAN", "Description", "Price"])).toBe(headerFingerprint(["price ", "ean", "DESCRIPTION"]));
    expect(headerFingerprint(["EAN", "Price"])).not.toBe(headerFingerprint(["EAN", "Cost"]));
  });
});

describe("money and codes", () => {
  it("parses UK and European formats", () => {
    expect(parseMoney("£1,234.50")).toBe(1234.5);
    expect(parseMoney("1.234,50 €")).toBe(1234.5);
    expect(parseMoney("12,5")).toBe(12.5);
    expect(parseMoney("1,250")).toBe(1250);
    expect(parseMoney(3.99)).toBe(3.99);
    expect(parseMoney("n/a")).toBeNull();
  });

  it("normalises EANs and validates check digits", () => {
    expect(normalizeEan(5012345678900)).toBe("5012345678900");
    expect(normalizeEan("036000291452")).toBe("0036000291452"); // UPC-12 → EAN-13
    expect(normalizeEan("05012345678900")).toBe("5012345678900"); // GTIN-14
    expect(normalizeEan("5.01235E+12")).toBeNull();
    expect(normalizeEan("abc")).toBeNull();
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("4006381333932")).toBe(false);
  });
});

describe("header detection and guessing", () => {
  const sheet: Cell[][] = [
    ["Pharmazon Ltd — Price list September"],
    [],
    ["Barcode", "Description", "Brand", "Pack Size", "Trade Price", "MOQ", "Stock"],
    ["5012345678900", "Vitamin C 1000mg 60 tabs", "Brand A", 6, "£3.00", 12, 100],
  ];

  it("finds the header row under a title", () => {
    expect(detectHeaderRow(sheet)).toBe(2);
  });

  it("guesses columns", () => {
    expect(guessMapping(sheet[2])).toMatchObject({
      ean: "Barcode", title: "Description", brand: "Brand", packUnits: "Pack Size", unitPrice: "Trade Price", moq: "MOQ", stock: "Stock",
    });
  });
});

describe("applyMapping", () => {
  const sheet: Cell[][] = [
    ["EAN", "Name", "Price", "Units"],
    ["4006381333931", "Widget", "12.00", 4],
    ["", "No code", "1.00", 1],
    ["4006381333931", "No price", "", 1],
  ];
  const mapping = { headerRow: 0, columns: { ean: "EAN", title: "Name", unitPrice: "Price", packUnits: "Units" }, pricePer: "unit" as const };

  it("converts to GBP ex-VAT at ingest, and lists rejects separately", () => {
    const r = applyMapping(sheet, mapping, { vatBasis: "ex_vat", vatRate: 20, currency: "EUR" }, { rate: 0.85, date: "2026-09-25" });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ ean: "4006381333931", unitCost: 12, unitCostGbp: 10.2, packUnits: 4, sourceRow: 2, eanValid: true });
    expect(r.rejected.map((x) => x.reason)).toEqual(["No usable EAN", "No price"]);
  });

  it("strips VAT from inc-VAT prices", () => {
    const r = applyMapping(sheet, mapping, { vatBasis: "inc_vat", vatRate: 20, currency: "GBP" }, { rate: 1, date: "2026-09-25" });
    expect(r.rows[0].unitCostGbp).toBe(10);
  });

  it("divides a pack price by the pack size", () => {
    const r = applyMapping(sheet, { ...mapping, pricePer: "pack" }, { vatBasis: "ex_vat", vatRate: 20, currency: "GBP" }, { rate: 1, date: "2026-09-25" });
    expect(r.rows[0].unitCost).toBe(3);
    expect(r.rows[0].unitCostGbp).toBe(3);
  });
});

describe("currency from the price header", () => {
  it("reads codes and symbols", () => {
    expect(currencyFromHeader("Price (€)")).toBe("EUR");
    expect(currencyFromHeader("Prijs EUR")).toBe("EUR");
    expect(currencyFromHeader("eur_price")).toBe("EUR");
    expect(currencyFromHeader("Price in euros")).toBe("EUR");
    expect(currencyFromHeader("Unit cost USD")).toBe("USD");
    expect(currencyFromHeader("US$ each")).toBe("USD");
    expect(currencyFromHeader("Price $")).toBe("USD");
    expect(currencyFromHeader("CA$ price")).toBe("CAD");
    expect(currencyFromHeader("Trade £")).toBe("GBP");
    expect(currencyFromHeader("Cena zł")).toBe("PLN");
  });

  it("returns null when no currency is named, without false hits inside words", () => {
    expect(currencyFromHeader("Trade price")).toBeNull();
    expect(currencyFromHeader("Unit cost")).toBeNull();
    expect(currencyFromHeader("Europa range")).toBeNull();
    expect(currencyFromHeader("")).toBeNull();
  });
});
