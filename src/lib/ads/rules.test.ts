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
    expect(p).toMatchObject({ current: "£0.40", proposed: "£0.19", confidence: "medium" });
    expect(p.reason).toMatch(/29 clicks, 2 orders, £19\.81 spent, £17\.98 sales = 110\.2% ACoS/);
    expect(p.changes[0]).toMatchObject({ kind: "keyword_bid", campaignId: EXACT_HERO, bid: 0.19 });
  });

  it("placement: AD_READY's rest of search (59.6% ACoS) against the campaign's 80.8%", () => {
    const p = find("placement", "Rest of search", AD_READY)!;
    expect(p).toMatchObject({ current: "+0%", proposed: "+20%", confidence: "high" });
    expect(p.changes[0]).toMatchObject({ kind: "placement", placement: "rest of search", percentage: 20 });
    expect(find("placement", "Product page", AD_READY)).toBeUndefined(); // 81.6%: within 25% of the campaign
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
    // CPC £0.62 × 1.1 = £0.68, capped at 30% × £8.99 × 25% = £0.67
    expect(p.changes[0]).toMatchObject({ bid: 0.67 });
  });

  it("says what the bulk export can't tell", () => {
    expect(pill.notes.bid_up?.[0]).toMatch(/impression share/);
    expect(pill.notes.budget?.[0]).toMatch(/daily/);
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

  it("bid down to the floor with no orders; nothing when the new bid isn't lower", () => {
    expect(runRules(input({ keywords: [kw({ clicks: 12, cost: 6 })] })).proposals[0]).toMatchObject({ rule: "bid_down", proposed: "£0.10" });
    // 3 orders in 10 clicks: 0.3 × £20 × 30% = £1.80 > £0.50
    expect(runRules(input({ keywords: [kw({ clicks: 10, cost: 30, orders: 3, sales: 60 })] })).proposals).toEqual([]);
  });

  it("word-level negative phrase from 3 wasting terms sharing a word, none converting", () => {
    const t = (term: string, clicks: number, orders = 0): RuleTerm => ({ campaign: "c1", term, adGroupIds: ["g1"], matchTypes: ["Broad"], impressions: null, clicks, cost: clicks * 0.5, orders, sales: orders * 20 });
    const r = runRules(input({ terms: [t("cheap box", 16), t("cheap tray", 16), t("cheap case", 16), t("pill box", 5, 1)] }));
    const word = r.proposals.filter((p) => p.group === "word-level");
    expect(word.map((p) => p.entity.label)).toEqual(["cheap"]); // "box" is in a converting term
    expect(word[0].changes[0]).toEqual({ kind: "create_negative", campaignId: "111", adGroupId: null, text: "cheap", matchType: "Negative phrase" });
  });

  it("harvest with no Exact campaign proposes creating one", () => {
    const r = runRules(input({ terms: [{ campaign: "c1", term: "blue box", adGroupIds: ["g1"], matchTypes: ["Phrase"], impressions: null, clicks: 20, cost: 10, orders: 3, sales: 60 }] }));
    const p = r.proposals.find((x) => x.rule === "harvest")!;
    expect(p.key).toBe("exact-campaign:B000000001");
    expect(p.changes[0]).toMatchObject({ kind: "create_campaign", sku: "SKU1", keywords: [{ text: "blue box", matchType: "Exact", bid: 0.55 }] });
    expect(p.changes[1]).toMatchObject({ kind: "create_negative", text: "blue box", matchType: "Negative exact" });
  });

  it("budget and bid up from daily rows", () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${24 + i}`, clicks: 20, cost: i < 4 ? 10 : 5, orders: 2, sales: 40 }));
    const r = runRules(input({ campaigns: [camp({ daily })], keywords: [kw({ clicks: 40, cost: 8, orders: 4, sales: 80 })] }));
    expect(r.proposals.find((p) => p.rule === "budget")).toMatchObject({ current: "£10.00/day", proposed: "£12.00/day" });
    expect(r.proposals.find((p) => p.rule === "bid_up")).toMatchObject({ current: "£0.50", proposed: "£0.58" });
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
