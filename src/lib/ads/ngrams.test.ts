import { describe, expect, it } from "vitest";
import { grams, ngramTable, termHasGram } from "./ngrams";

describe("n-grams", () => {
  it("unigrams and bigrams, stop-words out, numbers kept", () => {
    expect(grams("Pill organiser for 7 day")).toEqual(["pill", "pill organiser", "organiser", "7", "7 day", "day"]);
    expect(grams("box with lid")).toEqual(["box", "lid"]);
    expect(termHasGram("pill box organiser", "box organiser")).toBe(true);
    expect(termHasGram("pill boxes", "box")).toBe(false);
  });

  it("sums per product and gram, with waste and distinct terms", () => {
    const t = (term: string, clicks: number, cost: number, orders: number) => ({ asin: "A", campaign: "c", adGroupIds: ["g"], term, impressions: 100, clicks, cost, orders, sales: orders * 10 });
    const rows = ngramTable([t("pill box", 10, 5, 1), t("pill organiser", 20, 8, 0), t("large pill box", 4, 2, 0)]);
    const pill = rows.find((r) => r.gram === "pill")!;
    expect(pill).toMatchObject({ clicks: 34, cost: 15, orders: 1, terms: 3, convertingTerms: 1, waste: 10, impressions: 300 });
    expect(rows.find((r) => r.gram === "pill box")).toMatchObject({ terms: 2, orders: 1 });
  });
});
