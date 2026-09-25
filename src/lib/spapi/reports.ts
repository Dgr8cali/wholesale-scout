/**
 * Amazon's flat-file reports (tab-separated, a header row), read into what the tracker needs.
 * Pure: tested on the layout Amazon returns for the UK.
 */

/** Rows as objects keyed by the header. */
export function parseFlatFile(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  if (!lines.length) return [];
  const head = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split("\t");
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

export interface DailySales { asin: string; day: string; channel: "Amazon" | "Merchant"; units: number; orders: number; revenue: number }

const money = (s: string | undefined) => { const n = Number(String(s ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
/** The UK calendar day of a timestamp. */
export const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/**
 * The orders report (GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL) as units, orders and
 * revenue per ASIN, UK day and channel. Cancelled orders and lines are left out; revenue is the
 * item price less its promotion, VAT included (what the customer paid for the item).
 */
export function salesFromOrdersReport(text: string): DailySales[] {
  const by = new Map<string, DailySales & { ids: Set<string> }>();
  for (const r of parseFlatFile(text)) {
    if (/cancel/i.test(r["order-status"] ?? "") || /cancel/i.test(r["item-status"] ?? "")) continue;
    const asin = (r["asin"] ?? "").toUpperCase();
    const units = Math.round(money(r["quantity"]));
    if (!/^[A-Z0-9]{10}$/.test(asin) || units <= 0 || !r["purchase-date"]) continue;
    const day = ukDay(r["purchase-date"]);
    const channel = /amazon|afn/i.test(r["fulfillment-channel"] ?? "") ? "Amazon" : "Merchant";
    const key = `${asin}|${day}|${channel}`;
    const cur = by.get(key) ?? { asin, day, channel, units: 0, orders: 0, revenue: 0, ids: new Set<string>() };
    cur.units += units;
    cur.revenue += money(r["item-price"]) - Math.abs(money(r["item-promotion-discount"]));
    cur.ids.add(r["amazon-order-id"] ?? key);
    by.set(key, cur);
  }
  return [...by.values()].map(({ ids, ...x }) => ({ ...x, orders: ids.size, revenue: Math.round(x.revenue * 100) / 100 }));
}
