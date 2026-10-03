import { describe, expect, it } from "vitest";
import { buildBank, headTermsFromBank } from "./bank";
import { bulkRows } from "./bulk";
import { buildLaunch } from "./launch";
import { listsFor, normTerm, parseList, whitelistHit } from "./lists";
import { DEFAULT_RULES, mergeRules, runRules, type RuleCampaign, type RulesInput, type RuleTerm } from "./rules";
import { conversionTxt, priorConversion, smoothedConversion } from "./smooth";
import { acosForTacos, breakEvenTacos, listingHealth, median, organicShare, suggestTacos } from "./tacos";

describe("1. smoothed conversion", () => {
  it("(orders + k × prior) ÷ (clicks + k); prior: product, else account, else 7%", () => {
    // The spec's example: 3 orders / 12 clicks at a 6.7% product prior, k = 20.
    const prior = priorConversion({ clicks: 195, orders: 13 }, null, 20);
    expect(prior).toMatchObject({ source: "product" });
    const s = smoothedConversion(3, 12, prior.value, 20);
    expect(s).toBeCloseTo((3 + 20 * 13 / 195) / 32, 6); // 13.5%
    expect(conversionTxt(3, 12, s, prior)).toBe("3 orders / 12 clicks raw 25%, smoothed 14% (towards the product's 6.7%)");
    expect(priorConversion({ clicks: 5, orders: 1 }, { clicks: 300, orders: 30 }, 20)).toMatchObject({ source: "account", value: 0.1 });
    expect(priorConversion(null, { clicks: 3, orders: 0 }, 20)).toEqual({ value: 0.07, source: "default" });
    expect(smoothedConversion(0, 0, 0.07, 20)).toBeCloseTo(0.07, 6);
  });
});

describe("2. whitelist and blacklist", () => {
  it("normalised, merged with the account's unless left out; hits in both directions", () => {
    expect(normTerm("  Pill-Box  ORGANISER! ")).toBe("pill box organiser");
    expect(parseList("free\nUsed, free\n\nreplacement")).toEqual(["free", "used", "replacement"]);
    const account = { whitelist: ["acme"], blacklist: ["free"] };
    expect(listsFor(account, { whitelist: ["pill box"], blacklist: [], useAccount: true })).toEqual({ whitelist: ["acme", "pill box"], blacklist: ["free"] });
    expect(listsFor(account, { whitelist: ["pill box"], blacklist: [], useAccount: false })).toEqual({ whitelist: ["pill box"], blacklist: [] });
    expect(whitelistHit("pill box organiser weekly", ["pill box"])).toBe("pill box");
    expect(whitelistHit("box", ["pill box"])).toBe("pill box"); // negating "box" would block "pill box"
    expect(whitelistHit("boxes", ["pill box"])).toBeNull();
  });
});

describe("4. TACoS mode and 5. listing health", () => {
  it("organic share, break-even TACoS, the ACoS a TACoS target allows, the switch suggestion", () => {
    const split = { adUnits: 14, totalUnits: 28, adSales: 125.86, totalSales: 243.62 };
    expect(organicShare(split)).toBe(0.5);
    expect(organicShare({ ...split, totalUnits: null })).toBeNull();
    expect(breakEvenTacos(4.38, 8.99)).toBeCloseTo(0.487, 3);
    // 20% TACoS at a 51.7% ad share of sales allows 38.7% ACoS.
    const a = acosForTacos(0.2, split);
    expect(a.adShare).toBeCloseTo(0.5166, 3);
    expect(a.acos).toBeCloseTo(0.387, 3);
    expect(acosForTacos(0.5, { ...split, adSales: 20 })).toMatchObject({ acos: 1, capped: true });
    expect([suggestTacos(0.6, 40), suggestTacos(0.6, 12), suggestTacos(0.4, 40), suggestTacos(null, 40)]).toEqual([true, false, false, false]);
  });
  it("listing health: the pill box (CTR 0.62% vs 0.4%, CVR 6.7% vs the account median) is fine; a weak CVR flags it", () => {
    const h = listingHealth({ impressions: 31698, clicks: 195, orders: 13, period: "over 10 Aug – 2 Oct" }, { ctr: 0.004, cvr: median([13 / 195]), cvrSource: "(account median)" });
    expect(h.status).toBe("ok");
    expect(h.message).toBe("CTR 0.62% vs 0.40% benchmark ok · CVR 6.7% vs 6.7% (account median) ok over 10 Aug – 2 Oct.");
    const bad = listingHealth({ impressions: 40000, clicks: 200, orders: 6, period: "x" }, { ctr: 0.004, cvr: 0.101, cvrSource: "(niche)" });
    expect(bad).toMatchObject({ status: "problem", problems: ["cvr"] });
    expect(bad.message).toMatch(/Likely a listing problem, not a bidding one — fix images\/price\/title before raising bids/);
    expect(listingHealth({ impressions: 1000, clicks: 40, orders: 1, period: "x" }, { ctr: 0.004, cvr: 0.1, cvrSource: "" }).status).toBe("not enough data");
    expect(median([0.05, 0.09, 0.07, 0.11])).toBeCloseTo(0.08, 6);
  });
});

