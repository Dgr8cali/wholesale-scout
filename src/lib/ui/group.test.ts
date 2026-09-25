import { describe, expect, it } from "vitest";
import { compareBest, groupRows, type Rankable } from "./group";

type R = Rankable & { id: string; ean: string };
const r = (id: string, ean: string, verdict: R["verdict"], score: number | null, profit: number | null = null, status = "done"): R =>
  ({ id, ean, verdict, score, profit, status });

describe("best listing", () => {
  it("ranks screened over error, then verdict, score and profit", () => {
    const rows = [r("err", "1", null, null, null, "error"), r("fail", "1", "fail", null, 9), r("warn", "1", "warn", 90), r("pass-low", "1", "pass", 60), r("pass-high", "1", "pass", 80)];
    expect([...rows].sort(compareBest).map((x) => x.id)).toEqual(["pass-high", "pass-low", "warn", "fail", "err"]);
    expect(compareBest(r("a", "1", "fail", null, 5), r("b", "1", "fail", null, -1))).toBeLessThan(0);
  });
});

describe("grouping by EAN", () => {
  it("keeps one line per EAN with the best ASIN as the lead", () => {
    const rows = [r("a1", "A", "fail", null), r("b1", "B", "pass", 70), r("a2", "A", "warn", 65), r("a3", "A", "pass", 50)];
    const byScore = (x: R, y: R) => (y.score ?? -1) - (x.score ?? -1);
    const g = groupRows(rows, (x) => x.ean, byScore);
    expect(g.map((x) => x.key)).toEqual(["B", "A"]);
    expect(g[1].lead.id).toBe("a3");
    expect(g[1].others.map((x) => x.id)).toEqual(["a2", "a1"]);
    expect(g.length).toBe(2);
  });
});
