// @vitest-environment node
/** The extension's Alibaba parser (extension/alibaba-parse.js) on a real saved results page. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const P = require("../../../extension/alibaba-parse.js") as {
  parseAlibabaResults: (doc: Document, url?: string) => { cards: Record<string, unknown>[]; unparsed: { index: number; reason: string }[]; tradeAssurance: boolean };
  parsePrice: (s: string) => { min: number; max: number; currency: string | null; unit: string | null } | null;
  parseMoq: (s: string) => { moq: number; unit: string | null } | null;
};
const html = readFileSync(join(__dirname, "../../../docs/samples/alibaba/lens-wipes.html"), "utf8");
const doc = new JSDOM(html).window.document;

describe("Alibaba results parser", () => {
  const r = P.parseAlibabaResults(doc, "https://www.alibaba.com/trade/search?SearchText=lens+wipes");

  it("reads all 60 cards", () => {
    expect(r.cards).toHaveLength(60);
    expect(r.unparsed).toEqual([]);
    expect(new Set(r.cards.map((c) => c.listingUrl)).size).toBe(60);
  });

  it("Hangzhou Micker: MOQ 1000 boxes, £0.3053–0.5342 per box, 31 sold, Verified, 9 yrs CN, 4.9 from 22", () => {
    const m = r.cards.find((c) => c.supplierName === "Hangzhou Micker Sanitary Products Co., Ltd.");
    expect(m).toMatchObject({
      moq: 1000, moqUnit: "box", priceMin: 0.3053, priceMax: 0.5342, currency: "GBP", priceUnit: "box", priceUnitFrom: "moq",
      soldCount: 31, supplierYears: 9, country: "CN", rating: 4.9, reviewCount: 22, badges: ["Verified"],
      storeUrl: "https://hzmqr.en.alibaba.com/productlist.html",
      listingUrl: "https://www.alibaba.com/product-detail/Factory-Custom-100-200-400pcs-6x12cm_1601715892300.html",
    });
    expect(m!.title).toMatch(/^Factory Custom 100 200 400pcs 6x12cm Individually Wrapped/);
  });

  it("every card has a price, an MOQ and a supplier; badges, delivery and sold where shown", () => {
    expect(r.cards.every((c) => c.priceMin != null && c.moq != null && c.supplierName)).toBe(true);
    expect(r.cards.filter((c) => c.soldCount != null)).toHaveLength(17);
    expect(r.cards.filter((c) => (c.badges as string[]).includes("Alibaba Guaranteed")).length).toBeGreaterThan(0);
    expect(r.cards.filter((c) => typeof c.delivery === "string" && /^Delivery by/.test(c.delivery as string)).length).toBeGreaterThan(5);
    expect(r.tradeAssurance).toBe(false);
  });

  it("Trade Assurance comes from the page's filter", () => {
    expect(P.parseAlibabaResults(doc, "https://www.alibaba.com/trade/search?SearchText=x&ta=y").cards[0].badges).toContain("Trade Assurance");
  });

  it("prices and MOQs on their own", () => {
    expect(P.parsePrice("US$0.02-0.05 / piece")).toEqual({ min: 0.02, max: 0.05, currency: "USD", unit: "piece" });
    expect(P.parsePrice("£2.52")).toEqual({ min: 2.52, max: 2.52, currency: "GBP", unit: null });
    expect(P.parseMoq("Min. order: 10,000 packs")).toEqual({ moq: 10000, unit: "pack" });
  });

  it("a card it can't read is logged, not fatal", () => {
    const d = new JSDOM(`<div class="fy26-product-card-wrapper"><span>no title</span></div>`).window.document;
    expect(P.parseAlibabaResults(d)).toMatchObject({ cards: [], unparsed: [{ index: 0, reason: "no title link" }] });
  });
});
