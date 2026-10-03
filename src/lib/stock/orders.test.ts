import { describe, expect, it } from "vitest";
import { hasOrderInput, orderCols, supplierRow, trackingText, webUrl } from "./orders";

describe("a new supplier from Stock", () => {
  it("checked and tidied; marketplace only for a marketplace seller", () => {
    expect(supplierRow({ name: "  Ningbo Tiger Crafts ", kind: "marketplace", marketplace: "Alibaba", website: "tigercrafts.en.alibaba.com", leadTimeDays: "25", contact: "Amy, amy@x.cn" })).toEqual({
      name: "Ningbo Tiger Crafts", source_type: "stock", kind: "marketplace", marketplace: "Alibaba", website: "https://tigercrafts.en.alibaba.com",
      contact: "Amy, amy@x.cn", delivery_days: 25, notes: null,
    });
    expect(supplierRow({ name: "Boots", kind: "retailer", marketplace: "eBay" }).marketplace).toBeNull();
    expect(() => supplierRow({ name: " " })).toThrow(/name/);
    expect(() => supplierRow({ name: "X", kind: "dropshipper" })).toThrow(/Type must be/);
    expect(() => supplierRow({ name: "X", leadTimeDays: "2.5" })).toThrow(/whole number/);
    expect(() => supplierRow({ name: "X", website: "not a site" })).toThrow(/web address/);
  });
});

describe("order fields", () => {
  it("GBP: the order's columns, no rate", () => {
    const o = orderCols({ orderId: " 1688-4471 ", orderUrl: "trade.1688.com/order/4471", orderedDate: "2026-10-01", expectedDate: "2026-10-20", trackingCarrier: "DHL", trackingNumber: "JD0146" });
    expect(o).toEqual({
      cols: { order_id: "1688-4471", order_url: "https://trade.1688.com/order/4471", expected_date: "2026-10-20", tracking_carrier: "DHL", tracking_number: "JD0146", currency: "GBP", fx_rate: null, unit_cost_ccy: null },
      orderedDate: "2026-10-01", unitCostGbp: null,
    });
  });
  it("another currency needs the rate; the unit cost turns into £", () => {
    expect(orderCols({ currency: "usd", fxRate: "0.79", unitCostCcy: "1.85" })).toMatchObject({ cols: { currency: "USD", fx_rate: 0.79, unit_cost_ccy: 1.85 }, unitCostGbp: 1.46 });
    expect(() => orderCols({ currency: "CNY" })).toThrow(/FX rate is needed for CNY/);
    expect(() => orderCols({ currency: "USD", fxRate: -1 })).toThrow(/positive/);
    expect(() => orderCols({ expectedDate: "20/10/2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => orderCols({ orderUrl: "nope" })).toThrow(/Order link must be a web address/);
  });
  it("helpers", () => {
    expect(webUrl("https://ebay.co.uk/vod/123", "x")).toBe("https://ebay.co.uk/vod/123");
    expect(hasOrderInput({ status: "received", bucket: "home" })).toBe(false);
    expect(hasOrderInput({ orderId: "A1" })).toBe(true);
    expect(trackingText("Royal Mail", "AB1GB")).toBe("Royal Mail · AB1GB");
    expect(trackingText(null, null)).toBeNull();
  });
});
