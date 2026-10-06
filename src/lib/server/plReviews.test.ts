import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setAnthropicForTests } from "./adsAi";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { addReviewedAsin, candidatesWithAsin, keepReviewsSeparate, reviewData, saveCapturedReviews, saveReviewDump, saveReviewSynonyms, savePasteAll, setReviewMark, summariseReviews } from "./plReviews";

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

  it("the extension's capture: matched by ASIN, a hand paste kept until you choose, resends merged by review id", async () => {
    db.tables.pl_candidates.push({ id: "c2", name: "Pill case", status: "dropped" }, { id: "c3", name: "Pill organiser", status: "draft" });
    db.tables.pl_candidate_asins = [{ candidate_id: CAND, asin: "B0FAKE0001" }, { candidate_id: "c2", asin: "B0FAKE0001" }, { candidate_id: "c3", asin: "B0OTHER001" }];
    expect((await candidatesWithAsin("b0fake0001")).map((c) => c.id)).toEqual([CAND]);
    const rv = (id: string, stars: number, body: string) => ({ id, stars, title: `T ${id}`, body, date: "Reviewed in the United Kingdom on 1 September 2026", variant: "Colour: Blue", helpful: 2 });
    const first = [rv("R1AAAAAAAA", 1, "The lid snapped off."), rv("R2BBBBBBBB", 5, "Great."), rv("R3CCCCCCCC", 2, "Too small for tablets.")];

    // A paste by hand is there: nothing changes until you say how.
    await saveReviewDump(CAND, "B0FAKE0001", "Lid broke after a week.");
    expect(await saveCapturedReviews(CAND, "B0FAKE0001", first)).toEqual({ conflict: "pasted", pastedChars: 23 });
    expect(db.tables.pl_review_dumps[0].text).toBe("Lid broke after a week.");

    const r = await saveCapturedReviews(CAND, "B0FAKE0001", first, "append");
    expect(r).toMatchObject({ conflict: null, added: 3, total: 3, inDump: 2, keptPaste: true, stars: { 1: 1, 2: 1, 5: 1 } });
    const text = db.tables.pl_review_dumps[0].text as string;
    expect(text.startsWith("Lid broke after a week.\n\n1.0 out of 5 stars T R1AAAAAAAA")).toBe(true);
    expect(text).not.toContain("Great.");

    // Sent again with one new review: only that one is added; the paste stays on top.
    const again = await saveCapturedReviews(CAND, "B0FAKE0001", [first[0], rv("R4DDDDDDDD", 3, "Hinge cracked.")]);
    expect(again).toMatchObject({ added: 1, total: 4, inDump: 3, keptPaste: true });
    const d = await reviewData(CAND);
    expect(d.dumps[0].captured).toMatchObject({ total: 4, inDump: 3 });

    // Replace drops a hand paste; editing the text by hand makes it all yours.
    await saveReviewDump(CAND, "B0FAKE0001", "Mine now.");
    expect((await reviewData(CAND)).dumps[0].captured).toBeNull();
    await saveCapturedReviews(CAND, "B0FAKE0001", first, "replace");
    expect(db.tables.pl_review_dumps[0].text).not.toContain("Mine now.");
    await expect(saveCapturedReviews(CAND, "B0FAKE0001", [{ body: " " }])).rejects.toThrow("No reviews");
  });

  it("reviews for an ASIN not on the candidate are kept; add it or keep it separate; a removed ASIN's reviews stay", async () => {
    db.tables.pl_candidate_asins = [{ candidate_id: CAND, asin: "B0FAKE0001", position: 1, is_reference: true }];
    const rv = [{ id: "R1AAAAAAAA", stars: 1, title: "Snapped", body: "Snapped on day one.", date: null, variant: null, helpful: null }];
    const r = await saveCapturedReviews(CAND, "B0FY3H7Y9R", rv);
    expect(r).toMatchObject({ onCandidate: false, total: 1 });
    expect((await reviewData(CAND)).dumps).toEqual([expect.objectContaining({ asin: "B0FY3H7Y9R", removed_at: null, kept_separate: false })]);
    expect(await saveCapturedReviews(CAND, "B0FAKE0001", rv)).toMatchObject({ onCandidate: true });

    await keepReviewsSeparate(CAND, "B0FY3H7Y9R");
    expect((await reviewData(CAND)).dumps.find((d) => d.asin === "B0FY3H7Y9R")).toMatchObject({ kept_separate: true });
    expect(await addReviewedAsin(CAND, "b0fy3h7y9r")).toEqual(["B0FAKE0001", "B0FY3H7Y9R"]);
    expect((await reviewData(CAND)).dumps.find((d) => d.asin === "B0FY3H7Y9R")).toMatchObject({ kept_separate: false, removed_at: null });

    // Removed from the candidate: its reviews stay, marked.
    const { setAsins } = await import("./pl");
    await setAsins(CAND, ["B0FAKE0001"]);
    expect((await reviewData(CAND)).dumps.find((d) => d.asin === "B0FY3H7Y9R")!.removed_at).toBeTruthy();
    expect(db.tables.pl_review_dumps).toHaveLength(2);

    // Ten ASINs is the most.
    await setAsins(CAND, Array.from({ length: 10 }, (_, i) => `B0FULL000${i}`));
    await expect(addReviewedAsin(CAND, "B0FY3H7Y9R")).rejects.toThrow("10 page-one ASINs");
  });

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
