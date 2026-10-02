import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setAnthropicForTests } from "./adsAi";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { reviewData, saveReviewDump, saveReviewSynonyms, savePasteAll, setReviewMark, summariseReviews } from "./plReviews";

const fx = (f: string) => readFileSync(join(__dirname, "..", "pl", "__fixtures__", f), "utf8");
const CAND = "c1";

describe("Gate 4 review dumps (FakeDb, API mocked)", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
    __setDbForTests(db);
    db.tables.pl_candidates = [{ id: CAND, name: "Pill box", niche_keyword: "pill box" }];
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => { __setAnthropicForTests(null); __setDbForTests(null); });

  it("stores the raw text per ASIN; a new paste replaces it; empty clears", async () => {
    await saveReviewDump(CAND, "b0fake0001", fx("reviews-amazon.txt"));
    await saveReviewDump(CAND, "B0FAKE0001", "Lid broke.");
    expect(db.tables.pl_review_dumps).toEqual([expect.objectContaining({ candidate_id: CAND, asin: "B0FAKE0001", text: "Lid broke." })]);
    await saveReviewDump(CAND, "B0FAKE0001", "  ");
    expect(db.tables.pl_review_dumps).toEqual([]);
    await expect(saveReviewDump(CAND, "nope", "x")).rejects.toThrow(/ASIN/);
  });

  it("Paste all splits by \"ASIN:\" lines into one row each", async () => {
    const r = await savePasteAll(CAND, `ASIN: B0FAKE0001\n${fx("reviews-amazon.txt")}\nASIN: B0FAKE0002\n${fx("reviews-reviewed-in.txt")}\nASIN: B0FAKE0003\n${fx("reviews-paragraphs.txt")}`);
    expect(r.asins).toEqual(["B0FAKE0001", "B0FAKE0002", "B0FAKE0003"]);
    expect((await reviewData(CAND)).dumps).toHaveLength(3);
    await expect(savePasteAll(CAND, "no markers here")).rejects.toThrow(/ASIN/);
  });

  it("one chosen theme at a time; not fixable and ignore; null clears", async () => {
    await setReviewMark(CAND, "lid breaks", "chosen");
    await setReviewMark(CAND, "too small", "chosen");
    await setReviewMark(CAND, "smells", "ignore");
    await setReviewMark(CAND, "flimsy clip", "not fixable");
    expect((await reviewData(CAND)).marks).toEqual({ "too small": "chosen", smells: "ignore", "flimsy clip": "not fixable" });
    await setReviewMark(CAND, "smells", null);
    expect((await reviewData(CAND)).marks.smells).toBeUndefined();
  });

  it("synonyms: validated, saved, reset", async () => {
    await expect(saveReviewSynonyms([{ theme: "x", terms: [] }])).rejects.toThrow(/at least one term/);
    const g = await saveReviewSynonyms([{ theme: "Pops open", terms: ["Pop open", "pops open", "pop open"] }]);
    expect(g).toEqual([{ theme: "pops open", canon: "pops open", terms: ["pop open", "pops open"] }]);
    expect((await reviewData(CAND)).synonyms).toEqual(g);
    expect((await saveReviewSynonyms(null))[0].theme).toBe("breaks");
  });

  it("summarise: only the reviews and themes sent, ignored themes left out, cost logged", async () => {
    await savePasteAll(CAND, `ASIN: B0FAKE0001\n${fx("reviews-amazon.txt")}\nASIN: B0FAKE0002\n${fx("reviews-reviewed-in.txt")}`);
    await setReviewMark(CAND, "smells", "ignore");
    const answer = { complaints: [
      { sentence: "Lids break, in 73% of the negative reviews: a thicker hinge fixes it.", theme: "lid breaks" },
      { sentence: "Compartments are too small.", theme: "too small" },
      { sentence: "Lids pop open: a firmer clip.", theme: "lid pop open" },
    ] };
    const create = vi.fn(async (...args: unknown[]) => (void args, { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(answer) }], usage: { input_tokens: 3000, output_tokens: 300 } }));
    __setAnthropicForTests({ messages: { create } } as never);
    const r = await summariseReviews(CAND);
    expect(r.result.complaints).toHaveLength(3);
    const body = create.mock.calls[0][0] as { system: string; messages: { content: string }[] };
    expect(body.system).toMatch(/factory can fix/);
    const sent = body.messages[0].content;
    expect(sent).toContain("\"negative_reviews\":30");
    expect(sent).not.toContain("\"theme\":\"smells\"");
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ feature: "pl_reviews", subject: CAND, input_tokens: 3000, output_tokens: 300, error: null });
    expect(r.costGbp).toBeCloseTo((3000 * 3 + 300 * 15) / 1e6 * 0.79, 6);
    expect(r.uncited).toEqual(["73%"]);
    // Asked again with the same data: the stored answer, no call.
    expect((await summariseReviews(CAND)).cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect((await reviewData(CAND)).summary?.result).toEqual(answer);
  });
});
