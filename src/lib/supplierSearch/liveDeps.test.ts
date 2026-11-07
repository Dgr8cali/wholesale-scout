import { describe, expect, it } from "vitest";
import { memoryStore } from "./liveDeps";
import { Budget, runProduct } from "./spikeRun";

describe("memoryStore", () => {
  it("keeps what it's given", async () => {
    const s = memoryStore();
    await s.put("k", { a: 1 });
    expect(await s.get("k")).toEqual({ a: 1 });
    expect(await s.get("other")).toBeNull();
  });
  it("reports the running spend as it grows, so a restart can't lose it", async () => {
    const seen: number[] = [];
    const s = memoryStore((usd) => { seen.push(usd); });
    await s.put("budget", { spent: 0.01 });
    await s.put("text/x", { spent: 99 });
    await s.put("budget", { spent: 0.02 });
    expect(seen).toEqual([0.01, 0.02]);
  });
  it("doesn't stop a search when the spend can't be saved", async () => {
    const s = memoryStore(async () => { throw new Error("database down"); });
    await expect(s.put("budget", { spent: 0.01 })).resolves.toBeUndefined();
  });
  it("is wired to what a run actually pays", async () => {
    const seen: number[] = [];
    const usage = { input_tokens: 1, output_tokens: 1 };
    const text = "word ".repeat(100);
    await runProduct({ id: "x", query: "bags", kind: "generic" }, {
      model: "m", budget: new Budget(1), store: memoryStore((usd) => { seen.push(usd); }), spend: () => 0.03,
      search: { serper: async () => [{ url: "https://a.example/", title: "T", snippet: "s", rank: 1 }] } as never,
      fetchPage: async (url) => ({ status: "ok", finalUrl: url, html: `<body>${text}</body>`, truncated: false }),
      fetchRobots: async () => null,
      extract: async () => ({ extraction: null, stop: "refusal", usage }),
      extractCountry: async () => { throw new Error("not used"); },
    });
    expect(seen).toEqual([0.03]);
  });
});
