import { describe, expect, it } from "vitest";
import { UK_RATE_CARD_2026_07 } from "../fees/rateCard";
import { DEFAULT_SETTINGS, scorecard } from "./gatekeeper";
import { poeFill, type PoeExtract } from "./poe";
import { bestTermConversion, termSignal } from "./termConversion";

describe("search-term conversion", () => {
  it("BROWSE_ONLY under 2.5%, BUYING at 4%+, nothing between", () => {
    expect(termSignal(2.4)).toBe("BROWSE_ONLY");
    expect(termSignal(2.5)).toBeNull();
    expect(termSignal(3.9)).toBeNull();
    expect(termSignal(4)).toBe("BUYING");
    expect(termSignal(null)).toBeNull();
  });

  it("the best term, ignoring terms without a figure", () => {
    expect(bestTermConversion([{ term: "a", conversion: null }, { term: "b", conversion: 2.7 }, { term: "c", conversion: 1.1 }])).toEqual({ term: "b", conversion: 2.7 });
    expect(bestTermConversion([{ term: "a", conversion: null }])).toBeNull();
  });

  it("a capture fills the candidate's field; the scorecard reads it without scoring it", () => {
    const x = { niche_title: "tackle box", search_terms: [{ term: "tackle box", volume: 9000, click_share: 20, conversion: 1.2 }, { term: "fishing box", volume: 800, click_share: 10, conversion: 2.1 }] } as unknown as PoeExtract;
    const fill = poeFill(x);
    expect(fill.bestTermConv).toMatchObject({ value: "2.1" });
    const card = UK_RATE_CARD_2026_07;
    const without = scorecard({}, DEFAULT_SETTINGS, "Home Products", card);
    const sc = scorecard({ bestTermConv: fill.bestTermConv.value }, DEFAULT_SETTINGS, "Home Products", card);
    const line = sc.rows.find((r) => r.info)!;
    expect(line.info).toMatchObject({ signal: "BROWSE_ONLY", answered: true });
    expect(line.info!.text).toContain("browse-only");
    expect([sc.total, sc.answered]).toEqual([without.total, without.answered]);
    expect(scorecard({ bestTermConv: "6.5" }, DEFAULT_SETTINGS, "Home Products", card).rows.find((r) => r.info)!.info!.signal).toBe("BUYING");
  });
});
