import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 as CARD } from "../fees/rateCard";
import { DEFAULT_PROFILE, defaultProfiles, invalidNumbers, withDefaults, type ProfileConfig } from "./config";
import { resolveScoringPrice, runGates, verdictOf, type MarketData, type ScreenContext } from "./gates";
import { DEFAULT_RULES } from "./rules";
import { applyScale, paramValues, winScore } from "./score";
import { yourShare } from "./sales";

const profiles = Object.fromEntries(defaultProfiles().map((p) => [p.name, p.config])) as Record<string, ProfileConfig>;

const market = (over: Partial<MarketData> = {}): MarketData => ({
  hasHistory: true,
  historyDays: 400,
  rankNow: 3000,
  rankDrops30d: 400,
  avgRank90d: 3500,
  rankTrendPct12m: -10,
  currentBuyBox: 24.99,
  medianBuyBox12m: 24.5,
  bbSlopePctYr: 2,
  bbVolatilityPct: 5,
  offersNow: 4,
  offers90dAgo: 4,
  fbaOffers: 4,
  amazonLastSeenDays: null,
  topSellerBbSharePct: 40,
  reviewJumpPct: 3,
  youngerThanParent: false,
  ...over,
});

const ctx = (over: Partial<ScreenContext> = {}): ScreenContext => ({
  now: new Date("2026-09-25T12:00:00Z"),
  card: CARD,
  rules: DEFAULT_RULES,
  text: "Walker Tape double sided 25mm",
  amazonCategory: "DIY & Tools",
  offer: { unitCostGbp: 5, moq: 12, goodsVatRatePct: 20, supplierMovGbp: null },
  match: { asin: "B000TEST01", asinCount: 1, looked: true },
  product: { referralCategory: "Tools and Home Improvement", dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, variationCount: null, hazmat: [] },
  market: market(),
  restriction: { status: "open", message: "" },
  amazonFees: null,
  ...over,
});

const fit = { deliveryDays: 3, supplierRating: 4 };
/** The default profile without the months-to-sell limit, for tests about other demand rules. */
const noMonths = withDefaults({ gates: { ...DEFAULT_PROFILE.gates, demand: { ...DEFAULT_PROFILE.gates.demand, maxMonthsToSell: 1000 } } });