describe("6. keyword bank", () => {
  it("merged by normalised text across sources, with stats, rank and status; head terms for the launcher", () => {
    const rows = buildBank({
      sources: [
        { text: "Pill Box", source: "poe", searches: 9000 }, { text: "pill box", source: "harvested" }, { text: "pill organiser", source: "poe", searches: 12000 },
        { text: "weekly pill box", source: "manual" }, { text: "daily pill case", source: "rank" }, { text: "free pill box", source: "manual" },
      ],
      terms: [{ term: "pill box", clicks: 8, cost: 4.97, orders: 2, sales: 17.98 }, { term: "pill organiser", clicks: 23, cost: 12.76, orders: 0, sales: 0 }],
      keywords: [{ text: "pill box", matchType: "Exact", state: "enabled" }, { text: "weekly pill box", matchType: "Broad", state: "enabled" }],
      negatives: [{ text: "pill organiser", matchType: "Negative exact" }, { text: "free", matchType: "Negative phrase" }],
      ranks: { "daily pill case": { position: 7, checkedAt: "2026-10-01" } }, tracked: ["daily pill case"],
    });
    expect(rows.map((r) => [r.norm, r.sources.join("+"), r.status])).toEqual([
      ["pill organiser", "poe", "negatived"], ["pill box", "poe+harvested", "targeted exact"],
      ["daily pill case", "rank", "not targeted"], ["free pill box", "manual", "negatived"], ["weekly pill box", "manual", "targeted broad"],
    ]);
    expect(rows[1]).toMatchObject({ searches: 9000, clicks: 8, orders: 2 });
    expect(rows[1].acos).toBeCloseTo(0.2764, 3);
    expect(rows[2]).toMatchObject({ rank: { position: 7 }, tracked: true });
    expect(headTermsFromBank(rows, 3)).toEqual(["pill box", "weekly pill box", "daily pill case"]);
  });
});

