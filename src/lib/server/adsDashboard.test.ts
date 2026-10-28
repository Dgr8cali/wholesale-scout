import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adsDashboard } from "./ads";
import { __setDbForTests, activeRateCard } from "./db";
import { FakeDb } from "./fakeDb";

const totals = (impressions: number, clicks: number, cost: number, orders = 0, sales = 0) => ({ impressions, clicks, cost, orders, sales, units: orders });

describe("Ads dashboard: the newest import counts", () => {
  let db: FakeDb;
  beforeEach(async () => {
    db = new FakeDb();
    __setDbForTests(db);
    await activeRateCard();
    const t = db.tables;
    t.ads_products = [{ asin: "B0HM8FBX3T", title: "Dog Seat Belt for Car, 2 Pack", price: 9.99, landed_cost: 3.66, phase: "launch" }];
    t.ads_campaigns = ["Auto", "Broad", "Exact"].map((m) => ({ id: m, campaign_id: `id-${m}`, name: `B0HM8FBX3T ${m} - 2026-10-19`, asin: "B0HM8FBX3T", state: "enabled", archived: false }));
    // 20 Oct's bulk export (20 Sept – 20 Oct, 31 days) and 28 Oct's (29 Sept – 28 Oct, 30 days): they overlap,
    // and the older is the wider, which used to win.
    t.ads_imports = [
      { id: "old", report_type: "bulk", file_name: "Seat belt 1 week.xlsx", rows: 60, date_from: "2026-09-20", date_to: "2026-10-20", imported_at: "2026-10-20T18:00:00Z" },
      { id: "new", report_type: "bulk", file_name: "Report 28_10.xlsx", rows: 881, date_from: "2026-09-29", date_to: "2026-10-28", imported_at: "2026-10-28T23:30:00Z" },
    ];
    const range = (id: string, campaign: string, imp: string, from: string, to: string, x: ReturnType<typeof totals>) => ({ id, campaign, source: "bulk", date_from: from, date_to: to, import_id: imp, ...x });
    t.ads_campaign_ranges = [
      range("o1", "Auto", "old", "2026-09-20", "2026-10-20", totals(500, 5, 1.95)),
      range("o2", "Broad", "old", "2026-09-20", "2026-10-20", totals(471, 5, 1.95)),
      range("o3", "Exact", "old", "2026-09-20", "2026-10-20", totals(0, 0, 0)),
      range("n1", "Auto", "new", "2026-09-29", "2026-10-28", totals(1000, 5, 2.01)),
      range("n2", "Broad", "new", "2026-09-29", "2026-10-28", totals(918, 6, 2.14, 1, 9.99)),
      range("n3", "Exact", "new", "2026-09-29", "2026-10-28", totals(0, 0, 0)),
    ];
    const term = (id: string, imp: string, from: string, to: string, x: ReturnType<typeof totals>) =>
      ({ id, campaign: "Broad", ad_group_id: "ag1", ad_group_name: "Ad group", keyword_id: "k1", keyword_text: "dog seat belt", match_type: "BROAD", term: "dog seat belt", date_from: from, date_to: to, import_id: imp, ...x });
    t.ads_search_terms = [term("t1", "old", "2026-09-20", "2026-10-20", totals(0, 5, 1.95)), term("t2", "new", "2026-09-29", "2026-10-28", totals(0, 6, 2.14, 1, 9.99))];
  });
  afterEach(() => __setDbForTests(null));

  it("the card takes 28 Oct's import and shows its period; the overlapping older one isn't added", async () => {
    const d = await adsDashboard();
    const a = d.asins.find((x) => x.asin === "B0HM8FBX3T")!;
    expect(a).toMatchObject({ campaigns: 3, from: "2026-09-29", to: "2026-10-28", totals: { impressions: 1918, clicks: 11, orders: 1, sales: 9.99 } });
    expect(a.totals.cost).toBeCloseTo(4.15, 6);
    expect(d.campaigns.find((c) => c.id === "Broad")).toMatchObject({ from: "2026-09-29", to: "2026-10-28", totals: { clicks: 6, orders: 1 } });
    // The search terms too: 28 Oct's rows, not both.
    expect(d.terms.filter((t) => t.term === "dog seat belt")).toMatchObject([{ from: "2026-09-29", to: "2026-10-28", totals: { clicks: 6, orders: 1 } }]);
  });
});
