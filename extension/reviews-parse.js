// amazon.co.uk reviews → structured reviews (Gate 4). Plain DOM reading, no network: the content
// script (reviews.js) and the popup's "Capture reviews on this page" both run it on the page you're
// on, and the app's tests run it on a saved page (docs/samples/amazon/reviews-B0FY3H7Y9R.html).
// When Amazon changes its markup, update REVIEW_SELECTORS.
(function (root) {
  /** Every selector the parser uses, in one place. */
  const REVIEW_SELECTORS = {
    review: '[data-hook="review"], li[data-hook="review"], div[id^="customer_review-"]',
    rating: '[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"], i[class*="a-star-"]',
    title: '[data-hook="review-title"]',
    body: '[data-hook="review-body"]',
    date: '[data-hook="review-date"]',
    verified: '[data-hook="avp-badge"], [data-hook="avp-badge-linkless"]',
    helpful: '[data-hook="helpful-vote-statement"]',
    variant: '[data-hook="format-strip"]',
    /** The page's own ASIN, when the URL doesn't carry one. */
    asinInput: 'input#ASIN, input[name="ASIN"]',
    canonical: 'link[rel="canonical"]',
  };

  /** /product-reviews/<ASIN>, /portal/customer-reviews/<ASIN>, /dp/<ASIN>, /gp/product/<ASIN>, with or without a slug before. */
  const ASIN_IN_PATH = /\/(?:product-reviews|customer-reviews|dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

  function asinFromUrl(url) {
    if (!url) return null;
    let path = url;
    try { path = new URL(url, "https://www.amazon.co.uk/").pathname; } catch { /* a path already */ }
    const m = path.match(ASIN_IN_PATH);
    return m ? m[1].toUpperCase() : null;
  }

  /** The page's ASIN: its URL, else its canonical link, else its ASIN field. */
  function pageAsin(doc, url) {
    const S = REVIEW_SELECTORS;
    const fromUrl = asinFromUrl(url);
    if (fromUrl) return fromUrl;
    const canon = doc.querySelector(S.canonical);
    const fromCanon = canon && asinFromUrl(canon.getAttribute("href"));
    if (fromCanon) return fromCanon;
    const input = doc.querySelector(S.asinInput);
    return input && /^[A-Z0-9]{10}$/i.test(input.value || input.getAttribute("value") || "") ? (input.value || input.getAttribute("value")).toUpperCase() : null;
  }

  const squash = (s) => s.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  /**
   * An element's text without innerText (not in every DOM): <br> and block ends as new lines, the
   * separator icons as " | ", and anything in `skip` left out.
   */
  function textOf(el, skip) {
    if (!el) return "";
    const c = el.cloneNode(true);
    if (skip) c.querySelectorAll(skip).forEach((x) => x.remove());
    c.querySelectorAll("script, style").forEach((x) => x.remove());
    c.querySelectorAll("br").forEach((x) => x.replaceWith("\n"));
    c.querySelectorAll('i.a-icon-text-separator, [aria-label="|"]').forEach((x) => x.replaceWith(" | "));
    return squash(c.textContent || "");
  }

  /** "1.0 out of 5 stars" → 1. */
  function parseStars(s) {
    const m = (s || "").match(/([1-5])(?:[.,]\d)?\s+out of 5/i);
    return m ? Number(m[1]) : null;
  }

  /** One review element, or null when it holds no review. */
  function parseReview(el) {
    const S = REVIEW_SELECTORS;
    const q = (sel) => el.querySelector(sel);
    // The review's id: the element's own (R…), else its customer_review-R… wrapper.
    const rawId = el.id || (el.querySelector('[id^="customer_review-"]') || {}).id || "";
    const id = rawId.replace(/^customer_review-/, "").replace(/-review-card$/, "") || null;
    const ratingEl = q(S.rating);
    const stars = parseStars(ratingEl ? ratingEl.textContent : "") ?? parseStars(textOf(q(S.title)));
    // Amazon nests the rating inside the title link: drop it.
    const title = textOf(q(S.title), '[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"], .a-icon-alt, i.a-icon, .a-letter-space').replace(/^[1-5](?:[.,]\d)?\s+out of 5 stars\s*/i, "") || null;
    const body = textOf(q(S.body), '[data-hook="review-body-read-more"], .cr-translate-review, a.a-expander-header').replace(/\s*Read more\s*$/i, "");
    const dateText = textOf(q(S.date));
    const dm = dateText.match(/^Reviewed in (?:the )?(.+?) on (.+)$/i);
    const ht = textOf(q(S.helpful));
    const hm = ht.match(/([\d,]+)\s+people/i);
    const variant = textOf(q(S.variant)).replace(/\s*\|\s*/g, " | ").replace(/^\|\s*|\s*\|$/g, "") || null;
    if (!body && !title) return null;
    return {
      id, stars, title, body,
      date: dateText || null,
      country: dm ? dm[1] : null,
      reviewedOn: dm ? dm[2] : null,
      variant,
      helpful: hm ? Number(hm[1].replace(/,/g, "")) : /^one person/i.test(ht) ? 1 : null,
      verified: !!q(S.verified),
    };
  }

  /**
   * Every review on the page, once each (by review id; the outer review element and its
   * customer_review- wrapper are the same review): { asin, reviews, unparsed }.
   */
  function parseAmazonReviews(doc, url) {
    const seen = new Set(), reviews = [], unparsed = [];
    const els = [...doc.querySelectorAll(REVIEW_SELECTORS.review)]
      // A customer_review- wrapper inside a data-hook="review" element is the same review.
      .filter((el) => !(el.id && el.id.startsWith("customer_review-") && el.closest('[data-hook="review"]')));
    els.forEach((el, index) => {
      try {
        const r = parseReview(el);
        if (!r) { unparsed.push({ index, reason: "no title or body" }); return; }
        const key = r.id || `t:${r.stars}|${r.title}|${r.body.slice(0, 80)}`;
        if (seen.has(key)) return;
        seen.add(key);
        reviews.push(r);
      } catch (e) {
        unparsed.push({ index, reason: String((e && e.message) || e) });
      }
    });
    if (unparsed.length && typeof console !== "undefined") console.warn(`[Wholesale Scout] ${unparsed.length} review(s) not read`, unparsed);
    return { asin: pageAsin(doc, url), reviews, unparsed };
  }

  /** The page shows reviews (a product page only shows the panel when it does). */
  const hasReviews = (doc) => !!doc.querySelector(REVIEW_SELECTORS.review);

  const api = { REVIEW_SELECTORS, parseAmazonReviews, parseReview, parseStars, asinFromUrl, pageAsin, hasReviews };
  root.__wsReviewsParse = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
