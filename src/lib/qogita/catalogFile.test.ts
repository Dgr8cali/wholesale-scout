import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { hyperlinkUrl, isQogitaCatalog, parseQogitaCatalog } from "./catalogFile";

/** The sheet's rows and the link column's formulas, as the import reads them. */
function readSample() {
  const wb = XLSX.read(readFileSync(join(__dirname, "../../../docs/samples/qogita/qogita-uk-sample.xlsx")), { cellFormula: true, sheetStubs: true });
  const ws = wb.Sheets.Catalog;
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: true, defval: null });
  const formulas: Record<number, string> = {};
  for (const [addr, cell] of Object.entries(ws)) if (!addr.startsWith("!") && (cell as { f?: string }).f) formulas[XLSX.utils.decode_cell(addr).r] = (cell as { f: string }).f;
  return { rows, formulas };
}

describe("Qogita catalogue file (UK)", () => {
  const { rows, formulas } = readSample();
  const cat = parseQogitaCatalog(rows, formulas);

  it("header on row 5, GBP from the £ header, shipping included", () => {
    expect(isQogitaCatalog(rows)).toBe(true);
    expect(cat).toMatchObject({ headerRow: 4, currency: "GBP", priceHeader: "£ Lowest Price inc. shipping", shippingIncluded: true });
    expect(cat.rows).toHaveLength(960);
    expect(cat.skipped).toEqual([]);
  });

  it("GTIN leading zeros kept, the HYPERLINK URL extracted, the rest read", () => {
    expect(cat.rows[0]).toEqual({
      gtin: "0033000002668", name: "Revlon Cuticle Softener", category: "Cuticle Removers", brand: "Revlon",
      price: 0.92, unit: 1, unitCost: 0.92, caseCost: 0.92, inventory: 120, preOrder: false, deliveryWeeks: null, offerCount: 1, totalInventory: 120,
      link: "https://api.qogita.com/variants/link/0033000002668/",
    });
    expect(cat.rows.filter((r) => r.gtin.startsWith("0")).length).toBeGreaterThan(3);
  });

  it("Unit > 1 is the case size: one item costs the price (Qogita prices per item); a case costs price × unit", () => {
    const oil = cat.rows.find((r) => r.gtin === "3574661302287")!;
    expect(oil).toMatchObject({ name: "Neutrogena Cuticle Oils 75ml", price: 4.97, unit: 120, unitCost: 4.97, caseCost: 596.4, inventory: 120 });
    // Inventory comes in whole cases: the price can't be for the case.
    expect(cat.rows.filter((r) => r.unit > 1 && r.inventory != null).every((r) => r.inventory! % r.unit === 0)).toBe(true);
    // An export that prices whole cases: the item is price ÷ unit.
    const t = parseQogitaCatalog([["GTIN", "Name", "€ Lowest Price inc. shipping", "Unit"], [5012345678900, "Pack of 12", 24, 12]], {}, { pricePer: "case" });
    expect(t).toMatchObject({ currency: "EUR", rows: [{ gtin: "5012345678900", unitCost: 2, caseCost: 24, unit: 12 }] });
    expect(parseQogitaCatalog([["GTIN", "Lowest Price"], ["abc", 1], ["5012345678900", ""]]).skipped).toHaveLength(2);
    expect(hyperlinkUrl('HYPERLINK("https://x.test/a/", "View")')).toBe("https://x.test/a/");
  });
});