describe("gates", () => {
  it("passes a healthy row through all twelve and scores it green", () => {
    const run = runGates(ctx(), DEFAULT_PROFILE);
    expect(run.outcomes).toHaveLength(12);
    expect(run.failedGate).toBeNull();
    expect(verdictOf(run.outcomes)).toBe("pass");
    const w = winScore(ctx(), run, DEFAULT_PROFILE, fit);
    expect(w.score).toBeGreaterThanOrEqual(75);
    expect(w.band).toBe("green");
    expect(w.why).toMatch(/^\d+ — /);
    expect(w.why).toContain("drops/mo");
  });

  it("scores a spike on the median whatever the rule (Walker Tape, Swiffer)", () => {
    const m = market({ currentBuyBox: 31, medianBuyBox12m: 24, offersNow: 3, offers90dAgo: 6 });
    const current = { ...DEFAULT_PROFILE, scoringPrice: "current" as const };
    expect(resolveScoringPrice(m, current)).toEqual({ price: 24, source: "12-month median (spike)" });
    const run = runGates(ctx({ market: m }), DEFAULT_PROFILE);
    expect(run.scoringPrice).toBe(24);
    expect(run.outcomes.find((o) => o.gate === "priceRegime")?.tags).toContain("SPIKE");
  });

  it("uses the lower of current and median by default", () => {
    expect(resolveScoringPrice(market({ currentBuyBox: 20, medianBuyBox12m: 22 }), DEFAULT_PROFILE).price).toBe(20);
    expect(resolveScoringPrice(market({ currentBuyBox: 26, medianBuyBox12m: 22, offersNow: 5, offers90dAgo: 5 }), DEFAULT_PROFILE).price).toBe(22);
  });

  it("fails fragrance on compliance in Strict and stops there", () => {
    const run = runGates(ctx({ text: "Hugo Boss Bottled Eau de Toilette 100ml" }), profiles.Strict);
    expect(run.failedGate).toBe("compliance");
    expect(run.outcomes.at(-1)!.gate).toBe("compliance");
    expect(run.outcomes.at(-1)!.detail).toMatch(/flammable liquid/i);
  });

  it("only warns on fragrance in Test order", () => {
    const run = runGates(ctx({ text: "Hugo Boss Bottled Eau de Toilette 100ml" }), profiles["Test order"]);
    expect(run.outcomes.find((o) => o.gate === "compliance")?.status).toBe("warn");
  });

  it("fails liquids in Dry goods only but only warns on electrical", () => {
    expect(runGates(ctx({ text: "Chanteclair refill 600ml" }), profiles["Dry goods only"]).failedGate).toBe("compliance");
    expect(runGates(ctx({ text: "USB desk fan" }), profiles["Dry goods only"]).outcomes.find((o) => o.gate === "compliance")?.status).toBe("warn");
  });

  it("caps a line at 30% of budget in Test order", () => {
    // MOQ 100 × (£5 × 1.2 + 0.45) = £645 > £300
    const run = runGates(ctx({ offer: { unitCostGbp: 5, moq: 100, goodsVatRatePct: 20, supplierMovGbp: null } }), profiles["Test order"]);
    expect(run.failedGate).toBe("budgetFit");
  });

  it("fails when Amazon sold within the window", () => {
    const run = runGates(ctx({ market: market({ amazonLastSeenDays: 180 }) }), DEFAULT_PROFILE);
    expect(run.failedGate).toBe("amazonPresence");
  });

  it("fails a doubtful match on a multi-ASIN EAN and leaves it unscored (Onagrine on a Sébium EAN)", () => {
    const c = ctx({
      match: { asin: "B076HZHD2X", asinCount: 2, looked: true },
      sheet: { brand: "Bioderma", title: "Bioderma Sébium Purifying and Foaming Cleansing Gel 500 ml" },
      listing: { brand: "Bioderma", title: "Onagrine CC Cream Extreme Perfection Complexion Perfecting Care 40ml - Dark" },
    });
    const run = runGates(c, DEFAULT_PROFILE);
    expect(run.failedGate).toBe("matchQuality");
    expect(run.outcomes.at(-1)!.tags).toContain("DOUBTFUL_MATCH");
    expect(run.outcomes.at(-1)!.detail).toMatch(/^Doubtful match: /);
    expect(winScore(c, run, DEFAULT_PROFILE, fit).score).toBeNull();

    const soft = withDefaults({ gates: { ...DEFAULT_PROFILE.gates, matchQuality: { mode: "warn" } } });
    expect(runGates(c, soft).failedGate).toBe("matchQuality");

    const right = ctx({ ...c, listing: { brand: "Bioderma", title: "Bioderma Sebium Purifying Cleansing Foaming Gel 500ml" } });
    expect(runGates(right, DEFAULT_PROFILE).outcomes.find((o) => o.gate === "matchQuality")!.status).toBe("warn");
  });

  it("warns on borrowed rank (Chanteclair)", () => {
    const run = runGates(ctx({ market: market({ historyDays: 42 }) }), DEFAULT_PROFILE);
    const m = run.outcomes.find((o) => o.gate === "mirage")!;
    expect(m.status).toBe("warn");
    expect(m.tags).toContain("MIRAGE");
  });

  it("fails blocked listings but only warns on approval-needed by default", () => {
    const blocked = runGates(ctx({ restriction: { status: "blocked", message: "You are not approved to list products with this brand." } }), DEFAULT_PROFILE);
    expect(blocked.failedGate).toBe("gating");
    expect(blocked.outcomes.at(-1)!.detail).toMatch(/^Blocked for your account \(brand\)/);

    const c = ctx({ restriction: { status: "approval_required", message: "You need approval to list this brand." }, product: { ...ctx().product, brand: "Nuxe" } });
    const run = runGates(c, DEFAULT_PROFILE);
    expect(run.failedGate).toBeNull();
    const g = run.outcomes.find((o) => o.gate === "gating")!;
    expect(g).toMatchObject({ status: "warn", detail: "Brand approval needed (Nuxe): You need approval to list this brand." });
    expect(g.tags).toEqual(["APPROVAL", "BRAND"]);
    expect(winScore(c, run, DEFAULT_PROFILE, fit).why).toContain("Watch: Brand approval needed (Nuxe)");

    const strictApproval = withDefaults({ gates: { ...DEFAULT_PROFILE.gates, gating: { mode: "fail", approvalRequired: "fail" } } });
    expect(runGates(c, strictApproval).failedGate).toBe("gating");
  });

  it("carries Amazon's apply link on approval-needed and blocked, https only", () => {
    const links = [
      { resource: "https://sellercentral.amazon.co.uk/hz/approvalrequest?asin=B1", verb: "GET", title: "Request Approval via Seller Central.", type: "text/html" },
      { resource: "javascript:alert(1)", verb: "GET", title: "x", type: null },
    ];
    for (const status of ["approval_required", "blocked"] as const) {
      const g = runGates(ctx({ restriction: { status, message: "You need approval to list this brand.", links } }), DEFAULT_PROFILE).outcomes.find((o) => o.gate === "gating")!;
      expect(g.links).toEqual([links[0]]);
    }
    const none = runGates(ctx({ restriction: { status: "approval_required", message: "x", links: [] } }), DEFAULT_PROFILE).outcomes.find((o) => o.gate === "gating")!;
    expect(none.links).toBeUndefined();
  });

  it("treats a brand recorded as approved as open, but not for category approval or blocks", () => {
    const brandMsg = { status: "approval_required" as const, message: "You need approval to list this brand." };
    const approved = { status: "approved" as const, date: "2026-09-26" };
    const g = (c: ScreenContext) => runGates(c, DEFAULT_PROFILE).outcomes.find((o) => o.gate === "gating")!;
    expect(g(ctx({ restriction: brandMsg, brandApproval: approved }))).toMatchObject({ status: "pass", tags: ["BRAND_APPROVED"] });
    expect(g(ctx({ restriction: { ...brandMsg, message: "You need approval to list in this category." }, brandApproval: approved })).status).toBe("warn");
    expect(g(ctx({ restriction: { status: "blocked", message: "Not eligible" }, brandApproval: approved })).status).toBe("fail");
  });

  it("names category approval with the listing's category", () => {
    const c = ctx({ amazonCategory: "Grocery", restriction: { status: "approval_required", message: "You need approval to list in this category." } });
    expect(runGates(c, DEFAULT_PROFILE).outcomes.find((o) => o.gate === "gating")!.detail).toMatch(/^Category approval needed \(Grocery\)/);
  });

  it("fails cheap products on fees and reports the hurdle price", () => {
    const m = market({ currentBuyBox: 12.5, medianBuyBox12m: 12.5 });
    const run = runGates(ctx({ market: m, offer: { unitCostGbp: 6, moq: 12, goodsVatRatePct: 20, supplierMovGbp: null } }), DEFAULT_PROFILE);
    expect(run.failedGate).toBe("fees");
    expect(run.hurdlePrice).toBeGreaterThan(12.5);
    expect(run.outcomes.at(-1)!.detail).toMatch(/passes at £/);
  });

  it("skips Keepa gates without history instead of failing", () => {
    const m: MarketData = { ...market(), hasHistory: false, historyDays: null, rankDrops30d: null, avgRank90d: null, medianBuyBox12m: null, bbSlopePctYr: null, amazonLastSeenDays: null, topSellerBbSharePct: null, offers90dAgo: null, reviewJumpPct: null };
    const run = runGates(ctx({ market: m }), DEFAULT_PROFILE);
    for (const g of ["mirage", "amazonPresence", "priceRegime", "priceDrift"]) {
      expect(run.outcomes.find((o) => o.gate === g)?.status).toBe("skipped");
    }
    expect(run.failedGate).toBeNull();
    const w = winScore(ctx({ market: m }), run, DEFAULT_PROFILE, fit);
    expect(w.why).toMatch(/No Keepa history/);
    expect(w.band).not.toBe("green");
  });

  describe("Demand: sales and your share decide; the rank only when there's no sales data", () => {
    const demand = (m: MarketData) => runGates(ctx({ market: m }), noMonths).outcomes.find((o) => o.gate === "demand")!;

    it("fails 0 sales in 30 days even with a good rank, which is shown but not gated", () => {
      const d = demand(market({ rankDrops30d: 0, keepaRankDrops30: 0, monthlySold: null, avgRank90d: 1200 }));
      expect(d.status).toBe("fail");
      expect(d.detail).toMatch(/^0 sales in 30 days, under 30/);
      expect(d.detail).toMatch(/90-day average rank 1,200 \(shown, not gated: sales decide\)$/);
    });

    it("passes on good sales and share whatever the rank", () => {
      const d = demand(market({ rankDrops30d: 90, avgRank90d: 120_000, rootCategory: "Toys & Games" }));
      expect(d.status).toBe("pass");
      expect(d.detail).toMatch(/^90 sales\/mo, your share 18\/mo/);
      expect(d.detail).toMatch(/90-day average rank 120,000 \(shown, not gated: sales decide\)$/);
    });

    it("judges on the rank ceiling (the category's, else the profile's) only when there's no sales data", () => {
      const none = { rankDrops30d: null, keepaRankDrops30: null, monthlySold: null };
      // Beauty is tighter (60,000), DIY & Tools looser (150,000), Toys & Games uses the profile's 50,000.
      expect(demand(market({ ...none, avgRank90d: 70_000, rootCategory: "Beauty" }))).toMatchObject({ status: "fail", detail: "no sales data: 90-day average rank 70,000, over 60,000 for Beauty" });
      expect(demand(market({ ...none, avgRank90d: 120_000, rootCategory: "DIY & Tools" }))).toMatchObject({ status: "pass", detail: "no sales data: judged on rank, 90-day average rank 120,000 (DIY & Tools max 150,000)" });
      expect(demand(market({ ...none, avgRank90d: 60_000, rootCategory: "Toys & Games" })).detail).toBe("no sales data: 90-day average rank 60,000, over 50,000");
      expect(demand(market({ ...none, avgRank90d: 8_000, rootCategory: "Toys & Games" })).detail).toBe("no sales data: judged on rank, 90-day average rank 8,000 (max 50,000)");
      // No Keepa category on an older snapshot: the catalog's ("DIY & Tools" in these tests).
      expect(demand(market({ ...none, avgRank90d: 120_000 })).status).toBe("pass");
      expect(demand(market({ ...none, avgRank90d: null, rankNow: null }))).toMatchObject({ status: "fail", detail: "no sales data and no rank in the last 90 days" });
    });

    it("counts sales the way the Sales / mo column does (the highest source)", () => {
      expect(demand(market({ rankDrops30d: null, keepaRankDrops30: 45, avgRank90d: 8000 })).status).toBe("pass");
      expect(demand(market({ rankDrops30d: 5, monthlySold: 100, avgRank90d: 8000 })).detail).toMatch(/^100 sales\/mo/);
    });

    it("never passes on a current rank alone: without history it is skipped", () => {
      const d = demand(market({ hasHistory: false, rankDrops30d: null, avgRank90d: null, rankNow: 1500 }));
      expect(d.status).toBe("skipped");
      expect(d.detail).toMatch(/current rank 1,500/);
    });
  });

  describe("your share", () => {
    const demand = (m: MarketData, p = noMonths) => runGates(ctx({ market: m }), p).outcomes.find((o) => o.gate === "demand")!;
    const lowTotal = withDefaults({ gates: { ...noMonths.gates, demand: { ...noMonths.gates.demand, minRankDrops30d: 10 } } });

    it("divides sales by the FBA sellers plus you, with Amazon counted as three", () => {
      expect(yourShare(market({ rankDrops30d: 100, fbaOffers: 4, amazonLastSeenDays: 400 })).value).toBe(20);
      expect(yourShare(market({ rankDrops30d: 100, fbaOffers: 4, amazonLastSeenDays: 0 })).value).toBe(12.5); // 100 ÷ (4 + 3 + 1)
      // All-offers fallback already counts Amazon once.
      expect(yourShare(market({ rankDrops30d: 100, fbaOffers: null, offersNow: 5, amazonLastSeenDays: 0 })).value).toBe(12.5);
      expect(yourShare(market({ hasHistory: false })).value).toBeNull();
    });

    it("passes a low-volume product with few sellers once the total minimum allows it", () => {
      const m = market({ rankDrops30d: 18, keepaRankDrops30: null, monthlySold: null, fbaOffers: 1, avgRank90d: 20000 });
      expect(demand(m).status).toBe("fail"); // 18 is under the default 30 total
      const d = demand(m, lowTotal);
      expect(d.status).toBe("pass");
      expect(d.detail).toMatch(/^18 sales\/mo, your share 9\/mo; order \d+ sells in [\d.]+ months?; 90-day average rank 20,000 \(shown, not gated: sales decide\)$/);
    });

    it("flags a high-volume product split twenty ways", () => {
      const d = demand(market({ rankDrops30d: 100, keepaRankDrops30: null, monthlySold: null, fbaOffers: 20, amazonLastSeenDays: 400 }));
      expect(d.status).toBe("fail");
      expect(d.detail).toBe("your share 4.8/mo, under 5 (100 sales ÷ 20 other sellers + you); 90-day average rank 3,500 (shown, not gated: sales decide)");
    });

    it("feeds your profit a month into the Margin group", () => {
      const c = ctx();
      const run = runGates(c, DEFAULT_PROFILE);
      const v = paramValues(c, run, DEFAULT_PROFILE, fit);
      expect(v.profitPerMonth).toBeCloseTo(80 * run.economics!.profit!, 1); // 400 ÷ (4 + 1)
      expect(winScore(c, run, DEFAULT_PROFILE, fit).groups.margin.params.map((x) => x.key)).toContain("profitPerMonth");
    });
  });

  describe("months to sell the first order", () => {
    // £1,000 budget × 25% line cap = £250; landed cost ≈ £6.25 a unit, so the order is ~40 units.
    const cap25 = (months: number) => withDefaults({ gates: { ...DEFAULT_PROFILE.gates, budgetFit: { mode: "fail", maxLineSharePct: 25 }, demand: { ...DEFAULT_PROFILE.gates.demand, minRankDrops30d: 5, minSharePerMonth: 1, maxMonthsToSell: months } } });
    const slow = market({ rankDrops30d: 10, keepaRankDrops30: null, monthlySold: null, fbaOffers: 1, avgRank90d: 20000 }); // your share 5/mo

    it("fails an order that takes longer than the limit to sell, and says the sum", () => {
      const run = runGates(ctx({ market: slow }), cap25(3));
      const d = run.outcomes.find((o) => o.gate === "demand")!;
      expect(run.failedGate).toBe("demand");
      expect(d.detail).toMatch(/^(\d+) units at 5\/mo = (\d+(\.\d)?) months, over 3; 90-day average rank 20,000 \(shown, not gated: sales decide\)$/);
      const [, units, months] = d.detail.match(/^(\d+) units at 5\/mo = ([\d.]+) months/)!;
      expect(Number(months)).toBeCloseTo(Number(units) / 5, 1);
    });

    it("passes when the order sells in time, and says how long", () => {
      const d = runGates(ctx({ market: slow }), cap25(12)).outcomes.find((o) => o.gate === "demand")!;
      expect(d.status).toBe("pass");
      expect(d.detail).toMatch(/; order \d+ sells in [\d.]+ months; 90-day average rank 20,000 \(shown, not gated: sales decide\)$/);
    });

    it("orders the MOQ when it's over the line cap, and flags it", () => {
      const d = runGates(ctx({ market: slow, offer: { unitCostGbp: 5, moq: 200, goodsVatRatePct: 20, supplierMovGbp: null } }), withDefaults({ ...cap25(3), gates: { ...cap25(3).gates, budgetFit: { mode: "off", maxLineSharePct: 25 } } })).outcomes.find((o) => o.gate === "demand")!;
      expect(d.detail).toBe("200 units (MOQ) at 5/mo = 40 months, over 3; 90-day average rank 20,000 (shown, not gated: sales decide)");
    });
  });

  describe("liquids above a volume", () => {
    const liquidAbove = (ml: number | null) => withDefaults({ gates: { ...noMonths.gates, compliance: { mode: "fail", rules: { ...noMonths.gates.compliance.rules, liquid: "warn" }, liquidAboveMl: ml } } });
    const comp = (text: string, ml: number | null) => runGates(ctx({ text }), liquidAbove(ml)).outcomes.find((o) => o.gate === "compliance")!;
    it("flags only liquids over the volume, and says the volume", () => {
      expect(comp("Bioderma Sensibio micellar water 250ml", 500)).toMatchObject({ status: "pass" });
      expect(comp("Bioderma Sensibio micellar water 750ml", 500)).toMatchObject({ status: "warn", detail: "Liquid (750 ml, over 500 ml)" });
      expect(comp("Shampoo", 500)).toMatchObject({ status: "pass" });
      expect(comp("Bioderma Sensibio micellar water 250ml", null).status).toBe("warn");
    });
  });

  describe("dormant listings", () => {
    const dormant = (over: Partial<MarketData> = {}) => market({
      rankNow: null, currentBuyBox: null, avgRank90d: null, rankDrops30d: 0, keepaRankDrops30: 0, offersNow: 0, fbaOffers: null,
      medianBuyBox12m: null, lastBuyBox12m: 18.5, lastBuyBoxAt: "2026-03-03T10:00:00Z", rankDrops12m: 600, avgRank12m: 9000, lastOfferDaysAgo: 206,
      ...over,
    });

    it("judges a dormant listing on its 12-month rank only when there are no rank drops to count", () => {
      const d = (over: Partial<MarketData>) => runGates(ctx({ market: dormant(over) }), noMonths).outcomes.find((o) => o.gate === "demand")!;
      expect(d({ rankDrops12m: null, avgRank12m: 9000 })).toMatchObject({ status: "pass", detail: "dormant, no sales data: judged on rank, 12-month average 9,000 (DIY & Tools max 150,000)" });
      expect(d({ rankDrops12m: null, avgRank12m: 400_000 })).toMatchObject({ status: "fail", detail: "dormant, no sales data: 12-month average rank 400,000, over 150,000 for DIY & Tools" });
      expect(d({ rankDrops12m: null, avgRank12m: null }).detail).toBe("dormant: no sales history (Keepa has no sales rank for it in 12 months)");
    });

    it("scores on the last Buy Box seen in 12 months and 12 months of rank drops", () => {
      const c = ctx({ market: dormant() });
      expect(resolveScoringPrice(c.market, DEFAULT_PROFILE)).toEqual({ price: 18.5, source: "last seen £18.50 on 3 Mar 2026" });
      const run = runGates(c, noMonths);
      const demand = run.outcomes.find((o) => o.gate === "demand")!;
      expect(demand.status).toBe("pass");
      expect(demand.detail).toMatch(/^dormant: 600 rank drops in 12 months \(50\/mo\); order \d+ sells in [\d.]+ months?; 12-month average rank 9,000 \(shown, not gated: sales decide\)$/);
      expect(demand.tags).toContain("DORMANT");
      expect(run.outcomes.find((o) => o.gate === "competition")!.detail).toBe("dormant: no sellers now, none for 206 days");
      const w = winScore(c, run, noMonths, fit);
      expect(w.score).not.toBeNull();
      expect(w.why).toMatch(/^Dormant: no seller for 206 days; priced on the last seen £18\.50 on 3 Mar 2026\. \d+ — /);
      expect(w.why).not.toMatch(/Not scored/);
    });

    it("fails a dormant listing with no sales in 12 months", () => {
      const run = runGates(ctx({ market: dormant({ rankDrops12m: 0 }) }), DEFAULT_PROFILE);
      expect(run.failedGate).toBe("demand");
      expect(run.outcomes.at(-1)!.detail).toMatch(/^dormant: no sales history/);
    });

    it("fails a dormant listing selling too slowly over the year", () => {
      const d = runGates(ctx({ market: dormant({ rankDrops12m: 60 }) }), DEFAULT_PROFILE).outcomes.find((o) => o.gate === "demand")!;
      expect(d.status).toBe("fail");
      expect(d.detail).toMatch(/60 rank drops in 12 months \(5\/mo\), under 30\/mo/);
    });

    it("isn't scored on a price when no Buy Box was seen in the year", () => {
      expect(resolveScoringPrice(dormant({ lastBuyBox12m: null, lastBuyBoxAt: null }), DEFAULT_PROFILE).price).toBeNull();
    });
  });

  it("runs only the cheap row gates in the pre-screen", () => {
    const run = runGates(ctx({ market: null, match: null }), DEFAULT_PROFILE, ["compliance", "budgetFit"]);
    expect(run.outcomes.map((o) => o.gate)).toEqual(["compliance", "budgetFit"]);
  });

  it("respects a gate switched off", () => {
    const p = withDefaults({ gates: { ...noMonths.gates, amazonPresence: { mode: "off", days: 365 } } });
    const run = runGates(ctx({ market: market({ amazonLastSeenDays: 0 }) }), p);
    expect(run.outcomes.find((o) => o.gate === "amazonPresence")?.status).toBe("off");
    expect(run.failedGate).toBeNull();
  });
});

