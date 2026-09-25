import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 as CARD } from "../fees/rateCard";
import { DEFAULT_PROFILE, defaultProfiles, invalidNumbers, withDefaults, type ProfileConfig } from "./config";
import { resolveScoringPrice, runGates, verdictOf, type MarketData, type ScreenContext } from "./gates";
import { DEFAULT_RULES } from "./rules";
import { applyScale, winScore } from "./score";

const profiles = Object.fromEntries(defaultProfiles().map((p) => [p.name, p.config])) as Record<string, ProfileConfig>;

const market = (over: Partial<MarketData> = {}): MarketData => ({
  hasHistory: true,
  historyDays: 400,
  rankNow: 3000,
  rankDrops30d: 140,
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

  it("runs only the cheap row gates in the pre-screen", () => {
    const run = runGates(ctx({ market: null, match: null }), DEFAULT_PROFILE, ["compliance", "budgetFit"]);
    expect(run.outcomes.map((o) => o.gate)).toEqual(["compliance", "budgetFit"]);
  });

  it("respects a gate switched off", () => {
    const p = withDefaults({ gates: { ...DEFAULT_PROFILE.gates, amazonPresence: { mode: "off", days: 365 } } });
    const run = runGates(ctx({ market: market({ amazonLastSeenDays: 0 }) }), p);
    expect(run.outcomes.find((o) => o.gate === "amazonPresence")?.status).toBe("off");
    expect(run.failedGate).toBeNull();
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
