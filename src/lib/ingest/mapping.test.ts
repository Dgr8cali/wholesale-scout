import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyMapping,
  currencyFromHeader,
  detectHeaderRow,
  guessMapping,
  headerFingerprint,
  headersOf,
  normalizeEan,
  parseMoney,
  rememberedMapping,
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

describe("remembered layouts (Qogita catalog exports)", () => {
  const HEADERS = ["GTIN", "Name", "Category", "Brand", "€ Lowest Price inc. shipping", "Unit", "Lowest Priced Offer Inventory", "Is a pre-order?", "Estimated Delivery Time (weeks)", "Number of Offers", "Total Inventory of All Offers", "Product Link"];
  const banner: Cell[][] = [
    ["Qogita Catalog", null, null],
    ["Catalog As Of 2026-09-24T13-28-40", null, null],
    ["For Illustrative Purposes Only. Prices May Differ Per Cart Subject To Optimization.", null, null],
  ];
  const data: Cell[][] = [
    ["3337875863377", "La Roche-Posay Effaclar Duo+M 40ml", "Face Creams", "La Roche-Posay", 9.48, 3, 120, "No", "", 1, 120, null],
    ["3401399277092", "Bioderma Sebium Gel Moussant 500ml", "Cleansers", "Bioderma", 8.9, 2, 40, "No", "", 2, 55, null],
  ];
  const saved = {
    headerRow: 3,
    columns: { ean: "GTIN", title: "Name", brand: "Brand", category: "Category", unitPrice: "€ Lowest Price inc. shipping", stock: "Lowest Priced Offer Inventory" },
    pricePer: "unit" as const,
  };
  const eur = { vatBasis: "ex_vat" as const, vatRate: 20, currency: "EUR" };
  const fx = { rate: 0.86, date: "2026-09-25" };

  it("detects the header row and guesses GTIN and the € price column on a fresh layout", () => {
    const rows = [...banner, HEADERS, ...data];
    expect(detectHeaderRow(rows)).toBe(3);
    expect(guessMapping(HEADERS)).toMatchObject({ ean: "GTIN", unitPrice: "€ Lowest Price inc. shipping", title: "Name", brand: "Brand" });
  });

  it("finds the remembered layout's headers wherever they sit in this file", () => {
    // One more banner line than the file the layout was saved from: headers on row 5, not 4.
    const shifted = [...banner, ["Filters: max delivery 1w, MOV limit 500.00"], HEADERS, ...data];
    const fp = headerFingerprint(HEADERS);
    const m = rememberedMapping(shifted, saved, fp);
    expect(m.headerRow).toBe(4);
    const r = applyMapping(shifted, m, eur, fx);
    expect(r.rejected).toEqual([]);
    expect(r.rows.map((x) => x.ean)).toEqual(["3337875863377", "3401399277092"]);
    // The old behaviour — the saved row number — reads the banner as headers and sets everything aside.
    expect(applyMapping(shifted, saved, eur, fx).rejected.every((x) => x.reason === "No usable EAN")).toBe(true);
  });

  it("drops a saved column this file doesn't have", () => {
    const without = HEADERS.filter((h) => h !== "Lowest Priced Offer Inventory");
    const rows = [...banner, without, ...data.map((d) => d.filter((_, i) => i !== 6))];
    const m = rememberedMapping(rows, saved, headerFingerprint(without));
    expect(m.columns.stock).toBeUndefined();
    expect(m.columns.ean).toBe("GTIN");
  });
});

// The real 91-row Qogita export, when it's on this machine. Not committed: it's supplier data.
const REAL_91 = `${process.env.HOME}/Downloads/Filtered_Catalog_Download-X2Y688-collection-dermocosmetics-24-09-2026T13-28-40.xlsx`;
describe.skipIf(!existsSync(REAL_91))("the real 91-row Qogita file", () => {
  it("maps to GTIN and € Lowest Price inc. shipping and keeps all 91 lines, fresh or remembered", async () => {
    const XLSX = await import("xlsx");
    const buf = readFileSync(REAL_91);
    // Exactly as the upload page reads it.
    const wb = XLSX.read(new Uint8Array(buf).buffer, { type: "array", raw: false, dense: true });
    const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
    const hr = detectHeaderRow(rows);
    const headers = headersOf(rows, hr);
    const fresh = guessMapping(headers);
    expect(fresh.ean).toBe("GTIN");
    expect(fresh.unitPrice).toBe("€ Lowest Price inc. shipping");
    const basis = { vatBasis: "ex_vat" as const, vatRate: 20, currency: "EUR" };
    const r1 = applyMapping(rows, { headerRow: hr, columns: fresh, pricePer: "unit" }, basis, { rate: 0.86, date: "2026-09-25" });
    expect(r1.rows).toHaveLength(91);
    // Remembered with a wrong stored row number (as a layout saved from another export could be).
    const remembered = rememberedMapping(rows, { headerRow: 0, columns: { ean: "GTIN", unitPrice: "€ Lowest Price inc. shipping" }, pricePer: "unit" }, headerFingerprint(headers));
    expect(remembered.headerRow).toBe(hr);
    expect(applyMapping(rows, remembered, basis, { rate: 0.86, date: "2026-09-25" }).rows).toHaveLength(91);
  });
});