describe("Keepa extras in the gates", () => {
  it("fills size from Keepa when the catalog has none, and says so", () => {
    const c = ctx({ product: { ...ctx().product, dimsCm: { l: 21.2, w: 7.1, h: 7 }, weightG: 570, dimsSource: "keepa" } });
    expect(runGates(c, DEFAULT_PROFILE).outcomes.at(-1)!.detail).toMatch(/\(size from Keepa\)$/);
  });

  it("flags a size-tier disagreement between the catalog and Keepa, in the fee detail and the why", () => {
    const c = ctx({ product: {
      ...ctx().product, dimsCm: { l: 15, w: 12, h: 8 }, weightG: 200, dimsSource: "catalog",
      keepaDims: { l: 40, w: 30, h: 20 }, keepaWeightG: 2000,
    } });
    const run = runGates(c, DEFAULT_PROFILE);
    const fee = run.outcomes.find((o) => o.gate === "fees")!;
    expect(fee.tags).toContain("TIER_MISMATCH");
    expect(fee.detail).toContain("size tier disagreement: SP-API catalog says Small parcel, Keepa says Standard parcel");
    expect(winScore(c, run, DEFAULT_PROFILE, fit).why).toContain("Watch: size tier disagreement");
    const same = ctx({ product: { ...c.product, keepaDims: { l: 15, w: 12, h: 8 }, keepaWeightG: 210 } });
    expect(runGates(same, DEFAULT_PROFILE).outcomes.find((o) => o.gate === "fees")!.tags ?? []).not.toContain("TIER_MISMATCH");
  });

  it("flags a likely brand distributor as a warning and counts it against Risk", () => {
    const seller = { sellerId: "S1", sharePct: 62, name: "Pierre Fabre UK", ratingPct: 99, ratingCount: 5000, storefrontSize: 400, brandSharePct: 78 };
    const c = ctx({ product: { ...ctx().product, brand: "Bioderma" }, sellers: [seller] });
    const run = runGates(c, DEFAULT_PROFILE);
    const comp = run.outcomes.find((o) => o.gate === "competition")!;
    expect(comp).toMatchObject({ status: "warn", tags: ["BRAND_DISTRIBUTOR"] });
    expect(comp.detail).toBe("likely brand distributor: Pierre Fabre UK (78% of 400 storefront listings are Bioderma, 62% of the Buy Box)");
    const flagged = winScore(c, run, DEFAULT_PROFILE, fit);
    const clean = winScore(ctx(), runGates(ctx(), DEFAULT_PROFILE), DEFAULT_PROFILE, fit);
    expect(flagged.groups.risk.score!).toBeLessThan(clean.groups.risk.score!);
    expect(flagged.why).toContain("Watch: likely brand distributor: Pierre Fabre UK");
    const below = ctx({ sellers: [{ ...seller, brandSharePct: 14 }] });
    expect(runGates(below, DEFAULT_PROFILE).outcomes.find((o) => o.gate === "competition")!.status).toBe("pass");
  });

  it("uses the variation count for Risk", () => {
    const few = winScore(ctx(), runGates(ctx(), DEFAULT_PROFILE), DEFAULT_PROFILE, fit);
    const many = ctx({ product: { ...ctx().product, variationCount: 40 } });
    expect(winScore(many, runGates(many, DEFAULT_PROFILE), DEFAULT_PROFILE, fit).groups.risk.score!).toBeLessThan(few.groups.risk.score!);
  });
});

