import { describe, expect, it } from "vitest";
import { aggregateBrands, brandGating, brandsToChase, median, wholesaleScore, type BrandProduct } from "./brandMap";
import type { BrandApproval } from "./brands";

let n = 0;
const row = (brand: string, over: Partial<BrandProduct> = {}): BrandProduct => ({
  product_id: `p${++n}`, brand_key: brand.toLowerCase().replace(/[^a-z0-9]/g, ""), brand, ean: `50000000000${n}`, asin: `B0TEST${String(n).padStart(4, "0")}`,
  title: null, image_url: null, result_id: null, verdict: "fail", priced: true, sell_price: 20, buy_box: 20, fba_sellers: 4, amazon: false,
  max_landed: 8, restriction: "open", apply_url: null, sellers: [], buy_box_holder: null, suppliers: ["Henbrandt"], ...over,
});

describe("brand map", () => {
  it("rolls products up per brand", () => {
    const rows = [
      row("Nuxe", { verdict: "pass", fba_sellers: 3, amazon: true, buy_box: 20, max_landed: 7, sellers: [{ id: "A1", name: "Shop One", sharePct: 60 }], buy_box_holder: "A1" }),
      row("NUXE", { verdict: "warn", fba_sellers: 5, amazon: false, buy_box: 30, max_landed: 9, suppliers: ["Qogita", "Henbrandt"] }),
      row("Nuxe", { verdict: "pass", priced: false, fba_sellers: null, amazon: null, buy_box: null, max_landed: null, asin: null }),
      row("Bioderma", { restriction: "approval_required", apply_url: "https://sellercentral.amazon.co.uk/apply" }),
    ];
    const [nuxe] = aggregateBrands(rows, []).filter((b) => b.key === "nuxe");
    expect(nuxe).toMatchObject({
      brand: "Nuxe", asins: 2, pass: 1, warn: 1, // the unpriced pass doesn't count
      avgSellers: 4, amazonSharePct: 50, avgBuyBox: 25, medianMaxLanded: 8, gating: "open", ipRisk: null,
      suppliers: [{ name: "Henbrandt", count: 3 }, { name: "Qogita", count: 1 }],
      sellers: [{ id: "A1", name: "Shop One", count: 1 }],
    });
    const bio = aggregateBrands(rows, []).find((b) => b.key === "bioderma")!;
    expect(bio).toMatchObject({ gating: "approval_needed", applyUrl: "https://sellercentral.amazon.co.uk/apply" });
  });

  it("takes gating from your approvals first, then Amazon's answers", () => {
    const a = (status: BrandApproval["status"]) => ({ status });
    expect(brandGating([{ restriction: "approval_required" }], a("approved"))).toBe("approved");
    expect(brandGating([{ restriction: "open" }], a("refused"))).toBe("blocked");
    expect(brandGating([{ restriction: "approval_required" }], a("applied"))).toBe("applied");
    expect(brandGating([{ restriction: "approval_required" }, { restriction: "open" }], null)).toBe("open");
    expect(brandGating([{ restriction: "blocked" }], null)).toBe("blocked");
    expect(brandGating([{ restriction: null }], null)).toBe("unknown");
  });

  it("scores wholesale-friendliness", () => {
    const best = { gating: "open", applyUrl: null, amazonSharePct: 0, avgSellers: 4, pass: 3, warn: 2 } as const;
    expect(wholesaleScore(best)).toBe(100);
    expect(wholesaleScore({ ...best, gating: "blocked" })).toBe(70);
    expect(wholesaleScore({ ...best, gating: "approval_needed", applyUrl: "x" })).toBeGreaterThan(wholesaleScore({ ...best, gating: "approval_needed", applyUrl: null }));
    expect(wholesaleScore({ ...best, amazonSharePct: 100 })).toBe(75);
    expect(wholesaleScore({ ...best, avgSellers: 20 })).toBe(84);
    expect(wholesaleScore({ ...best, pass: 0, warn: 0 })).toBe(75);
  });

  it("lists brands to chase: best score, not approved, not blocked or unbranded", () => {
    const rows = [
      row("Chase Me", { verdict: "pass" }), row("Chase Me", { verdict: "pass" }),
      row("Nothing Passes"),
      row("Approved Co", { verdict: "pass" }),
      row("Blocked Co", { restriction: "blocked" }),
      row("Unknown brand", { brand_key: "unknown" }),
    ];
    const approvals: BrandApproval[] = [{ brand_key: "approvedco", brand: "Approved Co", status: "approved", requirement: null, status_date: null }];
    expect(brandsToChase(aggregateBrands(rows, approvals)).map((b) => b.brand)).toEqual(["Chase Me"]);
  });

  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
