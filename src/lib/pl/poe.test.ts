import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPoe, nicheOf, poeFill, unreadFields } from "./poe";

/**
 * The first real capture (1 Oct 2026), verbatim: the old extension matched /getNiche/i, which also
 * caught a list operation (data.niches, here empty), so the niche itself never arrived.
 */
const REAL = JSON.parse(readFileSync(join(__dirname, "__fixtures__/poe-capture-2026-10-01.json"), "utf8"));

/**
 * The shape the extension now sends. getNiche's niche sits at data.niche with nicheSummary,
 * searchTermMetrics, asinMetrics and trendsMetrics (confirmed from an open-source capture of the
 * same call). The field names inside nicheSummary and the term rows are Amazon-style guesses
 * until a real getNiche is captured: replace this fixture with that capture when it is.
 */
const NICHE = {
  data: {
    niche: {
      nicheId: "abc123",
      nicheTitle: "bamboo cutlery tray",
      obfuscatedMarketplaceId: "x",
      nicheSummary: { searchVolumeT90: 12000, searchVolumeT360: 52000, searchVolumeGrowthT360: 0.08, productCount: 140, searchConversionRateT360: 0.112, avgUnitsSoldT360: 2400 },
      asinMetrics: [{ asin: "B1", asinTitle: "Not the niche's title", clickShareT360: 0.2 }, { asin: "B2", clickShareT360: 0.15 }, { asin: "B3", clickShareT360: 0.1 }, { asin: "B4", clickShareT360: 0.05 }],
      trendsMetrics: [{ startDate: "2025-10-01", searchVolume: 4000 }],
    },
  },
};
const TERMS = { data: { searchTermMetrics: [
  { searchTerm: "cutlery tray", searchVolumeT360: 36000, clickShareT360: 0.31, searchConversionRateT360: 0.1 },
  { searchTerm: "bamboo cutlery tray", searchVolumeT360: 9600 },
  { searchTerm: "expandable cutlery tray", searchVolumeT360: 4800 },
] } };

describe("Opportunity Explorer captures", () => {
  it("reads nothing from the real first capture, and says so for all eight fields", () => {
    expect(REAL).toEqual({ niche: { data: { niches: [] } }, growth: null });
    expect(nicheOf(REAL.niche)).toBeNull(); // a list operation isn't a niche
    const x = extractPoe(REAL);
    expect(unreadFields(x)).toEqual(["niche title", "search volume", "search volume growth", "products in niche", "top-3 click share", "search conversion", "units per product", "search terms"]);
    expect(poeFill(x)).toEqual({});
  });

  it("reads getNiche's data.niche from the merged capture, ignoring list operations", () => {
    const raw = { niche: NICHE, operations: { getNiche: NICHE, getNiches: { data: { niches: [{ nicheTitle: "some other niche", searchVolumeT360: 1 }] } } }, growth: [], seen: ["getNiche", "getNiches"] };
    const x = extractPoe(raw);
    expect(x).toMatchObject({ niche_title: "bamboo cutlery tray", niche_id: "abc123", search_volume_360: 52000, search_volume_growth: 8, products_in_niche: 140, top3_click_share: 45, search_conversion: 11.2, avg_units_per_product: 200 });
    expect(unreadFields(x)).toEqual(["search terms"]);
  });

  it("takes search terms from a later operation when getNiche doesn't carry them", () => {
    const x = extractPoe({ niche: NICHE, operations: { getNiche: NICHE, getNicheSearchTerms: TERMS }, growth: [], seen: [] });
    expect(x.search_terms.map((t) => [t.term, t.volume])).toEqual([["cutlery tray", 3000], ["bamboo cutlery tray", 800], ["expandable cutlery tray", 400]]);
    expect(unreadFields(x)).toEqual([]);
    expect(poeFill(x)).toMatchObject({ sv360: { value: "52000" }, svGrowth: { value: "growing" }, longtail: { value: "2" }, headVol: { value: "3000" } });
  });

  it("finds the niche when only the operations map has it", () => {
    expect(extractPoe({ operations: { getNiche: NICHE } }).search_volume_360).toBe(52000);
  });
});
