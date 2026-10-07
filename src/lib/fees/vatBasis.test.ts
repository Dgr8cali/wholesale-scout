import { describe, expect, it } from "vitest";
import { applyMapping } from "../ingest/mapping";
import { DEFAULT_FEE_ASSUMPTIONS, economics, profitOnVatBasis } from "./engine";
import { UK_RATE_CARD_2026_07 } from "./rateCard";

describe("profit on the business's VAT basis", () => {
  const x = { price: 9.99, feesExVat: 1.5 + 2.46, goodsExVat: 1.31, vatRatePct: 20 };

  it("VAT registered: £9.99 ÷ 1.2 − £1.50 − £2.46 − £1.31 = £3.06", () => {
    const r = profitOnVatBasis({ ...x, vatRegistered: true });
    expect(r.profit).toBe(3.06);
    expect(r.netRevenue).toBeCloseTo(8.325, 3);
    expect(r.outputVat).toBeCloseTo(1.665, 3);
  });

  it("not registered, for comparison: the full price less fees and goods with their VAT", () => {
    const r = profitOnVatBasis({ ...x, vatRegistered: false });
    // 9.99 − 3.96 × 1.2 − 1.31 × 1.2 = 9.99 − 4.752 − 1.572
    expect(r.profit).toBe(3.67);
    expect(r.fees).toBeCloseTo(4.752, 3);
    expect(r.goods).toBeCloseTo(1.572, 3);
  });

  it("economics(): registered drops output VAT, fees and goods ex-VAT, and says what goes to HMRC", () => {
    const item = { dimsCm: { l: 17, w: 12, h: 9 }, weightG: 300, referralCategory: "Beauty, Health and Personal Care" };
    const reg = economics(9.99, 1.31, item, UK_RATE_CARD_2026_07, { ...DEFAULT_FEE_ASSUMPTIONS, vatRegistered: true, dsfPct: 0, inboundPerUnit: 0, prepPerUnit: 0, returnsPct: 0, storageMonths: 0 });
    expect(reg.vatRegistered).toBe(true);
    expect(reg.netRevenue).toBeCloseTo(8.325, 3);
    expect(reg.landed.goodsVat).toBe(0);
    expect(reg.profit).toBeCloseTo(8.325 - (reg.fees.totalFees ?? 0) - 1.31, 2);
    expect(Math.abs(reg.vatPayable - (reg.outputVat - reg.inputVat))).toBeLessThanOrEqual(0.011);
    const non = economics(9.99, 1.31, item, UK_RATE_CARD_2026_07, { ...DEFAULT_FEE_ASSUMPTIONS, vatRegistered: false, dsfPct: 0, inboundPerUnit: 0, prepPerUnit: 0, returnsPct: 0, storageMonths: 0 });
    expect(non).toMatchObject({ vatRegistered: false, outputVat: 0, inputVat: 0, vatPayable: 0 });
    expect(non.landed.goodsVat).toBeCloseTo(1.31 * 0.2, 4);
  });

  it("a supplier pricing inc-VAT: the cost is price ÷ 1.2 (the ex-VAT cost the profit uses)", () => {
    const sheet = [["EAN", "Price"], ["5012345678900", "12.00"]];
    const { rows } = applyMapping(sheet, { headerRow: 0, columns: { ean: "EAN", unitPrice: "Price" }, pricePer: "unit" }, { vatBasis: "inc_vat", vatRate: 20, currency: "GBP" }, { rate: 1, date: "2026-10-07" });
    expect(rows[0].unitCostGbp).toBeCloseTo(10, 4);
  });

  it("EU (EUR) prices still convert at the rate given; GBP doesn't", () => {
    const sheet = [["EAN", "Price"], ["5012345678900", "10.00"]];
    const map = { headerRow: 0, columns: { ean: "EAN", unitPrice: "Price" }, pricePer: "unit" as const };
    expect(applyMapping(sheet, map, { vatBasis: "ex_vat", vatRate: 20, currency: "EUR" }, { rate: 0.85, date: "2026-10-07" }).rows[0].unitCostGbp).toBeCloseTo(8.5, 4);
    expect(applyMapping(sheet, map, { vatBasis: "ex_vat", vatRate: 20, currency: "GBP" }, { rate: 1, date: "2026-10-07" }).rows[0].unitCostGbp).toBeCloseTo(10, 4);
  });
});
