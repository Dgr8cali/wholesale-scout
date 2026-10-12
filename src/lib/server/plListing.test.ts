import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setAnthropicForTests } from "./adsAi";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { generateListing, listingInputs, listingView, regenerateField, restoreListing, saveListingEdit, saveListingSettings } from "./plListing";

const CAND = "c1";
const answer = {
  title: "Glasses Cleaning Wipes, 200 Individually Wrapped Lens Wipes for Spectacles and Screens",
  bullets: [
    "Streak-Free Clear: an alcohol-light formula that leaves no smears on coated lenses.",
    "Stays Moist: each wipe sealed in its own sachet, so none arrive dried out.",
    "Gentle on Coatings: safe on anti-reflective and blue-light lenses.",
    "Pocket Size: a sachet fits a wallet, a car door or a glasses case.",
    "Generous Pack: 200 wipes, enough for a wipe a day for over six months.",
  ],
  description: "Clear lenses in seconds.",
  backend: "Spectacle cleaner B0ABCDEFGH zeiss eyeglass tissue glasses",
  differentiation: "Buyers say other wipes arrive dry and smear. Ours are sealed one by one.",
};
const reply = (a: unknown, tokens = { input_tokens: 4000, output_tokens: 800 }) => ({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(a) }], usage: tokens });

describe("Listing writer (FakeDb, API mocked)", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
    __setDbForTests(db);
    db.tables.pl_candidates = [{ id: CAND, name: "Lens wipes", niche_keyword: "glasses cleaning wipes", notes: null }];
    db.tables.pl_candidate_fields = [{ candidate_id: CAND, key: "sell", value: "12.99" }, { candidate_id: CAND, key: "spec", value: "200 wipes, individually wrapped" }];
    db.tables.pl_poe_snapshots = [{ candidate_id: CAND, captured_at: "2026-10-01T00:00:00Z", search_terms: [
      { term: "glasses cleaning wipes", volume: 12000, conversion: 9.1 },
      { term: "lens wipes", volume: 4000, conversion: 7.5 },
      { term: "zeiss lens wipes", volume: 900, conversion: 12 },
    ] }];
    db.tables.pl_niche_settings = [{ key: "brandTerms", value: ["zeiss"] }];
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => { __setAnthropicForTests(null); __setDbForTests(null); });

  it("inputs: search terms by volume, the lead term, competitor brands, the default voice", async () => {
    const i = await listingInputs(CAND);
    expect(i.searchTerms.map((t) => t.term)).toEqual(["glasses cleaning wipes", "lens wipes", "zeiss lens wipes"]);
    expect(i.leadTerm).toBe("glasses cleaning wipes");
    expect(i.brands).toContain("zeiss");
    expect(i.brandVoice).toBe("premium, clean, simple, no hype");
    expect(i.sellPrice).toBe(12.99);
    await saveListingSettings(CAND, { brandVoice: "warm", titleLimit: 150, packSize: "200 wipes" });
    expect(await listingInputs(CAND)).toMatchObject({ brandVoice: "warm", titleLimit: 150, packSize: "200 wipes" });
  });

  it("generate: cleaned, logged, cached by inputs; edits, field rewrites and restores are versions", async () => {
    const create = vi.fn(async (...args: unknown[]) => (void args, reply(answer)));
    __setAnthropicForTests({ messages: { create } } as never);
    const g = await generateListing(CAND);
    expect(g.call.cached).toBe(false);
    expect(g.call.costGbp).toBeGreaterThan(0);
    // Backend: lowercase, no ASIN, no competitor brand, no title words ("spectacle": the title has "Spectacles").
    expect(g.draft.outputs.backend).toBe("cleaner eyeglass tissue");
    expect(g.draft.version).toBe(1);
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ feature: "pl_listing", subject: CAND, input_tokens: 4000, output_tokens: 800 });
    const sent = (create.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(sent).toContain("glasses cleaning wipes");
    expect(g.checks.coverage.pct).toBeGreaterThan(90);

    // Same inputs: the stored answer, no new call (still a version).
    const again = await generateListing(CAND);
    expect(again.call.cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(again.draft).toMatchObject({ version: 2, source: "generated (cached)" });

    // An edit is kept as typed.
    const edited = await saveListingEdit(CAND, { ...answer, title: "Best FREE wipes" });
    expect(edited.draft).toMatchObject({ version: 3, source: "edited" });
    expect(edited.checks.issues.some((x) => x.field === "title")).toBe(true);

    // One field rewritten; the rest untouched.
    create.mockImplementationOnce(async () => reply({ description: "A new description." }, { input_tokens: 2000, output_tokens: 100 }));
    const r = await regenerateField(CAND, "description", edited.draft.outputs);
    expect(r.draft.outputs.description).toBe("A new description.");
    expect(r.draft.outputs.title).toBe("Best FREE wipes");
    expect(r.draft.source).toBe("regenerated description");

    const back = await restoreListing(CAND, 1);
    expect(back.draft).toMatchObject({ version: 5, source: "restored v1" });
    expect(back.draft.outputs.title).toBe(answer.title);
    await expect(restoreListing(CAND, 99)).rejects.toThrow("No version 99");

    const v = await listingView(CAND);
    expect(v.versions.map((x) => x.version)).toEqual([5, 4, 3, 2, 1]);
    expect(v.latest?.version).toBe(5);
  });

  it("nothing to write from: no call", async () => {
    db.tables.pl_poe_snapshots = [];
    const create = vi.fn();
    __setAnthropicForTests({ messages: { create } } as never);
    await expect(generateListing(CAND)).rejects.toThrow(/Nothing to write from/);
    expect(create).not.toHaveBeenCalled();
  });
});
