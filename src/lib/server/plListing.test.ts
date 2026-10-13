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
    db.tables.pl_candidates = [{ id: CAND, name: "Lens wipes", niche_keyword: "glasses cleaning wipes", notes: null, listing_brand: "Dewlens", listing_pack: "200 wipes",
      listing_specs: "70% isopropyl alcohol\n200 individually wrapped sachets", listing_suitable: "glasses, sunglasses, camera lenses", listing_not_for: "contact lenses, eyes", listing_avoid: "anti-fog" }];
    db.tables.pl_candidate_fields = [{ candidate_id: CAND, key: "sell", value: "12.99" }, { candidate_id: CAND, key: "spec", value: "200 wipes, individually wrapped" }];
    db.tables.pl_poe_snapshots = [{ candidate_id: CAND, captured_at: "2026-10-01T00:00:00Z", search_terms: [
      { term: "glasses cleaning wipes", volume: 12000, conversion: 9.1 },
      { term: "lens wipes", volume: 4000, conversion: 7.5 },
      { term: "zeiss lens wipes", volume: 900, conversion: 12 },
    ] }];
    db.tables.pl_niche_settings = [{ key: "brandTerms", value: ["zeiss"] }];
    db.tables.pl_candidate_asins = [{ candidate_id: CAND, asin: "B0COMP0001", brand: "Opticlear" }, { candidate_id: CAND, asin: "B0COMP0002", brand: "Generic" }, { candidate_id: CAND, asin: "B0COMP0003", brand: "DEWLENS" }];
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => { __setAnthropicForTests(null); __setDbForTests(null); });

  it("inputs: search terms by volume, the lead term, competitor brands, the default voice", async () => {
    const i = await listingInputs(CAND);
    expect(i.searchTerms.map((t) => t.term)).toEqual(["glasses cleaning wipes", "lens wipes", "zeiss lens wipes"]);
    expect(i.leadTerm).toBe("glasses cleaning wipes");
    expect(i.brands).toContain("zeiss");
    // The page-one ASINs' brands too, but not "Generic" or our own.
    expect(i.brands).toContain("opticlear");
    expect(i.brands).not.toContain("generic");
    expect(i.brands).not.toContain("dewlens");
    expect(i.brandVoice).toBe("premium, clean, simple, no hype");
    expect(i).toMatchObject({ brand: "Dewlens", specs: ["70% isopropyl alcohol", "200 individually wrapped sachets"], suitableFor: ["glasses", "sunglasses", "camera lenses"], notFor: ["contact lenses", "eyes"], avoid: ["anti-fog"] });
    expect(i.sellPrice).toBe(12.99);
    await saveListingSettings(CAND, { brandVoice: "warm", titleLimit: 150, packSize: "200 wipes" });
    expect(await listingInputs(CAND)).toMatchObject({ brandVoice: "warm", titleLimit: 150, packSize: "200 wipes" });
  });

  it("generate: fixed in code, one repair call for what still fails, both logged, cached by inputs; edits, field rewrites and restores are versions", async () => {
    const repaired = { ...answer, title: "Dewlens Glasses Cleaning Wipes, 200 Individually Wrapped Wipes for Glasses, Sunglasses and Camera Lenses", description: "One.\n\nTwo.\n\nThree." };
    const create = vi.fn(async (...args: unknown[]) => (void args, reply(create.mock.calls.length === 1 ? answer : repaired, create.mock.calls.length === 1 ? { input_tokens: 4000, output_tokens: 800 } : { input_tokens: 2000, output_tokens: 700 })));
    __setAnthropicForTests({ messages: { create } } as never);
    const g = await generateListing(CAND);
    expect(create).toHaveBeenCalledTimes(2);
    expect(g.call).toMatchObject({ cached: false, calls: 2, tokens: { input: 6000, output: 1500 } });
    // Room for a full answer: 8,000 output tokens to write, 4,000 to repair.
    expect(create.mock.calls.map((x) => (x[0] as { max_tokens: number }).max_tokens)).toEqual([8000, 4000]);
    expect(g.call.costGbp).toBeGreaterThan(0);
    // The first draft broke rules: brand first (fixed in code), the uses in the title, three paragraphs (sent to repair).
    expect(g.fixes).toContain("Title starts with Dewlens");
    expect(g.failedBeforeRepair.map((f) => f.rule)).toEqual(expect.arrayContaining([expect.stringMatching(/top uses/), "Description in 3 short paragraphs"]));
    const repairSent = (create.mock.calls[1][0] as { messages: { content: string }[] }).messages[0].content;
    expect(repairSent).toContain("failedRules");
    expect(repairSent).not.toContain("reviewSummary");
    expect(g.draft).toMatchObject({ version: 1, source: "generated + repaired" });
    expect(g.draft.outputs.title.startsWith("Dewlens Glasses Cleaning Wipes")).toBe(true);
    expect(g.checks.list.find((c) => c.id === "uses")).toMatchObject({ pass: true });
    // Backend: lowercase, no ASIN, no competitor brand, no title words, filled from the search terms.
    expect(g.draft.outputs.backend).toMatch(/^spectacle cleaner eyeglass tissue/);
    expect(g.draft.outputs.backend).not.toMatch(/zeiss|b0abcdefgh|glasses/);
    expect(db.tables.ads_ai_calls.map((c) => c.subject)).toEqual([CAND, `${CAND}:repair`]);
    expect(db.tables.ads_ai_calls[1]).toMatchObject({ feature: "pl_listing", input_tokens: 2000, output_tokens: 700 });
    const sent = (create.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(sent).toContain("glasses cleaning wipes");
    expect(sent).toContain("Dewlens");
    expect(sent).toContain("anti-fog");
    expect(g.checks.proof.length).toBeGreaterThan(0);

    // Same inputs: both answers from the cache, no new calls (still a version).
    const again = await generateListing(CAND);
    expect(again.call).toMatchObject({ cached: true, costGbp: 0 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(again.draft).toMatchObject({ version: 2, source: "generated (cached) + repaired" });

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
    expect(back.draft.outputs.title).toBe(g.draft.outputs.title);
    await expect(restoreListing(CAND, 99)).rejects.toThrow("No version 99");

    const v = await listingView(CAND);
    expect(v.versions.map((x) => x.version)).toEqual([5, 4, 3, 2, 1]);
    expect(v.latest?.version).toBe(5);
  });

  it("no brand, or nothing to write from: no call", async () => {
    const create0 = vi.fn();
    __setAnthropicForTests({ messages: { create: create0 } } as never);
    db.tables.pl_candidates[0].listing_brand = null;
    await expect(generateListing(CAND)).rejects.toThrow(/brand name/);
    db.tables.pl_candidates[0].listing_brand = "Dewlens";
    db.tables.pl_poe_snapshots = [];
    const create = vi.fn();
    __setAnthropicForTests({ messages: { create } } as never);
    await expect(generateListing(CAND)).rejects.toThrow(/Nothing to write from/);
    expect(create).not.toHaveBeenCalled();
  });
});
