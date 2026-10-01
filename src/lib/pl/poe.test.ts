import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPoe, nicheOf, poeFill, unreadFields } from "./poe";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8"));

/**
 * The first real capture (1 Oct 2026), verbatim: the old extension matched /getNiche/i, which also
 * caught a list operation (data.niches, here empty), so the niche itself never arrived.
 */
const EMPTY = fixture("poe-capture-2026-10-01.json");

/**
 * A real getNiche capture (bottle brush, amazon.co.uk, 1 Oct 2026), trimmed to what the parser
 * reads and anonymised (no niche id, ASINs replaced, no titles or images). Amazon's own field names:
 * data.niche.{nicheTitle, nicheSummary, asinMetrics[], trendsMetrics[], searchTermMetrics[]};
 * nicheSummary.{searchVolumeT360, productCount, minimum/maximumAverageUnitsSoldT360,
 * searchVolumeGrowthT360, purchaseConversionRatePostLaunch90d (null), …}, no niche-level search
 * conversion; trendsMetrics[].{datasetDate, searchVolumeT7, searchConversionRateT7} (104 weeks);
 * searchTermMetrics[].{searchTerm, searchVolumeT360, clickShareT360, searchConversionRateT360};
 * asinMetrics[].clickShareT360. Several numbers come as strings ("1484395").
 */
const REAL = fixture("poe-bottle-brush-2026-10-01.json");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const nicheIn = (raw: { niche: { data: { niche: Record<string, unknown> } } }) => raw.niche.data.niche;

describe("Opportunity Explorer captures", () => {
  it("reads nothing from the first (empty) capture, and says so for all eight fields", () => {
    expect(EMPTY).toEqual({ niche: { data: { niches: [] } }, growth: null });
    expect(nicheOf(EMPTY.niche)).toBeNull(); // a list operation isn't a niche
    const x = extractPoe(EMPTY);
    expect(unreadFields(x)).toHaveLength(8);
    expect(poeFill(x)).toEqual({});
  });

  it("reads Amazon's real getNiche fields", () => {
    const x = extractPoe(REAL);
    expect(x).toMatchObject({
      niche_title: "bottle brush",
      search_volume_360: 1484395,
      products_in_niche: 52,
      top3_click_share: 22.8, // the three highest asinMetrics clickShareT360
      // minimumAverageUnitsSoldT360 3,000 – maximum 4,000 a year: the midpoint, a month
      avg_units_per_product: 292,
      // No niche-level figure: the niche's weekly conversion, last 52 weeks, volume-weighted
      search_conversion: 10.1,
      search_conversion_source: "trends",
    });
    expect(x.search_terms).toHaveLength(20);
    expect(x.search_terms[0]).toMatchObject({ term: "bottle brush", volume: 60624, click_share: 48.6, conversion: 7.7 });
    expect(unreadFields(x)).toEqual([]);
  });

  it("marks a derived conversion as POE (derived), with how it was worked out", () => {
    const f = poeFill(extractPoe(REAL));
    expect(f.conv).toMatchObject({ value: "10.1", source: "poe_derived" });
    expect(f.conv.why).toMatch(/weekly search conversion over the last 52 weeks/);
    expect(f.sv360.source).toBeUndefined(); // read off the capture: plain POE
  });

  it("falls back to the search terms' volume-weighted conversion without the weekly trend", () => {
    const raw = clone(REAL);
    delete nicheIn(raw).trendsMetrics;
    const x = extractPoe({ niche: raw.niche });
    expect(x).toMatchObject({ search_conversion: 7.5, search_conversion_source: "terms" });
    expect(poeFill(x).conv).toMatchObject({ source: "poe_derived" });
    expect(poeFill(x).conv.why).toMatch(/search terms' 360-day conversion/);
  });

  it("uses the niche's own search conversion when Amazon gives one, and never the post-launch purchase rate", () => {
    const raw = clone(REAL);
    (nicheIn(raw).nicheSummary as Record<string, unknown>).purchaseConversionRatePostLaunch90d = 0.4;
    expect(extractPoe({ niche: raw.niche })).toMatchObject({ search_conversion: 10.1, search_conversion_source: "trends" });
    (nicheIn(raw).nicheSummary as Record<string, unknown>).searchConversionRateT360 = "0.0923";
    const x = extractPoe({ niche: raw.niche });
    expect(x).toMatchObject({ search_conversion: 9.2, search_conversion_source: "niche" });
    expect(poeFill(x).conv.source).toBeUndefined();
  });

  it("ignores list operations and takes search terms from a later call when getNiche lacks them", () => {
    const raw = clone(REAL);
    const terms = nicheIn(raw).searchTermMetrics;
    delete nicheIn(raw).searchTermMetrics;
    const x = extractPoe({
      niche: raw.niche,
      operations: { getNiche: raw.niche, getNiches: { data: { niches: [{ nicheTitle: "another niche", nicheSummary: { searchVolumeT360: 1 } }] } }, getNicheSearchTerms: { data: { searchTermMetrics: terms } } },
    });
    expect(x).toMatchObject({ niche_title: "bottle brush", search_volume_360: 1484395 });
    expect(x.search_terms).toHaveLength(20);
  });
});