describe("the rules: windows, lists, TACoS, listing health", () => {
  const camp = (over: Partial<RuleCampaign> = {}): RuleCampaign => ({ id: "c1", campaignId: "111", name: "C", asin: "B000000001", targeting: "Manual", state: "enabled", budget: 10, biddingStrategy: "Dynamic bids - down only", daily: [], impressions: 1000, clicks: 100, cost: 50, orders: 10, sales: 200, ...over });
  const input = (over: Partial<RulesInput>): RulesInput => ({
    products: { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1" } }, campaigns: [camp()], adGroups: [{ adGroupId: "g1", campaign: "c1", defaultBid: 0.5, state: "enabled" }],
    keywords: [], targets: [], placements: [], terms: [], negatives: [], range: { from: "2026-09-01", to: "2026-09-30" }, today: "2026-10-01", ...over,
  });
  const kw = (o: Record<string, unknown>) => ({ keywordId: "k1", campaign: "c1", adGroupId: "g1", text: "kw", matchType: "Broad", bid: 0.5, state: "enabled", impressions: 100, clicks: 0, cost: 0, orders: 0, sales: 0, history: [], ...o });
  const term = (t: string, clicks: number, orders = 0, over: Partial<RuleTerm> = {}): RuleTerm => ({ campaign: "c1", term: t, adGroupIds: ["g1"], matchTypes: ["Broad"], impressions: null, clicks, cost: clicks * 0.5, orders, sales: orders * 20, ...over });

  it("3. each rule's window: only the search-term imports reaching into it; an older one is left out, a straddling one noted", () => {
    const rows = [term("old waste", 30, 0, { from: "2026-06-01", to: "2026-07-15" }), term("new waste", 20, 0, { from: "2026-09-10", to: "2026-09-30" }), term("straddle", 25, 0, { from: "2026-08-20", to: "2026-09-20" })];
    const r60 = runRules(input({ termRows: rows }));
    expect(r60.proposals.filter((p) => p.rule === "negative").map((p) => p.entity.label).sort()).toEqual(["new waste", "straddle"]);
    const cfg = mergeRules({ negative: { lookbackDays: 14 } });
    const r14 = runRules(input({ termRows: rows }), cfg);
    expect(r14.proposals.filter((p) => p.rule === "negative").map((p) => p.entity.label).sort()).toEqual(["new waste", "straddle"]);
    expect(r14.notes.negative?.[0]).toMatch(/an import starts 20 Aug, before the 14-day window \(from 17 Sept\)/);
    // Old "over the last N days" thresholds become the window.
    expect(mergeRules({ pause: { thresholds: { windowDays: 30 } } }).pause.lookbackDays).toBe(30);
    expect(DEFAULT_RULES.stock_guard.lookbackDays).toBeNull();
  });

  it("2. a whitelisted term is never negatived or paused, and the note says so; the blacklist goes into broad campaigns and new ones", () => {
    const lists = { whitelist: ["acme"], blacklist: ["free", "used"] };
    const r = runRules(input({
      products: { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1", lists } },
      terms: [term("acme pill box", 30), term("cheap box", 30)], keywords: [kw({ text: "acme", clicks: 40, cost: 20 })],
      negatives: [{ campaign: "c1", adGroupId: null, text: "used", matchType: "Negative phrase" }],
    }));
    expect(r.proposals.filter((p) => p.rule === "negative" && p.entity.type === "search term").map((p) => p.entity.label)).toEqual(["cheap box"]);
    expect(r.notes.negative).toContain('"acme pill box" (30 clicks, 0 orders, £15.00 spent) is on the whitelist ("acme"): never negatived');
    expect(r.proposals.some((p) => p.rule === "pause")).toBe(false);
    expect(r.notes.pause?.[0]).toMatch(/"acme" .* is on the whitelist/);
    const bl = r.proposals.find((p) => p.key === "blacklist:c1")!;
    expect(bl).toMatchObject({ proposed: 'negative phrase: "free"', confidence: "high" });
    expect(bl.changes).toEqual([{ kind: "create_negative", campaignId: "111", adGroupId: null, text: "free", matchType: "Negative phrase" }]);
    // Harvest's new Exact campaign starts with the blacklist.
    const h = runRules(input({ products: { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1", lists } }, terms: [term("blue box", 20, 3, { cost: 10, sales: 60, matchTypes: ["Phrase"] })] })).proposals.find((p) => p.key === "exact-campaign:B000000001")!;
    expect(h.changes[0]).toMatchObject({ kind: "create_campaign", negatives: [{ text: "free", matchType: "Negative phrase" }, { text: "used", matchType: "Negative phrase" }] });
    expect(bulkRows(h.changes[0]).filter((x) => x.Entity === "Negative keyword").map((x) => [x["Keyword text"], x["Match type"]])).toEqual([["free", "Negative phrase"], ["used", "Negative phrase"]]);
  });

  it("4. TACoS mode: the reasons say so, and Ranked eases off 25%", () => {
    const tacos = { targetTacos: 0.2, adShare: 0.5, capped: false };
    const r = runRules(input({ products: { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.4, sku: "SKU1", tacos } }, keywords: [kw({ clicks: 30, cost: 15, orders: 1, sales: 20 })] }));
    const down = r.proposals.find((p) => p.rule === "bid_down")!;
    expect(down.reason).toMatch(/TACoS mode: target TACoS 20% ÷ 50% ad share of sales = 40% ACoS allowed\.$/);
    const ranks = { B000000001: { kw: [5, 3, 8].map((position, i) => ({ position, checkedAt: `2026-09-2${i}` })) } };
    const ranked = runRules(input({ products: { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.4, sku: "SKU1", tacos } }, keywords: [kw({ clicks: 5, cost: 1, orders: 1, sales: 20 })], ranks })).proposals[0];
    expect(ranked).toMatchObject({ rule: "ranked", current: "£0.50", proposed: "£0.38" }); // −25%, not −20%
    expect(ranked.reason).toMatch(/Lowered 25% \(TACoS mode eases off harder than the usual 20%\)/);
  });

  it("5. a listing problem holds Bid up back, and says so", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${24 + i}`, impressions: 500, clicks: 20, cost: i < 4 ? 10 : 5, orders: 2, sales: 40 }));
    const p = { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1" };
    const k = [kw({ clicks: 40, cost: 8, orders: 4, sales: 80 })];
    expect(runRules(input({ campaigns: [camp({ daily: days })], keywords: k, products: { B000000001: p } })).proposals.some((x) => x.rule === "bid_up")).toBe(true);
    const held = runRules(input({ campaigns: [camp({ daily: days })], keywords: k, products: { B000000001: { ...p, listingProblem: "CVR 3.0% vs 10.1% (niche) (low)." } } }));
    expect(held.proposals.some((x) => x.rule === "bid_up")).toBe(false);
    expect(held.notes.bid_up).toContain("B000000001: CVR 3.0% vs 10.1% (niche) (low). Bid up is held back for it until the listing converts");
  });

  it("the launcher: the blacklist in every campaign, a blacklisted head term left out", () => {
    const l = buildLaunch({ asin: "B000000001", sku: "SKU1", price: 9, headTerms: ["pill box", "free pill box"], competitorAsins: ["B000000002"], dailyBudget: 20, targetAcos: 0.3, steadyTargetAcos: null, startingBid: 0.19, startDate: "2026-10-05", negatives: ["Free"] });
    expect(l.changes.every((c) => c.kind === "create_campaign" && c.negatives?.[0]?.text === "free")).toBe(true);
    expect(l.campaigns.find((c) => c.kind === "Exact")!.targets).toEqual(["pill box"]);
    expect(l.warnings).toContain('On the blacklist, so left out of Broad and Exact: "free pill box"');
  });
});
