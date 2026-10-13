import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leanThinking, REVIEW_TOOL, TARGETS_TOOL } from "../ads/ai";
import { __setAnthropicForTests, askModel, CutOffError, MAX_TOKENS_CAP, strictSchema } from "./adsAi";
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

  /** A reply that stopped at max_tokens (half a JSON object), then optionally a complete one. */
  const cutThen = (complete: unknown | null) => {
    const create = vi.fn(async (...args: unknown[]) => {
      void args;
      const cut = create.mock.calls.length === 1 || complete == null;
      return {
        id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: cut ? "max_tokens" : "end_turn", stop_sequence: null,
        content: [{ type: "text", text: cut ? '{"launch_target_pct": 45, "justification": "Break-e' : JSON.stringify(complete) }],
        usage: cut ? { input_tokens: 1800, output_tokens: 3000 } : { input_tokens: 1800, output_tokens: 500 },
      };
    });
    return { messages: { create }, create };
  };
  const limits = (c: { create: { mock: { calls: unknown[][] } } }) => c.create.mock.calls.map((x) => (x[0] as { max_tokens: number }).max_tokens);

  it("a max_tokens stop: one retry at double the limit, both attempts logged, the run's cost adds both, the cut-off never cached", async () => {
    const c = cutThen(answer);
    __setAnthropicForTests(c as never);
    const r = await askModel({ feature: "targets", subject: "B0H9ZKYYHZ", context: { break_even_acos_pct: 48.7 }, instruction: "Propose targets.", tool: TARGETS_TOOL, maxTokens: 3000 });
    expect(limits(c)).toEqual([3000, 6000]);
    expect(r).toMatchObject({ result: answer, cached: false, tokens: { input: 3600, output: 3500 } });
    // (3,600 × $3 + 3,500 × $15) per million = $0.0633.
    expect(r.costUsd).toBeCloseTo(0.0633, 6);
    expect(db.tables.ads_ai_calls).toHaveLength(2);
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ result: null, error: "Cut off at 3000 tokens (stop: max_tokens): retried at 6000", output_tokens: 3000 });
    expect(db.tables.ads_ai_calls[1]).toMatchObject({ result: answer, error: null });
    // The cache serves the complete answer, not the cut one.
    const again = await askModel({ feature: "targets", subject: "B0H9ZKYYHZ", context: { break_even_acos_pct: 48.7 }, instruction: "Propose targets.", tool: TARGETS_TOOL, maxTokens: 3000 });
    expect(again).toMatchObject({ cached: true, result: answer });
    expect(c.create).toHaveBeenCalledTimes(2);
  });

  it("cut off twice: a clear error with the caller's hint, nothing cached, the next click calls again; the retry is capped at 16,000", async () => {
    const c = cutThen(null);
    __setAnthropicForTests(c as never);
    const ask = () => askModel({ feature: "pl_listing", subject: "c1", context: { x: 1 }, instruction: "Write.", tool: TARGETS_TOOL, maxTokens: 10_000, cutOffHint: "Try again or shorten Key specs." });
    const err = await ask().catch((e) => e);
    expect(err).toBeInstanceOf(CutOffError);
    expect(err.message).toBe("The answer was cut off (too long). Try again or shorten Key specs.");
    expect(limits(c)).toEqual([10_000, MAX_TOKENS_CAP]);
    expect(db.tables.ads_ai_calls.map((x) => x.error)).toEqual(["Cut off at 10000 tokens (stop: max_tokens): retried at 16000", "Cut off at 16000 tokens (stop: max_tokens)"]);
    expect(db.tables.ads_ai_calls.every((x) => x.result == null && x.output_tokens === 3000)).toBe(true);
    // Not cached: the next click is a real call (two more attempts).
    await ask().catch(() => {});
    expect(c.create).toHaveBeenCalledTimes(4);
    // At the cap already: no retry.
    c.create.mockClear();
    await askModel({ feature: "pl_listing", subject: "c2", context: {}, instruction: "Write.", tool: TARGETS_TOOL, maxTokens: 16_000 }).catch((e) => expect(e.message).toBe("The answer was cut off (too long). Try again."));
    expect(c.create).toHaveBeenCalledTimes(1);
  });

  it("lean calls: no up-front thinking on Sonnet 5.5 (between_tools), thinking tokens logged; other calls unchanged", async () => {
    const c = fakeClient(answer, { input_tokens: 1800, output_tokens: 700, output_tokens_details: { thinking_tokens: 0 } } as never);
    __setAnthropicForTests(c as never);
    const r = await askModel({ feature: "pl_listing", subject: "c1", context: { x: 1 }, instruction: "Write.", tool: TARGETS_TOOL, lean: true });
    const body = (c.create.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect((body.output_config as Record<string, unknown>).effort).toBeUndefined();
    expect(r.tokens).toEqual({ input: 1800, output: 700, thinking: 0 });
    expect(db.tables.ads_ai_calls[0]).toMatchObject({ thinking_tokens: 0 });
    // Not lean: the request is as before, and the thinking the API reports is logged.
    const t = fakeClient(answer, { input_tokens: 1800, output_tokens: 6800, output_tokens_details: { thinking_tokens: 6100 } } as never);
    __setAnthropicForTests(t as never);
    const r2 = await run(true);
    expect((t.create.mock.calls as unknown as [Record<string, unknown>][])[0][0].thinking).toBeUndefined();
    expect(r2.tokens).toEqual({ input: 1800, output: 6800, thinking: 6100 });
    expect(db.tables.ads_ai_calls[1]).toMatchObject({ output_tokens: 6800, thinking_tokens: 6100 });
  });

  it("the least thinking each model allows", () => {
    expect(leanThinking("claude-sonnet-5-5")).toEqual({ thinking: { type: "between_tools" } });
    for (const m of ["claude-sonnet-5", "claude-haiku-5-5", "claude-opus-5"]) expect(leanThinking(m)).toEqual({ thinking: { type: "disabled" } });
    for (const m of ["claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5", "claude-mythos-preview"]) expect(leanThinking(m)).toEqual({ effort: "low" });
    expect(leanThinking("claude-haiku-4-5-20251001")).toEqual({});
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

  it("strict schemas: length and count caps move into the description (the grammar can't enforce them)", () => {
    const out = strictSchema({ type: "object", properties: {
      title: { type: "string", maxLength: 200, description: "The title" },
      words: { type: "array", maxItems: 40, items: { type: "string", maxLength: 30 } },
    } }) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.title).toEqual({ type: "string", description: "The title (at most 200 characters)" });
    expect(out.properties.words).toEqual({ type: "array", items: { type: "string", description: "(at most 30 characters)" }, description: "(at most 40 items)" });
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
