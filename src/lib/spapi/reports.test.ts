import { describe, expect, it } from "vitest";
import { salesFromOrdersReport } from "./reports";

// The UK orders report's own header (GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL).
const HEAD = "amazon-order-id\tmerchant-order-id\tpurchase-date\tlast-updated-date\torder-status\tfulfillment-channel\tsales-channel\torder-channel\tship-service-level\tproduct-name\tsku\tasin\titem-status\tquantity\tcurrency\titem-price\titem-tax\tshipping-price\tshipping-tax\tgift-wrap-price\tgift-wrap-tax\titem-promotion-discount\tship-promotion-discount\tship-city\tship-state\tship-postal-code\tship-country\tpromotion-ids\torder-item-id\tis-prime";
const row = (id: string, date: string, status: string, channel: string, asin: string, qty: number, price: string, promo = "") =>
  [id, "", date, date, status, channel, "Amazon.co.uk", "", "Standard", "Thing", "SKU-1", asin, "", String(qty), "GBP", price, "", "", "", "", "", promo, "", "", "", "", "GB", "", "1", "true"].join("\t");

describe("orders report", () => {
  it("adds up units, orders and revenue per ASIN, UK day and channel, leaving out cancellations", () => {
    const text = [HEAD,
      row("A-1", "2026-09-24T09:00:00+00:00", "Shipped", "Amazon", "B0TEST0001", 2, "47.90"),
      row("A-2", "2026-09-24T22:30:00+00:00", "Shipped", "Amazon", "B0TEST0001", 1, "23.95", "-2.00"), // 23:30 BST: still the 24th
      row("A-3", "2026-09-24T23:30:00+00:00", "Shipped", "Amazon", "B0TEST0001", 1, "23.95"), // 00:30 BST: the 25th
      row("A-4", "2026-09-24T10:00:00+00:00", "Cancelled", "Amazon", "B0TEST0001", 1, "23.95"),
      row("A-5", "2026-09-24T11:00:00+00:00", "Pending", "Merchant", "B0TEST0001", 1, "25.00"),
    ].join("\n");
    expect(salesFromOrdersReport(text).sort((a, b) => (a.day + a.channel).localeCompare(b.day + b.channel))).toEqual([
      { asin: "B0TEST0001", day: "2026-09-24", channel: "Amazon", units: 3, orders: 2, revenue: 69.85 },
      { asin: "B0TEST0001", day: "2026-09-24", channel: "Merchant", units: 1, orders: 1, revenue: 25 },
      { asin: "B0TEST0001", day: "2026-09-25", channel: "Amazon", units: 1, orders: 1, revenue: 23.95 },
    ]);
  });
  it("is empty for an empty report", () => {
    expect(salesFromOrdersReport("")).toEqual([]);
    expect(salesFromOrdersReport(HEAD)).toEqual([]);
  });
});
