// @vitest-environment node
/** The extension's Amazon reviews parser (extension/reviews-parse.js). */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Review = { id: string | null; stars: number | null; title: string | null; body: string; date: string | null; country: string | null; reviewedOn: string | null; variant: string | null; helpful: number | null; verified: boolean };
const P = require("../../../extension/reviews-parse.js") as {
  parseAmazonReviews: (doc: Document, url?: string) => { asin: string | null; reviews: Review[]; unparsed: unknown[] };
  asinFromUrl: (url: string) => string | null;
  parseStars: (s: string) => number | null;
  hasReviews: (doc: Document) => boolean;
};
const dom = (html: string) => new JSDOM(html).window.document;

describe("Amazon reviews parser", () => {
  it("the ASIN from every review and product URL shape, slugged or not", () => {
    for (const [url, asin] of [
      ["https://www.amazon.co.uk/Mouse-Traps-Instantly/product-reviews/B0FY3H7Y9R/ref=cm_cr_dp_d_show_all_btm?ie=UTF8", "B0FY3H7Y9R"],
      ["https://www.amazon.co.uk/product-reviews/B0FY3H7Y9R", "B0FY3H7Y9R"],
      ["https://www.amazon.co.uk/portal/customer-reviews/B0FY3H7Y9R/ref=acr_dpx_hist_1?filterByStar=one_star", "B0FY3H7Y9R"],
      ["https://www.amazon.co.uk/Mouse-Traps-Instantly-Sensitive-Effective/portal/customer-reviews/B0FY3H7Y9R", "B0FY3H7Y9R"],
      ["https://www.amazon.co.uk/Some-Product/dp/b0fy3h7y9r?th=1", "B0FY3H7Y9R"],
      ["https://www.amazon.co.uk/gp/product/B0FY3H7Y9R", "B0FY3H7Y9R"],
    ]) expect(P.asinFromUrl(url)).toBe(asin);
    expect(P.asinFromUrl("https://www.amazon.co.uk/portal/customer-reviews/srp/-/R36H1S2XSV9WQP/ref=x")).toBeNull();
  });

  it("ratings", () => {
    expect([P.parseStars("1.0 out of 5 stars"), P.parseStars("4,0 out of 5 stars"), P.parseStars("5 out of 5 stars"), P.parseStars("Helpful")]).toEqual([1, 4, 5, null]);
  });

  it("a hand-written page: nested rating out of the title, variant separators, helpful votes, verified, dedupe by id", () => {
    const review = (id: string, stars: number, title: string) => `
      <li id="${id}" data-hook="review"><div id="customer_review-${id}">
        <a data-hook="review-title"><i data-hook="review-star-rating"><span class="a-icon-alt">${stars}.0 out of 5 stars</span></i><span class="a-letter-space"></span><span>${title}</span></a>
        <span data-hook="review-date">Reviewed in the United Kingdom on 5 July 2026</span>
        <a data-hook="format-strip">Colour Name: Small<i class="a-icon a-icon-text-separator" aria-label="|"></i>Number Of Items: 6</a>
        <span data-hook="avp-badge">Verified Purchase</span>
        <span data-hook="review-body"><span>Snapped on day one.<br>Would not buy again.</span></span>
        <span data-hook="helpful-vote-statement">12 people found this helpful</span>
      </div></li>`;
    // The same review twice (Amazon re-renders it on "show more"), and another.
    const d = dom(`<link rel="canonical" href="https://www.amazon.co.uk/x/product-reviews/B0FAKE0001"><ul>${review("R1AAAAAAAAAAA", 1, "Broke")}${review("R1AAAAAAAAAAA", 1, "Broke")}${review("R2BBBBBBBBBBB", 2, "Meh")}</ul>`);
    const r = P.parseAmazonReviews(d, "https://www.amazon.co.uk/portal/customer-reviews/srp/-/R1AAAAAAAAAAA");
    expect(r.asin).toBe("B0FAKE0001");
    expect(r.reviews).toHaveLength(2);
    expect(r.reviews[0]).toEqual({
      id: "R1AAAAAAAAAAA", stars: 1, title: "Broke", body: "Snapped on day one.\nWould not buy again.",
      date: "Reviewed in the United Kingdom on 5 July 2026", country: "United Kingdom", reviewedOn: "5 July 2026",
      variant: "Colour Name: Small | Number Of Items: 6", helpful: 12, verified: true,
    });
    expect(P.hasReviews(d)).toBe(true);
    expect(P.parseAmazonReviews(dom("<p>no reviews</p>"), "https://www.amazon.co.uk/dp/B0FAKE0001")).toEqual({ asin: "B0FAKE0001", reviews: [], unparsed: [] });
  });

  it("the saved review page: 7 one-star reviews, each once, nothing left unread", () => {
    const d = dom(readFileSync(join(__dirname, "../../../docs/samples/amazon/reviews-B0FY3H7Y9R.html"), "utf8"));
    const r = P.parseAmazonReviews(d, "https://www.amazon.co.uk/portal/customer-reviews/B0FY3H7Y9R/ref=acr_dpx_hist_1?ie=UTF8&filterByStar=one_star");
    expect(r.asin).toBe("B0FY3H7Y9R");
    expect(r.unparsed).toEqual([]);
    expect(r.reviews).toHaveLength(7);
    expect(new Set(r.reviews.map((x) => x.id)).size).toBe(7);
    expect(r.reviews.every((x) => x.stars === 1 && x.verified && x.country === "United Kingdom")).toBe(true);
    expect(r.reviews[0]).toMatchObject({ id: "R36H1S2XSV9WQP", title: "NOT SUITABLE FOR RATS", variant: "Colour Name: Small (11.2 cm) | Number Of Items: 6", reviewedOn: "5 July 2026" });
    expect(r.reviews[0].body).toMatch(/^These traps are not for Rats/);
    expect(r.reviews.filter((x) => x.helpful != null)).toHaveLength(3);
  });
});
