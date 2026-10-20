import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setAnthropicForTests } from "./adsAi";
import { askHistory, askScout, cleanAnswer, HISTORY, MAX_OUTPUT_TOKENS, MAX_TOOL_CALLS } from "./askScout";
import { __setDbForTests, activeRateCard } from "./db";
import { FakeDb } from "./fakeDb";

const NOW = new Date("2026-10-20T09:00:00Z");
type Req = { model: string; max_tokens: number; tool_choice: { type: string }; thinking?: unknown; tools: { name: string }[]; messages: { role: string; content: unknown }[] };
const usage = { input_tokens: 2000, output_tokens: 150 };
const toolUse = (name: string, input: unknown, id = `t${Math.random()}`) => ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "tool_use", stop_sequence: null, usage,
  content: [{ type: "text", text: "Looking that up." }, { type: "tool_use", id, name, input }] });
const final = (a: unknown) => ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", stop_sequence: null, usage, content: [{ type: "text", text: JSON.stringify(a) }] });

describe("Ask Scout (FakeDb, API mocked)", () => {
  let db: FakeDb;
  let reqs: Req[];
  const fake = (replies: unknown[]) => {
    reqs = [];
    __setAnthropicForTests({ messages: { create: async (body) => { reqs.push(JSON.parse(JSON.stringify(body)) as Req); return (replies.length > 1 ? replies.shift() : replies[0]) as never; } } });
  };
  beforeEach(async () => {
    db = new FakeDb();
    __setDbForTests(db);
    await activeRateCard();
    db.tables.ads_products = [{ asin: "B0HM8FBX3T", title: "Dog Seat Belt for Car, 2 Pack" }];
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => { __setAnthropicForTests(null); __setDbForTests(null); });

  it("looks up, answers with the figures and links, and logs tokens and £ once", async () => {
    fake([
      toolUse("find_products", { query: "seat belt" }),
      final({ answer: "No data after 2 Oct.", figures: [{ label: "Ad spend", value: "£30.00", href: "/ads/dashboard?asin=B0HM8FBX3T" }], links: [{ label: "Dashboard", href: "/ads/dashboard?asin=B0HM8FBX3T" }, { label: "Evil", href: "https://example.com" }], missing: ["ad data after 2 Oct"] }),
    ]);
    const r = await askScout("is the seat belt making money after ads?", NOW);
    expect(r.answer).toEqual({ answer: "No data after 2 Oct.", figures: [{ label: "Ad spend", value: "£30.00", href: "/ads/dashboard?asin=B0HM8FBX3T" }], links: [{ label: "Dashboard", href: "/ads/dashboard?asin=B0HM8FBX3T" }], missing: ["ad data after 2 Oct"], cannot: [] });
    expect(r.tools).toEqual([{ name: "find_products", input: { query: "seat belt" } }]);
    expect(r).toMatchObject({ input_tokens: 4000, output_tokens: 300, error: null });
    expect(r.cost_gbp).toBeGreaterThan(0);
    // The Listing Writer's setup: the configured model, thinking off, 1,500 tokens, auto tool choice.
    expect(reqs[0]).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: MAX_OUTPUT_TOKENS, tool_choice: { type: "auto" }, thinking: { type: "between_tools" } });
    // The tool's answer went back as a tool_result after the unchanged assistant turn.
    expect(reqs[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const calls = db.tables.ads_ai_calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ feature: "ask_scout", input_tokens: 4000, output_tokens: 300, error: null });
    expect(db.tables.ask_scout_history).toHaveLength(1);
  });

  it("stops looking up after 5 tool calls and must answer", async () => {
    fake([...Array.from({ length: MAX_TOOL_CALLS }, () => toolUse("proposals", {})), final({ answer: "Done.", figures: [], links: [], missing: [] })]);
    const r = await askScout("anything", NOW);
    expect(r.tools).toHaveLength(MAX_TOOL_CALLS);
    expect(reqs.at(-1)!.tool_choice).toEqual({ type: "none" });
    expect(reqs.slice(0, MAX_TOOL_CALLS).every((q) => q.tool_choice.type === "auto")).toBe(true);
    expect(r.answer?.answer).toBe("Done.");
  });

  it("several tool calls in one turn count against the cap; the extras are refused", async () => {
    const many = { ...toolUse("proposals", {}), content: Array.from({ length: 7 }, (_, i) => ({ type: "tool_use", id: `t${i}`, name: "proposals", input: {} })) };
    fake([many, final({ answer: "Ok.", figures: [], links: [], missing: [] })]);
    const r = await askScout("anything", NOW);
    expect(r.tools).toHaveLength(MAX_TOOL_CALLS);
    const results = reqs[1].messages[2].content as { is_error?: boolean }[];
    expect(results).toHaveLength(7);
    expect(results.filter((x) => x.is_error)).toHaveLength(2);
  });

  it("an empty answer gets one nudge to answer from the lookups", async () => {
    fake([final({ answer: "", figures: [], links: [], missing: [] }), final({ answer: "The pill box has 40 left.", figures: [], links: [], missing: [] })]);
    const r = await askScout("when should I reorder the pill box?", NOW);
    expect(r.answer?.answer).toBe("The pill box has 40 left.");
    expect(reqs).toHaveLength(2);
    expect(reqs[1].messages.at(-1)).toEqual({ role: "user", content: "Answer the question now, from what the lookups returned (or say what's missing)." });
  });

  it("a failed call is saved with its error and logged", async () => {
    __setAnthropicForTests({ messages: { create: async () => { throw new Error("overloaded"); } } });
    const r = await askScout("when should I reorder the pill box?", NOW);
    expect(r.answer).toBeNull();
    expect(r.error).toBe("The AI call failed: overloaded");
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ feature: "ask_scout", error: "The AI call failed: overloaded" });
  });

  it("keeps the last 20 questions", async () => {
    fake([final({ answer: "Ok.", figures: [], links: [], missing: [] })]);
    for (let i = 0; i < HISTORY + 3; i++) await askScout(`question ${i}`, new Date(NOW.getTime() + i * 1000));
    expect(db.tables.ask_scout_history).toHaveLength(HISTORY);
    const h = await askHistory();
    expect(h).toHaveLength(HISTORY);
    expect(h[0].question).toBe(`question ${HISTORY + 2}`);
  });

  it("an empty question isn't sent", async () => {
    fake([final({})]);
    await expect(askScout("   ", NOW)).rejects.toThrow("Type a question");
    expect(reqs).toEqual([]);
  });
});

describe("cleanAnswer", () => {
  it("shows a literal \\u00a3 as £", () => {
    expect(cleanAnswer({ answer: "\\u00a32.52\\u20132.68 a unit", figures: [{ label: "Price", value: "\\u00a31", href: "" }] }, new Set())).toMatchObject({ answer: "£2.52–2.68 a unit", figures: [{ value: "£1" }] });
  });
  it("keeps only the app's own pages as links", () => {
    const a = cleanAnswer({ answer: "x", figures: [{ label: "a", value: "1", href: "//evil.com" }], links: [{ label: "ok", href: "/stock/reorder" }, { label: "no", href: "javascript:alert(1)" }, { label: "seen", href: "/odd/page" }], missing: [] }, new Set(["/odd/page"]));
    expect(a.figures[0].href).toBe("");
    expect(a.links.map((l) => l.label)).toEqual(["ok", "seen"]);
  });
});
