import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBulk, type ParsedBulk } from "./bulk";
import { confidence, countByRule, DEFAULT_RULES, mergeRules, runRules, type RuleCampaign, type RulesInput, type RuleTerm } from "./rules";

/** The rules' input from a parsed bulk export (the server builds the same from the database). */
function fromBulk(b: ParsedBulk, price: number, targetAcos = 0.3): RulesInput {
  const products: RulesInput["products"] = {};
  for (const asin of new Set(b.campaignAsins.values())) products[asin] = { asin, price, targetAcos, sku: b.productAds.find((p) => p.asin === asin)?.sku ?? null };
  const campaigns: RuleCampaign[] = b.campaigns.map((c) => ({ ...c, id: c.campaignId, asin: b.campaignAsins.get(c.campaignId) ?? null, daily: [] }));
  const terms = new Map<string, RuleTerm>();
  for (const t of b.searchTerms) {
    const k = `${t.campaignId}|${t.term}`;
    const cur = terms.get(k) ?? { campaign: t.campaignId, term: t.term, adGroupIds: [], matchTypes: [], impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
    cur.clicks += t.clicks; cur.cost += t.cost; cur.orders += t.orders; cur.sales += t.sales;
    if (!cur.adGroupIds.includes(t.adGroupId)) cur.adGroupIds.push(t.adGroupId);
    cur.matchTypes.push(t.keywordId ? t.matchType : null);
    terms.set(k, cur);
  }
  return {
    products, campaigns,
    adGroups: b.adGroups.map((g) => ({ adGroupId: g.adGroupId, campaign: g.campaignId, defaultBid: g.defaultBid, state: g.state })),
    keywords: b.keywords.map((k) => ({ ...k, campaign: k.campaignId, history: [{ from: b.dateFrom!, to: b.dateTo!, impressions: k.impressions, orders: k.orders }] })),
    targets: b.targets.map((t) => ({ ...t, campaign: t.campaignId })),
    placements: b.placements.map((p) => ({ ...p, campaign: p.campaignId })),
    terms: [...terms.values()],
    negatives: b.negatives.map((n) => ({ campaign: n.campaignId, adGroupId: n.adGroupId, text: n.text, matchType: n.matchType })),
    range: { from: b.dateFrom!, to: b.dateTo! }, today: "2026-10-02",
  };
}

const bulk = parseBulk(new Uint8Array(readFileSync(join(__dirname, "../../../docs/samples/ads/bulk-template.xlsx"))), { dateFrom: "2026-08-10", dateTo: "2026-10-02" });
const AD_READY = "97105648594138", EXACT_HERO = "73527101425940";
const pill = runRules(fromBulk(bulk, 8.99));
const find = (rule: string, label: string, campaign?: string) => pill.proposals.find((p) => p.rule === rule && p.entity.label.startsWith(label) && (!campaign || p.campaign === campaign));

describe("runRules on the pill box account (target 30%, price £8.99)", () => {
  it("negative exact: pill organiser in AD_READY (23 clicks, 0 orders, 142% of the price)", () => {
    const p = find("negative", "pill organiser", AD_READY)!;
    expect(p.entity.label).toBe("pill organiser");
    expect(p.reason).toMatch(/^23 clicks, 0 orders, £12\.76 spent = 142% of the £8\.99 price/);
    expect(p.confidence).toBe("medium"); // 10–29 clicks
    expect(p.changes).toEqual([{ kind: "create_negative", campaignId: AD_READY, adGroupId: expect.any(String), text: "pill organiser", matchType: "Negative exact" }]);
  });

  it("bid down: pill organiser 3 times a day in EXACT HERO (110% ACoS)", () => {
    const p = find("bid_down", "pill organiser 3 times a day", EXACT_HERO)!;
    // 2 orders / 29 clicks (6.9%), smoothed towards the product's 13 / 195 (6.7%) by 20 clicks = 6.8%: 0.3 × £8.99 × 6.8% = £0.18.
    expect(p).toMatchObject({ current: "£0.40", proposed: "£0.18", confidence: "medium" });
    expect(p.reason).toMatch(/29 clicks, 2 orders, £19\.81 spent, £17\.98 sales = 110\.2% ACoS/);
    expect(p.reason).toMatch(/Conversion: 2 orders \/ 29 clicks raw 6\.9%, smoothed 6\.8% \(towards the product's 6\.7%\)/);
    expect(p.changes[0]).toMatchObject({ kind: "keyword_bid", campaignId: EXACT_HERO, bid: 0.18 });
  });

  it("placement: no raise for a placement better than its campaign but itself over 1.2 × target", () => {
    // AD_READY rest of search 59.6% (campaign 80.8%) and EXACT HERO top 64.6% (campaign 103.3%): both over 36%.
    expect(pill.proposals.filter((p) => p.rule === "placement")).toEqual([]);
    expect(pill.notes.placement?.some((n) => /Rest of search in AD_READY.*59\.6% ACoS.*over 1\.2 × the 30% target/.test(n))).toBe(true);
    // At a 50% target, 59.6% is within 1.2 × (60%): raised.
    const p = runRules(fromBulk(bulk, 8.99, 0.5)).proposals.find((x) => x.rule === "placement" && x.campaign === AD_READY)!;
    expect(p).toMatchObject({ entity: { label: "Rest of search" }, current: "+0%", proposed: "+20%", confidence: "high" });
  });

  it("harvest: pill box from AD_READY (broad, 2 orders, 27.6% ACoS); EXACT HERO already has it, so only the negative", () => {
    const p = find("harvest", "pill box", AD_READY)!;
    expect(p.entity.label).toBe("pill box");
    expect(p.reason).toMatch(/8 clicks, 2 orders, £4\.97 spent, £17\.98 sales = 27\.6% ACoS, at or under the 30% target .* found by broad/);
    expect(p.proposed).toBe("already exact in PILL EXACT HERO + negative exact in AD_READY: B0H9ZKYYHZ");
    expect(p.changes).toEqual([{ kind: "create_negative", campaignId: AD_READY, adGroupId: expect.any(String), text: "pill box", matchType: "Negative exact" }]);
    expect(p.confidence).toBe("low"); // 8 clicks, 2 orders
  });

  it("harvest creates the exact keyword when the Exact campaign lacks it", () => {
    const input = fromBulk(bulk, 8.99);
    input.keywords = input.keywords.filter((k) => !(k.campaign === EXACT_HERO && k.text === "pill box"));
    const p = runRules(input).proposals.find((x) => x.rule === "harvest" && x.entity.label === "pill box")!;
    expect(p.changes[0]).toMatchObject({ kind: "create_keyword", campaignId: EXACT_HERO, text: "pill box", matchType: "Exact" });
    // CPC £0.62 × 1.1 = £0.68, capped at 30% × £8.99 × smoothed conversion: 2 / 8 raw 25% → (2 + 20 × 6.7%) / 28 = 11.9% → £0.32
    expect(p.changes[0]).toMatchObject({ bid: 0.32 });
    expect(p.reason).toMatch(/2 orders \/ 8 clicks raw 25%, smoothed 12%/);
  });

  it("says what the bulk export can't tell", () => {
    expect(pill.notes.bid_up?.[0]).toMatch(/daily Campaign report/);
    expect(pill.notes.budget?.[0]).toMatch(/daily Campaign report/);
    expect(pill.proposals.filter((p) => ["bid_up", "budget", "revive", "pause"].includes(p.rule))).toEqual([]);
  });

  it("counts per rule and product", () => {
    const n = countByRule(pill);
    expect(n.negative.byAsin.B0H9ZKYYHZ).toBeGreaterThan(0);
    expect(Object.values(n).reduce((a, x) => a + x.total, 0)).toBe(pill.proposals.length);
  });
});

describe("rules on made-up data", () => {
  const camp = (over: Partial<RuleCampaign> = {}): RuleCampaign => ({ id: "c1", campaignId: "111", name: "C", asin: "B000000001", targeting: "Manual", state: "enabled", budget: 10, biddingStrategy: "Dynamic bids - down only", daily: [], impressions: 1000, clicks: 100, cost: 50, orders: 10, sales: 200, ...over });
  const input = (over: Partial<RulesInput>): RulesInput => ({
    products: { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1" } }, campaigns: [camp()], adGroups: [{ adGroupId: "g1", campaign: "c1", defaultBid: 0.5, state: "enabled" }],
    keywords: [], targets: [], placements: [], terms: [], negatives: [], range: { from: "2026-09-01", to: "2026-09-30" }, today: "2026-10-01", ...over,
  });
  const kw = (o: Record<string, unknown>) => ({ keywordId: "k1", campaign: "c1", adGroupId: "g1", text: "kw", matchType: "Broad", bid: 0.5, state: "enabled", impressions: 100, clicks: 0, cost: 0, orders: 0, sales: 0, history: [], ...o });

  it("confidence bands", () => {
    expect([confidence(9, 0), confidence(10, 0), confidence(29, 2), confidence(30, 0), confidence(5, 3)]).toEqual(["low", "medium", "medium", "high", "high"]);
  });

  it("pause beats bid down on the same keyword", () => {
    const r = runRules(input({ keywords: [kw({ clicks: 26, cost: 13 })] }));
    expect(r.proposals.map((p) => p.rule)).toEqual(["pause"]);
    expect(r.proposals[0].changes[0]).toEqual({ kind: "keyword_state", campaignId: "111", adGroupId: "g1", keywordId: "k1", state: "paused" });
  });

  it("bid down with no orders goes to the smoothed bid (not straight to the floor); nothing when the new bid isn't lower", () => {
    // 0 / 12, smoothed towards the product's 10 / 100 by 20 clicks: 2 / 32 = 6.25% → 0.3 × £20 × 6.25% = £0.38.
    expect(runRules(input({ keywords: [kw({ clicks: 12, cost: 6 })] })).proposals[0]).toMatchObject({ rule: "bid_down", proposed: "£0.38" });
    // With k = 0 there's no smoothing: 0% conversion → the £0.10 floor.
    expect(runRules({ ...input({ keywords: [kw({ clicks: 12, cost: 6 })] }), smoothingK: 0 }).proposals[0]).toMatchObject({ proposed: "£0.10" });
    // 3 orders in 10 clicks: smoothed (3 + 2) / 30 = 16.7% → 0.3 × £20 × 16.7% = £1.00 > £0.50
    expect(runRules(input({ keywords: [kw({ clicks: 10, cost: 30, orders: 3, sales: 60 })] })).proposals).toEqual([]);
  });

  const term = (t: string, clicks: number, orders = 0, over: Partial<RuleTerm> = {}): RuleTerm => ({ campaign: "c1", term: t, adGroupIds: ["g1"], matchTypes: ["Broad"], impressions: null, clicks, cost: clicks * 0.5, orders, sales: orders * 20, ...over });

  it("Rule 9: a gram in 3 wasting terms, none converting, becomes an ad-group negative phrase", () => {
    const r = runRules(input({ terms: [term("cheap box", 16), term("cheap tray", 16), term("cheap case", 16, 0, { adGroupIds: ["g2"] }), term("pill box", 5, 1)] }));
    const g = r.proposals.filter((p) => p.rule === "ngram_negative");
    expect(g.map((p) => p.entity.label)).toEqual(["cheap"]); // "box" is in a converting term; "tray", "case" in one term each
    expect(g[0].changes).toEqual([
      { kind: "create_negative", campaignId: "111", adGroupId: "g1", text: "cheap", matchType: "Negative phrase" },
      { kind: "create_negative", campaignId: "111", adGroupId: "g2", text: "cheap", matchType: "Negative phrase" },
    ]);
    expect(r.proposals.some((p) => p.group === "word-level")).toBe(false);
  });

  it("Rule 10: a gram selling across 3+ terms puts its best terms forward for harvest", () => {
    // Each term has 1–2 orders: under Rule 1's 2-order bar for some, but "blue" has 6 orders at 25% ACoS.
    const terms = [term("blue box", 4, 2), term("blue tray", 4, 2), term("blue case", 4, 1), term("blue lid", 4, 1), term("red box", 10, 0)];
    const r = runRules(input({ terms }), mergeRules({ harvest: { enabled: false } }));
    // No Exact campaign yet: one proposal creates it with the gram's terms.
    const w = r.proposals.filter((p) => p.rule === "ngram_winner");
    expect(w.map((p) => p.key)).toEqual(["exact-campaign:B000000001"]);
    expect(w[0].changes[0]).toMatchObject({ kind: "create_campaign", keywords: [{ text: "blue box" }, { text: "blue tray" }, { text: "blue case" }, { text: "blue lid" }] });
    // With an Exact campaign, each term is its own proposal.
    const exact = camp({ id: "c2", campaignId: "222", name: "Exact" });
    const r2 = runRules(input({ terms, campaigns: [camp(), exact], adGroups: [{ adGroupId: "g1", campaign: "c1", defaultBid: 0.5, state: "enabled" }, { adGroupId: "g9", campaign: "c2", defaultBid: 0.5, state: "enabled" }], keywords: [kw({ keywordId: "k9", campaign: "c2", adGroupId: "g9", text: "other", matchType: "Exact" })] }), mergeRules({ harvest: { enabled: false } }));
    const w2 = r2.proposals.filter((p) => p.rule === "ngram_winner");
    expect(w2).toHaveLength(4);
    expect(w2[0].reason).toMatch(/^"blue" sells across 4 terms \(6 orders/);
  });

  it("Rule 11: stock guard slows, pauses and restores", () => {
    const kw1 = kw({ clicks: 5, cost: 2 });
    const stock = (days: number) => ({ fulfillable: 20, unitsPerDay: 2, daysOfCover: days, source: "Amazon sales, last 14 days" });
    const prods = (st: ReturnType<typeof stock>, guard: RulesInput["products"][string]["guard"] = null) => ({ B000000001: { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1", stock: st, guard } });
    const slow = runRules(input({ products: prods(stock(8)), keywords: [kw1] })).proposals.find((p) => p.rule === "stock_guard")!;
    expect(slow.changes).toEqual([{ kind: "campaign_budget", campaignId: "111", dailyBudget: 5 }, { kind: "keyword_bid", campaignId: "111", adGroupId: "g1", keywordId: "k1", bid: 0.35 }]);
    expect(slow.reason).toMatch(/^20 in FBA stock, selling 2.0 a day .* = 8.0 days of cover: under 10 days/);
    expect(runRules(input({ products: prods(stock(2)) })).proposals.find((p) => p.rule === "stock_guard")!.changes).toEqual([{ kind: "campaign_state", campaignId: "111", state: "paused" }]);
    const restores = [{ kind: "campaign_budget" as const, campaignId: "111", dailyBudget: 10 }];
    expect(runRules(input({ products: prods(stock(30), { label: "2026-10-02 #2", restores }) })).proposals.find((p) => p.rule === "stock_guard")).toMatchObject({ key: "stock-restore:B000000001", changes: restores });
    // Under the guard, the campaign's other bid changes wait.
    const both = runRules(input({ products: prods(stock(8)), keywords: [kw({ clicks: 12, cost: 6 })] }));
    expect(both.proposals.map((p) => p.rule)).toEqual(["stock_guard"]);
  });

  it("Rules 12 and 13: ranked eases off, slipping raises; one bid change per keyword", () => {
    const ranks = (ps: (number | null)[]) => ({ B000000001: { kw: ps.map((position, i) => ({ position, checkedAt: `2026-09-2${i}` })) } });
    const ranked = runRules(input({ keywords: [kw({ clicks: 5, cost: 1, orders: 1, sales: 20 })], ranks: ranks([5, 3, 8]) })).proposals;
    expect(ranked).toMatchObject([{ rule: "ranked", current: "£0.50", proposed: "£0.40" }]);
    const slip = runRules(input({ keywords: [kw({ clicks: 5, cost: 1, orders: 1, sales: 20 })], ranks: ranks([4, 15]) })).proposals;
    expect(slip).toMatchObject([{ rule: "slipping", proposed: "£0.55" }]);
    expect(slip[0].reason).toMatch(/fell from #4 to #15 \(11 places\)/);
    // Bid down outranks ranked on the same keyword.
    const both = runRules(input({ keywords: [kw({ clicks: 12, cost: 6 })], ranks: ranks([2, 2, 2]) })).proposals;
    expect(both.map((p) => p.rule)).toEqual(["bid_down"]);
  });

  it("launch weeks 1–2: harvest and negatives only", () => {
    const products = { B000000001: { asin: "B000000001", price: 20, targetAcos: 0.3, sku: "SKU1", launchStart: "2026-09-25" } };
    const r = runRules(input({ products, keywords: [kw({ clicks: 12, cost: 6 })], terms: [term("waste term", 20)] }));
    expect(r.proposals.map((p) => p.rule)).toEqual(["negative"]);
    expect(r.notes.bid_down?.[0]).toMatch(/launch weeks 1–2/);
  });

  it("harvest with no Exact campaign proposes creating one", () => {
    const r = runRules(input({ terms: [{ campaign: "c1", term: "blue box", adGroupIds: ["g1"], matchTypes: ["Phrase"], impressions: null, clicks: 20, cost: 10, orders: 3, sales: 60 }] }));
    const p = r.proposals.find((x) => x.rule === "harvest")!;
    expect(p.key).toBe("exact-campaign:B000000001");
    expect(p.changes[0]).toMatchObject({ kind: "create_campaign", sku: "SKU1", keywords: [{ text: "blue box", matchType: "Exact", bid: 0.55 }] });
    expect(p.changes[1]).toMatchObject({ kind: "create_negative", text: "blue box", matchType: "Negative exact" });
  });

  /** Daily rows ending 30 Sept (input's today is 1 Oct). */
  const days = (n: number, f: (i: number) => Partial<{ impressions: number; clicks: number; cost: number; orders: number; sales: number }>) =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 30) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10), impressions: 500, clicks: 20, cost: 5, orders: 2, sales: 40, ...f(i) }));

  it("budget and bid up from daily rows: out of budget 4 of the last 7 days", () => {
    const daily = days(7, (i) => ({ cost: i < 4 ? 10 : 5 }));
    const r = runRules(input({ campaigns: [camp({ daily })], keywords: [kw({ clicks: 40, cost: 8, orders: 4, sales: 80 })] }));
    expect(r.proposals.find((p) => p.rule === "budget")).toMatchObject({ current: "£10.00/day", proposed: "£12.00/day" });
    const up = r.proposals.find((p) => p.rule === "bid_up")!;
    expect(up).toMatchObject({ current: "£0.50", proposed: "£0.58" });
    expect(up.reason).toMatch(/ran out of budget on 4 of the last 14 days/);
    expect(up.reason).toMatch(/at most £0\.60: the bid for the target at 10\.0% smoothed conversion/);
    // With daily data, the notes are only what needs the API.
    expect(r.notes.bid_up).toEqual([expect.stringMatching(/Amazon Ads API/)]);
    expect(r.notes.budget).toEqual([expect.stringMatching(/hourly data: the Amazon Ads API/)]);
  });

  it("bid up on impressions falling week on week, under budget", () => {
    const daily = days(14, (i) => ({ impressions: i < 7 ? 1000 : 700, cost: 4 }));
    const up = runRules(input({ campaigns: [camp({ daily })], keywords: [kw({ clicks: 40, cost: 8, orders: 4, sales: 80 })] })).proposals.find((p) => p.rule === "bid_up")!;
    expect(up.reason).toMatch(/impressions fell -30% week on week \(4,900 against 7,000\)/);
  });

  it("budget cut: 14 days far over target", () => {
    const daily = days(14, () => ({ cost: 6, sales: 10 })); // 60% ACoS > 1.5 × 30%
    expect(runRules(input({ campaigns: [camp({ daily })] })).proposals.find((p) => p.rule === "budget")).toMatchObject({ proposed: "£7.50/day" });
  });

  it("old daily data isn't acted on, and says so", () => {
    const daily = days(7, () => ({ cost: 10 })).map((d) => ({ ...d, date: d.date.replace("2026-09", "2026-08") }));
    const r = runRules(input({ campaigns: [camp({ daily })], keywords: [kw({ clicks: 40, cost: 8, orders: 4, sales: 80 })] }));
    expect(r.proposals.filter((p) => p.rule === "budget" || p.rule === "bid_up")).toEqual([]);
    expect(r.notes.budget?.some((n) => /too old to act on/.test(n))).toBe(true);
  });

  it("revive: an exact keyword whose running campaign had no impressions for 14 days", () => {
    const daily = days(14, () => ({ impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 }));
    const history = [{ from: "2026-06-01", to: "2026-08-31", impressions: 900, orders: 5 }];
    const r = runRules(input({ campaigns: [camp({ daily })], keywords: [kw({ matchType: "Exact", history })] }));
    expect(r.proposals.find((p) => p.rule === "revive")).toMatchObject({ current: "£0.50", proposed: "£0.55" });
    expect(r.proposals.find((p) => p.rule === "revive")!.reason).toMatch(/C had no impressions 17 Sept – 30 Sept/);
    // A paused campaign is quiet because it's paused: not revived.
    expect(runRules(input({ campaigns: [camp({ daily, state: "paused" })], keywords: [kw({ matchType: "Exact", history })] })).proposals.filter((p) => p.rule === "revive")).toEqual([]);
  });

  it("without daily data: says which report to import", () => {
    const r = runRules(input({ keywords: [kw({ clicks: 40, cost: 8, orders: 4, sales: 80 })] }));
    expect(r.notes.bid_up?.[0]).toMatch(/daily Campaign report/);
    expect(r.notes.budget?.[0]).toMatch(/daily Campaign report/);
  });

  it("placement: lowering needs no target guard", () => {
    const placements = [{ campaign: "c1", placement: "product page", percentage: 40, impressions: null, clicks: 30, cost: 30, orders: 1, sales: 20 }];
    const r = runRules(input({ placements }));
    expect(r.proposals.find((p) => p.rule === "placement")).toMatchObject({ current: "+40%", proposed: "+20%" });
  });

  it("revive an exact keyword gone quiet", () => {
    const history = [{ from: "2026-08-01", to: "2026-09-30", impressions: 900, orders: 4 }, { from: "2026-09-17", to: "2026-09-30", impressions: 0, orders: 0 }];
    const r = runRules(input({ keywords: [kw({ matchType: "Exact", history })] }));
    expect(r.proposals.find((p) => p.rule === "revive")).toMatchObject({ current: "£0.50", proposed: "£0.55" });
  });

  it("disabled rules and saved thresholds", () => {
    const cfg = mergeRules({ pause: { enabled: false }, bid_down: { thresholds: { minClicks: 50 } } });
    expect(cfg.bid_down.thresholds).toEqual({ ...DEFAULT_RULES.bid_down.thresholds, minClicks: 50 });
    expect(runRules(input({ keywords: [kw({ clicks: 26, cost: 13 })] }), cfg).proposals).toEqual([]);
  });
});
