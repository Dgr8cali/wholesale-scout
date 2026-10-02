import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_TOOL, TARGETS_TOOL } from "../ads/ai";
import { __setAnthropicForTests, askModel, strictSchema } from "./adsAi";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";

/** A fake Messages API: records each request, answers through the forced tool. */
function fakeClient(answer: unknown, usage = { input_tokens: 1800, output_tokens: 400 }) {
  const create = vi.fn(async () => ({
    id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null,
    content: [{ type: "text", text: JSON.stringify(answer) }], usage,
  }));
  return { messages: { create }, create };
}

describe("the AI call (API mocked)", () => {
  let db: FakeDb;
  beforeEach(() => { db = new FakeDb(); __setDbForTests(db); process.env.ANTHROPIC_API_KEY = "test"; });
  afterEach(() => { __setAnthropicForTests(null); __setDbForTests(null); });

  const answer = { launch_target_pct: 45, steady_target_pct: 30, justification: "Break-even 48.7%.", confidence: "medium" };
  const run = (force = false) => askModel({ feature: "targets", subject: "B0H9ZKYYHZ", context: { break_even_acos_pct: 48.7 }, instruction: "Propose targets.", tool: TARGETS_TOOL, force });

  it("asks for JSON in the fixed schema, uses the model from settings, logs tokens and cost", async () => {
    const c = fakeClient(answer);
    __setAnthropicForTests(c as never);
    const r = await run();
    const body = (c.create.mock.calls as unknown as [{ model: string; output_config: { format: { type: string; schema: { additionalProperties: boolean; required: string[] } } }; system: string }][])[0][0];
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema).toMatchObject({ additionalProperties: false, required: ["launch_target_pct", "steady_target_pct", "justification", "confidence"] });
    expect(body.system).toMatch(/Never propose a specific bid or budget/);
    expect(r).toMatchObject({ result: answer, cached: false, tokens: { input: 1800, output: 400 } });
    // 1,800 × $3 + 400 × $15 per million = $0.0114 → £0.009 at 0.79.
    expect(r.costUsd).toBeCloseTo(0.0114, 6);
    expect(r.costGbp).toBeCloseTo(0.009006, 6);
    expect(db.tables.ads_ai_calls).toHaveLength(1);
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ feature: "targets", subject: "B0H9ZKYYHZ", input_tokens: 1800, output_tokens: 400, trigger: "user", error: null });
  });

  it("the same data returns the stored answer without a call; force asks again", async () => {
    const c = fakeClient(answer);
    __setAnthropicForTests(c as never);
    await run();
    const again = await run();
    expect(again.cached).toBe(true);
    expect(c.create).toHaveBeenCalledTimes(1);
    await run(true);
    expect(c.create).toHaveBeenCalledTimes(2);
    expect(db.tables.ads_ai_calls).toHaveLength(2);
  });

  it("a failed call is logged and reported", async () => {
    __setAnthropicForTests({ messages: { create: async () => { throw new Error("overloaded"); } } });
    await expect(run()).rejects.toThrow(/The AI call failed: overloaded/);
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ error: "overloaded" });
  });

  it("no key, no call", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(run()).rejects.toThrow(/ANTHROPIC_API_KEY isn't set/);
  });

  it("strict schemas: closed objects, every property required, no item counts above 1", () => {
    const sc = strictSchema(REVIEW_TOOL.input_schema) as { additionalProperties: boolean; properties: { recommendations: Record<string, unknown> & { items: { additionalProperties: boolean; required: string[] } } } };
    expect(sc.additionalProperties).toBe(false);
    expect(sc.properties.recommendations.maxItems).toBeUndefined();
    expect(sc.properties.recommendations.minItems).toBeUndefined();
    expect(sc.properties.recommendations.items).toMatchObject({ additionalProperties: false, required: ["rank", "title", "detail", "expected_profit_gbp_month", "maps_to"] });
    expect(REVIEW_TOOL.input_schema.properties.recommendations.maxItems).toBe(3); // the original is untouched
  });
});