describe("score", () => {
  it("interpolates scales and clamps at the ends", () => {
    const s = { points: [[10, 0], [200, 100]] as [number, number][], weight: 1 };
    expect(applyScale(s, 5)).toBe(0);
    expect(applyScale(s, 105)).toBe(50);
    expect(applyScale(s, 500)).toBe(100);
    const sellers = DEFAULT_PROFILE.score.scales.sellers;
    expect(applyScale(sellers, 4)).toBe(100);
    expect(applyScale(sellers, 12)).toBe(30);
    expect(applyScale(sellers, 1)).toBe(40);
  });

  it("gives no score to a failed row", () => {
    const run = runGates(ctx({ market: market({ amazonLastSeenDays: 10 }) }), DEFAULT_PROFILE);
    const w = winScore(ctx(), run, DEFAULT_PROFILE, fit);
    expect(w.score).toBeNull();
    expect(w.why).toMatch(/^Failed amazon presence/);
  });

  it("lowers the score when warn gates trip", () => {
    const clean = winScore(ctx(), runGates(ctx(), DEFAULT_PROFILE), DEFAULT_PROFILE, fit).score!;
    const eroding = ctx({ market: market({ bbSlopePctYr: -30 }) });
    const worse = winScore(eroding, runGates(eroding, DEFAULT_PROFILE), DEFAULT_PROFILE, fit).score!;
    expect(worse).toBeLessThan(clean);
  });

  it("re-weights when group weights change", () => {
    const heavyFit = withDefaults({ score: { ...DEFAULT_PROFILE.score, weights: { demand: 0, competition: 0, priceHealth: 0, margin: 0, risk: 0, fit: 100 } } });
    const run = runGates(ctx(), heavyFit);
    const w = winScore(ctx(), run, heavyFit, fit);
    expect(w.score).toBeCloseTo(w.groups.fit.score!, 1);
  });
});

