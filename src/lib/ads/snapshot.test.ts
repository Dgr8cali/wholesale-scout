import { describe, expect, it } from "vitest";
import { diffSnapshot, restoresFor, revertChanges, takeSnapshot, type EntityState } from "./snapshot";

const state = (): EntityState => ({
  campaigns: [{ campaignId: "1", name: "C", budget: 10, state: "enabled", biddingStrategy: "Dynamic bids – down only" }],
  adGroups: [{ campaignId: "1", adGroupId: "g", defaultBid: 0.5, state: "enabled" }],
  keywords: [{ campaignId: "1", adGroupId: "g", keywordId: "k", text: "pill box", matchType: "Broad", bid: 0.4, state: "enabled" }],
  targets: [],
  placements: [{ campaignId: "1", placement: "rest of search", percentage: 0 }],
  negatives: [],
});

describe("snapshots and rollback", () => {
  const batch = [
    { kind: "keyword_bid" as const, campaignId: "1", adGroupId: "g", keywordId: "k", bid: 0.3 },
    { kind: "campaign_budget" as const, campaignId: "1", dailyBudget: 5 },
    { kind: "placement" as const, campaignId: "1", biddingStrategy: "x", placement: "rest of search", percentage: 20 },
    { kind: "create_negative" as const, campaignId: "1", adGroupId: "g", text: "cheap", matchType: "Negative phrase" as const },
    { kind: "create_keyword" as const, campaignId: "1", adGroupId: "g", text: "pill case", matchType: "Exact" as const, bid: 0.5 },
  ];

  it("restores what the updates replace", () => {
    expect(restoresFor(batch, state()).restores).toEqual([
      { kind: "keyword_bid", campaignId: "1", adGroupId: "g", keywordId: "k", bid: 0.4 },
      { kind: "campaign_budget", campaignId: "1", dailyBudget: 10 },
      { kind: "placement", campaignId: "1", biddingStrategy: "Dynamic bids – down only", placement: "rest of search", percentage: 0 },
    ]);
  });

  it("reverts creates by pausing or archiving what the next import shows, and lists what it can't find yet", () => {
    const after = state();
    after.negatives.push({ campaignId: "1", adGroupId: "g", keywordId: "n1", text: "cheap", matchType: "Negative phrase", state: "enabled" });
    const r = revertChanges(batch, restoresFor(batch, state()).restores, after);
    expect(r.changes.slice(3)).toEqual([{ kind: "negative_state", campaignId: "1", adGroupId: "g", keywordId: "n1", state: "archived" }]);
    expect(r.unresolved).toEqual([expect.stringMatching(/^Keyword "pill case" \(exact\) isn't in the imported data yet/)]);
  });

  it("diffs a snapshot against now", () => {
    const snap = takeSnapshot(state());
    const now = state();
    now.keywords[0].bid = 0.25;
    now.campaigns[0].state = "paused";
    now.keywords.push({ campaignId: "1", adGroupId: "g", keywordId: "k2", text: "new", matchType: "Exact", bid: 0.3, state: "enabled" });
    expect(diffSnapshot(snap, now)).toEqual([
      { kind: "campaign_state", campaignId: "1", state: "enabled" },
      { kind: "keyword_bid", campaignId: "1", adGroupId: "g", keywordId: "k", bid: 0.4 },
      { kind: "keyword_state", campaignId: "1", adGroupId: "g", keywordId: "k2", state: "paused" },
    ]);
    expect(diffSnapshot(snap, state())).toEqual([]);
  });
});
