import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXT_TOKEN_CAP, estimateTokens } from "../ads/ai";
import { buildReviewSummaryContext, DEFAULT_SYNONYMS, canonicalise, mineThemes, reviewsOf, sixWordsDraft, splitPasteAll, splitReviews } from "./reviews";

// 40 fake critical reviews of a pill organiser across 3 ASINs, one per paste format: Amazon's page
// (star lines, names, "Helpful/Report"), "Reviewed in …" lines with titles, and blank-line paragraphs.
const fx = (f: string) => readFileSync(join(__dirname, "__fixtures__", f), "utf8");
const dumps = [
  { asin: "B0FAKE0001", text: fx("reviews-amazon.txt") },
  { asin: "B0FAKE0002", text: fx("reviews-reviewed-in.txt") },
  { asin: "B0FAKE0003", text: fx("reviews-paragraphs.txt") },
];
const reviews = reviewsOf(dumps);
const { total, themes } = mineThemes(reviews);
const theme = (t: string) => themes.find((x) => x.theme === t);

describe("splitting a paste into reviews", () => {
  it("each format: 16 + 14 + 10 = 40", () => {
    expect(reviews.filter((r) => r.asin === "B0FAKE0001")).toHaveLength(16);
    expect(reviews.filter((r) => r.asin === "B0FAKE0002")).toHaveLength(14);
    expect(reviews.filter((r) => r.asin === "B0FAKE0003")).toHaveLength(10);
    expect(total).toBe(40);
  });
  it("Amazon's page: stars and title from the star line; names, dates and Helpful/Report dropped", () => {
    const a = reviews.filter((r) => r.asin === "B0FAKE0001");
    expect(a[0]).toMatchObject({ stars: 1, title: "Lid broke in a week", body: "The lid broke after a week of daily use. The hinge is very thin plastic." });
    expect(a.map((r) => r.stars)).toEqual([1, 2, 1, 3, 1, 2, 1, 2, 1, 3, 1, 2, 1, 2, 3, 1]);
    const text = a.map((r) => `${r.title} ${r.body}`).join(" ");
    for (const noise of ["Helpful", "Report", "Verified Purchase", "Reviewed in", "Colour:", "people found", "Mark T", "Sandra"]) expect(text).not.toContain(noise);
  });
  it("\"Reviewed in\" lines: the title is the line before", () => {
    const b = reviews.filter((r) => r.asin === "B0FAKE0002");
    expect(b[0]).toMatchObject({ stars: null, title: "Lid snapped", body: "The lid snapped clean off after ten days." });
    expect(b[13]).toMatchObject({ title: "Colour faded", body: "The colour faded after washing. Otherwise fine." });
  });
  it("blank lines otherwise; sentences split", () => {
    expect(splitReviews("B0X", "One. Two!\n\nThree?")).toEqual([
      { asin: "B0X", stars: null, title: null, body: "One. Two!", sentences: ["One.", "Two!"] },
      { asin: "B0X", stars: null, title: null, body: "Three?", sentences: ["Three?"] },
    ]);
  });
  it("Paste all: sections by \"ASIN: B0…\" lines, repeated ASINs joined", () => {
    const r = splitPasteAll("stray header\nASIN: B0FAKE0001\nLid broke.\n\nasin: b0fake0002\nToo small.\nASIN: B0FAKE0001\nSnapped.");
    expect(r.sections).toEqual([{ asin: "B0FAKE0001", text: "Lid broke.\n\nSnapped." }, { asin: "B0FAKE0002", text: "Too small." }]);
    expect(r.ignored).toBeGreaterThan(0);
  });
});

describe("themes", () => {
  it("synonyms merge: broke/snapped/fell apart/cracked → breaks; tiny → small; odour → smells", () => {
    expect(canonicalise("The lid SNAPPED and it fell apart; tiny compartments, an odour", DEFAULT_SYNONYMS)).toBe("the lid breaks and it breaks; small compartments, an smells");
  });
  it("the complaints that repeat, with counts and shares of the 40", () => {
    expect(theme("breaks")).toMatchObject({ kind: "group", reviews: 15, pct: 37.5, asins: ["B0FAKE0001", "B0FAKE0002", "B0FAKE0003"] });
    expect(theme("lid breaks")).toMatchObject({ kind: "phrase", reviews: 13, pct: 32.5 });
    expect(theme("too small")).toMatchObject({ kind: "group", reviews: 8, pct: 20 });
    expect(theme("lid pop open")).toMatchObject({ reviews: 7, pct: 17.5 });
    expect(theme("flimsy clip")).toMatchObject({ reviews: 5, pct: 12.5 });
    expect(theme("smells")).toMatchObject({ reviews: 4, pct: 10 });
    expect(theme("compartment too small")?.reviews).toBe(5);
    expect(themes[0].theme).toBe("breaks");
  });
  it("phrases that add nothing are dropped: halves of a trigram, word-order twins, one-offs", () => {
    expect(theme("lid pop")).toBeUndefined();
    expect(theme("pop open")).toBeUndefined();
    expect(theme("breaks lid")).toBeUndefined();
    expect(theme("colour faded")).toBeUndefined();
    expect(themes.every((t) => t.reviews >= 2)).toBe(true);
  });
  it("three example sentences from different reviews", () => {
    const ex = theme("flimsy clip")!.examples;
    expect(ex).toHaveLength(3);
    expect(ex[0]).toBe("Flimsy clip");
    expect(new Set(ex).size).toBe(3);
  });
  it("an edited synonym list changes the themes", () => {
    const mine = mineThemes(reviews, [...DEFAULT_SYNONYMS, { theme: "pops open", canon: "pops open", terms: ["pop open", "pops open", "won't stay shut"] }]);
    expect(mine.themes.find((t) => t.theme === "pops open")).toMatchObject({ kind: "group", reviews: 8 });
  });
});

describe("Gate 4 prefill and the summary", () => {
  it("a draft six words from the theme", () => {
    expect(sixWordsDraft("lid breaks", "pill box")).toBe("the only pill box whose lid doesn't break");
    expect(sixWordsDraft("breaks", "pill box")).toBe("the only pill box that doesn't break");
    expect(sixWordsDraft("too small", "pill box")).toBe("the only pill box that's big enough");
    expect(sixWordsDraft("compartment too small", "pill box")).toBe("the only pill box with a bigger compartment");
    expect(sixWordsDraft("leaks", "bottle")).toBe("the only bottle that doesn't leak");
    expect(sixWordsDraft("flimsy clip", "pill box")).toBe("the only pill box without the flimsy clip");
  });
  it("the summary's context: themes with shares, reviews, under the cap", () => {
    const c = buildReviewSummaryContext("pill box", reviews, themes);
    expect(c.negative_reviews).toBe(40);
    expect(c.themes[0]).toEqual({ theme: "breaks", reviews: 15, pct_of_negative_reviews: 37.5, listings: 3 });
    expect(c.reviews).toHaveLength(40);
    expect(estimateTokens(c)).toBeLessThan(CONTEXT_TOKEN_CAP);
    const big = buildReviewSummaryContext("x", Array.from({ length: 2000 }, (_, i) => ({ ...reviews[i % 40], body: "word ".repeat(100) })), themes);
    expect(estimateTokens(big)).toBeLessThanOrEqual(CONTEXT_TOKEN_CAP);
    expect(big.trimmed).toContain("reviews");
  });
});