describe("score coverage", () => {
  it("won't score a row with no sell price, and says what it needs", () => {
    const c = ctx({ market: null });
    const w = winScore(c, runGates(c, DEFAULT_PROFILE), DEFAULT_PROFILE, fit);
    expect(w.score).toBeNull();
    expect(w.why).toMatch(/^Not scored: needs a sell price and rank data\. Clears the profit floors at £\d+\.\d\d/);
  });
});

describe("config validation", () => {
  it("accepts the defaults and names emptied fields", () => {
    expect(defaultProfiles().flatMap((p) => invalidNumbers(p.config))).toEqual([]);
    const bad = structuredClone(DEFAULT_PROFILE);
    bad.gates.priceBand.min = NaN;
    bad.score.scales.roi.points[1] = [NaN, 100];
    bad.fees.inboundPerUnit = null as unknown as number;
    expect(invalidNumbers(bad)).toEqual(expect.arrayContaining(["gates.priceBand.min", "score.scales.roi.points[1][0]", "fees.inboundPerUnit"]));
  });
});

describe("gate waivers", () => {
  it("turns a fail into a warn tagged 'waived by you' and lets later gates run", () => {
    const c = ctx({ market: market({ amazonLastSeenDays: 30 }) });
    expect(runGates(c, DEFAULT_PROFILE).failedGate).toBe("amazonPresence");
    const waived = ctx({ ...c, waivers: new Map([["amazonPresence", "Amazon out of stock for months"]]) });
    const run = runGates(waived, DEFAULT_PROFILE);
    expect(run.failedGate).toBeNull();
    const g = run.outcomes.find((o) => o.gate === "amazonPresence")!;
    expect(g).toMatchObject({ status: "warn", tags: expect.arrayContaining(["AMAZON", "WAIVED"]) });
    expect(g.detail).toBe("Amazon sold 30 days ago (waived by you: Amazon out of stock for months)");
    expect(run.outcomes.at(-1)!.gate).toBe("fees"); // later gates ran
    const w = winScore(waived, run, DEFAULT_PROFILE, fit);
    expect(w.score).not.toBeNull();
    expect(w.why).toContain("Watch: Amazon sold 30 days ago (waived by you");
  });

  it("doesn't touch a gate that passed, or other gates", () => {
    const c = ctx({ waivers: new Map([["fees", null]]), market: market({ amazonLastSeenDays: 30 }) });
    expect(runGates(c, DEFAULT_PROFILE).failedGate).toBe("amazonPresence");
  });

  it("says how many units fit the budget", () => {
    // Test order caps a line at 30% of £1,000 = £300. MOQ 300 at £6.45 landed = £1,935.
    const c = ctx({ offer: { unitCostGbp: 5, moq: 300, goodsVatRatePct: 20, supplierMovGbp: null } });
    const run = runGates(c, profiles["Test order"]);
    expect(run.outcomes.find((o) => o.gate === "budgetFit")!.detail).toBe("MOQ 300 × £6.45 = £1935.00, over the £300.00 line cap; 46 units fit");
  });
});
