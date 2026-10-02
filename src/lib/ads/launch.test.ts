import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { BULK_CAMPAIGNS_SHEET, writeBulk } from "./bulk";
import { buildLaunch } from "./launch";

const dog = {
  asin: "B0H9ZH3RV5", sku: "DOGBELT-2PK", price: 13.99, competitorAsins: ["B0AAAAAAA1", "b0aaaaaaa2"], dailyBudget: 20, targetAcos: 0.3, steadyTargetAcos: 0.25, startingBid: 0.44, startDate: "2026-10-05",
  headTerms: ["dog seat belt", "dog car seat belt", "dog seatbelt for car", "pet seat belt", "dog car harness seat belt"],
};

describe("buildLaunch", () => {
  const l = buildLaunch(dog);
  it("four campaigns, budget 30/20/40/10, bids × 1 / 0.8 / 1 / 0.9", () => {
    expect(l.campaigns.map((c) => [c.name, c.budget, c.bid])).toEqual([
      ["B0H9ZH3RV5 Auto – 2026-10-05", 6, 0.44], ["B0H9ZH3RV5 Broad – 2026-10-05", 4, 0.35],
      ["B0H9ZH3RV5 Exact – 2026-10-05", 8, 0.44], ["B0H9ZH3RV5 PT – 2026-10-05", 2, 0.4],
    ]);
  });

  it("writes Create rows: campaign, top-of-search 0%, ad group, product ad, keywords or targets", () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(writeBulk(l.changes).Sheets[BULK_CAMPAIGNS_SHEET], { defval: "", raw: false });
    expect(rows.every((r) => r.Operation === "Create")).toBe(true);
    const of = (name: string) => rows.filter((r) => r["Campaign ID"] === name);
    expect(of("B0H9ZH3RV5 Auto – 2026-10-05").map((r) => `${r.Entity}:${r["Product targeting expression"] || r.Placement || ""}:${r.State}`)).toEqual([
      "Campaign::enabled", "Bidding adjustment:Placement top:", "Ad group::enabled", "Product ad::enabled",
      "Product targeting:close-match:enabled", "Product targeting:substitutes:enabled", "Product targeting:loose-match:paused", "Product targeting:complements:paused",
    ]);
    expect(of("B0H9ZH3RV5 Auto – 2026-10-05")[0]).toMatchObject({ "Targeting type": "Auto", "Daily budget": "6.00", "Start date": "20261005" });
    expect(of("B0H9ZH3RV5 Exact – 2026-10-05").filter((r) => r.Entity === "Keyword").map((r) => `${r["Keyword text"]}|${r["Match type"]}|${r.Bid}`)).toEqual(dog.headTerms.map((t) => `${t}|Exact|0.44`));
    expect(of("B0H9ZH3RV5 PT – 2026-10-05").filter((r) => r.Entity === "Product targeting").map((r) => r["Product targeting expression"])).toEqual(['asin="B0AAAAAAA1"', 'asin="B0AAAAAAA2"']);
    expect(rows.filter((r) => r.Entity === "Product ad").every((r) => r.SKU === "DOGBELT-2PK")).toBe(true);
  });

  it("the 60-day plan", () => {
    expect(l.plan.map((p) => [p.from, p.title])).toEqual([
      ["2026-10-05", "Weeks 1–2: harvest only"], ["2026-10-19", "Week 3: first bid-downs"], ["2026-11-02", "Week 5: lower the target"], ["2026-11-23", "Week 8: steady state"],
    ]);
    expect(l.plan[2].detail).toMatch(/to 25%/);
  });

  it("no competitors: PT left out, its share spread over the others", () => {
    const x = buildLaunch({ ...dog, competitorAsins: [] });
    expect(x.campaigns.map((c) => c.budget)).toEqual([6.67, 4.44, 8.89]);
    expect(x.warnings[0]).toMatch(/product-targeting campaign is left out/);
  });
});
