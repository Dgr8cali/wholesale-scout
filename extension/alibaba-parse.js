// Alibaba search results → supplier listings (Supplier Scout). Plain DOM reading, no network: the
// extension runs it on the page you're looking at, and the app's tests run it on a saved page
// (docs/samples/alibaba/lens-wipes.html). When Alibaba changes its markup, update ALIBABA_SELECTORS.
(function (root) {
  /** Every selector the parser uses, in one place. */
  const ALIBABA_SELECTORS = {
    /** One product card. */
    card: ".fy26-product-card-wrapper, .fy23-search-card, .searchx-offer-item",
    title: 'h2 a[data-spm="d_title"], h2.searchx-product-e-title a, .searchx-product-e-title a',
    price: ".searchx-product-price-price-main, .searchx-product-price",
    moq: ".searchx-moq",
    sold: ".searchx-sold-order",
    company: ".searchx-product-e-company",
    verified: ".verified-supplier-icon__wrapper",
    verifiedPro: ".verified-pro-supplier-icon__wrapper, img[alt*='Verified Pro' i], [data-aplus-auto-card-mod*='areaContent=verifiedPro']",
    years: ".searchx-product-e-supplier__year",
    review: ".searchx-product-e-review",
    reviewScore: ".searchx-review-score",
    /** The tracking attribute each card area carries: "area=price&areaContent=£0.30-0.53&…". */
    areaAttr: "data-aplus-auto-card-mod",
    /** The page's Trade Assurance filter, when it's switched on. */
    tradeAssuranceFilter: '[data-query-key="ta"]',
  };

  const UNIT = { boxes: "box", box: "box", pieces: "piece", piece: "piece", pcs: "piece", pc: "piece", bags: "bag", bag: "bag", packs: "pack", pack: "pack", sets: "set", set: "set", units: "unit", unit: "unit", rolls: "roll", roll: "roll", cartons: "carton", carton: "carton", pairs: "pair", pair: "pair", bottles: "bottle", bottle: "bottle", sachets: "sachet", sachet: "sachet", packets: "packet", packet: "packet", barrels: "barrel", kilograms: "kg", kilogram: "kg", kg: "kg", tons: "ton", ton: "ton" };
  const CURRENCY = [["US$", "USD"], ["$", "USD"], ["£", "GBP"], ["€", "EUR"], ["¥", "CNY"], ["CN¥", "CNY"]];

  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const num = (s) => {
    const n = Number(String(s).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  /** A unit word in its singular form ("boxes" → "box"), or the word itself lower-cased. */
  const unitOf = (w) => (w ? UNIT[w.toLowerCase()] || w.toLowerCase().replace(/s$/, "") : null);

  /** areaContent of the card's element tracked as `area` (URL-decoded), or "". */
  function area(card, name) {
    const el = card.querySelector(`[${ALIBABA_SELECTORS.areaAttr}*="area=${name}&"], [${ALIBABA_SELECTORS.areaAttr}$="area=${name}"]`);
    if (!el) return "";
    const m = (el.getAttribute(ALIBABA_SELECTORS.areaAttr) || "").match(/areaContent=([^&]*)/);
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  const areas = (card, name) => [...card.querySelectorAll(`[${ALIBABA_SELECTORS.areaAttr}*="area=${name}&"]`)].map((el) => {
    const m = (el.getAttribute(ALIBABA_SELECTORS.areaAttr) || "").match(/areaContent=([^&]*)/);
    try { return m ? decodeURIComponent(m[1]) : ""; } catch { return m ? m[1] : ""; }
  });

  /** "£0.3053-0.5342 / box" → { min, max, currency, unit }. */
  function parsePrice(s) {
    if (!s) return null;
    let currency = null;
    for (const [sym, code] of CURRENCY) if (s.includes(sym)) { currency = code; break; }
    if (!currency) { const m = s.match(/\b(USD|GBP|EUR|CNY)\b/); if (m) currency = m[1]; }
    const nums = (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(num).filter((n) => n != null);
    if (!nums.length) return null;
    const u = s.match(/\/\s*([A-Za-z]+)/);
    return { min: Math.min(nums[0], nums[1] ?? nums[0]), max: Math.max(nums[0], nums[1] ?? nums[0]), currency, unit: u ? unitOf(u[1]) : null };
  }

  /** "Min. order: 1000 boxes" → { moq: 1000, unit: "box" }. */
  function parseMoq(s) {
    const m = (s || "").match(/(\d[\d,]*)\s*([A-Za-z]+)?/);
    return m ? { moq: num(m[1]), unit: unitOf(m[2]) } : null;
  }

  /** A listing URL without its tracking query: one listing, one URL. */
  function cleanUrl(href) {
    if (!href) return null;
    try {
      const u = new URL(href, "https://www.alibaba.com/");
      return `${u.origin}${u.pathname}`;
    } catch { return null; }
  }

  /** The Trade Assurance filter is on (the URL's ta=y, or the filter shown checked): every card is TA. */
  function tradeAssuranceOn(doc, pageUrl) {
    try { if (new URL(pageUrl || "").searchParams.get("ta") === "y") return true; } catch { /* no URL */ }
    const f = doc.querySelector(ALIBABA_SELECTORS.tradeAssuranceFilter);
    return !!f && /checked=true/.test(f.getAttribute("data-pro-search") || "") ;
  }

  /** One card, or { error } with why it couldn't be read. */
  function parseCard(card, ctx) {
    const S = ALIBABA_SELECTORS;
    const t = card.querySelector(S.title);
    const listingUrl = cleanUrl(t && t.getAttribute("href"));
    const title = text(t);
    if (!listingUrl || !title) return { error: "no title link" };
    const price = parsePrice(text(card.querySelector(S.price)) || area(card, "price"));
    const moq = parseMoq(text(card.querySelector(S.moq)) || area(card, "moq"));
    const soldM = text(card.querySelector(S.sold)).match(/(\d[\d,]*)\s*sold/i);
    const company = card.querySelector(S.company);
    // "CN@@9 yrs", or the element's own text "9 yrs CN".
    const yr = area(card, "supplierYear") || text(card.querySelector(S.years));
    const yearsM = yr.match(/(\d+)\s*yrs?/i);
    const countryM = yr.match(/^([A-Z]{2})@@/) || text(card.querySelector(S.years)).match(/\b([A-Z]{2})\b/);
    // "4.9@@22", or "4.9/5.0 (22)".
    const rv = area(card, "review");
    let rating = null, reviews = null;
    const rvM = rv.match(/^([\d.]+)@@(\d+)/);
    if (rvM) { rating = num(rvM[1]); reviews = num(rvM[2]); }
    else {
      const r = card.querySelector(S.review);
      if (r) { rating = num(text(card.querySelector(S.reviewScore))); const c = text(r).match(/\((\d[\d,]*)\)/); reviews = c ? num(c[1]) : null; }
    }
    const badges = [];
    if (card.querySelector(S.verified) || area(card, "verified") === "verified") badges.push("Verified");
    if (card.querySelector(S.verifiedPro)) badges.push("Verified Pro");
    if (ctx.tradeAssurance) badges.push("Trade Assurance");
    if (areas(card, "productIcon").includes("ag")) badges.push("Alibaba Guaranteed");
    const delivery = areas(card, "sellPoint").map((x) => x.split("@@")[1] || "").find((x) => /deliver/i.test(x)) || null;
    const starsArea = area(card, "ggs");
    return {
      productId: card.getAttribute("data-ctrdot") || null,
      listingUrl, title,
      priceMin: price ? price.min : null, priceMax: price ? price.max : null, currency: price ? price.currency : null,
      // Alibaba prices are per the order unit ("Min. order: 1000 boxes": per box) unless the price says otherwise.
      priceUnit: price && price.unit ? price.unit : moq ? moq.unit : null,
      priceUnitFrom: price && price.unit ? "listed" : moq && moq.unit ? "moq" : null,
      moq: moq ? moq.moq : null, moqUnit: moq ? moq.unit : null,
      supplierName: text(company) || null,
      storeUrl: company ? cleanUrl(company.getAttribute("href")) : null,
      supplierYears: yearsM ? num(yearsM[1]) : null,
      country: countryM ? countryM[1] : null,
      rating, reviewCount: reviews,
      supplierStars: starsArea !== "" ? num(starsArea) : null,
      badges,
      soldCount: soldM ? num(soldM[1]) : null,
      delivery,
    };
  }

  /** Every card on the page: { cards, unparsed: [{ index, reason }] }. Never throws on one bad card. */
  function parseAlibabaResults(doc, pageUrl) {
    const ctx = { tradeAssurance: tradeAssuranceOn(doc, pageUrl) };
    const cards = [], unparsed = [];
    [...doc.querySelectorAll(ALIBABA_SELECTORS.card)].forEach((card, index) => {
      try {
        const r = parseCard(card, ctx);
        if (r.error) unparsed.push({ index, reason: r.error });
        else cards.push(r);
      } catch (e) {
        unparsed.push({ index, reason: String((e && e.message) || e) });
      }
    });
    if (unparsed.length && typeof console !== "undefined") console.warn(`[Wholesale Scout] ${unparsed.length} Alibaba card(s) not read`, unparsed);
    return { cards, unparsed, tradeAssurance: ctx.tradeAssurance };
  }

  const api = { ALIBABA_SELECTORS, parseAlibabaResults, parsePrice, parseMoq, unitOf };
  root.__wsAlibaba = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
