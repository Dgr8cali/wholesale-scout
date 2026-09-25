import { beforeEach, describe, expect, it } from "vitest";
import { ukDay } from "../keepaLedger";
import { dashboard } from "./dashboard";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";

describe("dashboard", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake as never);
  });

  it("counts each recent run's verdicts, estimates time left while running, and sums today's Keepa tokens", async () => {
    const today = ukDay();
    fake.tables.runs = [
      { id: "old", source: "a.xlsx", status: "done", started_at: "2026-09-20T10:00:00Z", row_count: 3, token_cost: 90, stats: { keepaByDay: { "2026-09-20": 90 } } },
      { id: "new", source: "b.xlsx", status: "processing", started_at: "2026-09-25T10:00:00Z", row_count: 5, token_cost: 12,
        stats: { amazonPerMin: 60, keepaByDay: { [today]: 12 } } },
    ];
    const res = (run_id: string, status: string, verdict: string | null) => ({ id: crypto.randomUUID(), run_id, status, verdict, inputs: {} });
    fake.tables.results = [
      res("old", "done", "pass"), res("old", "done", "fail"), res("old", "done", "fail"),
      res("new", "done", "warn"), res("new", "error", null), res("new", "pending", null), res("new", "pending", null), res("new", "done", "pass"),
    ];
    const d = await dashboard();
    expect(d.runs.map((r) => r.id)).toEqual(["new", "old"]);
    expect(d.runs[0].counts).toEqual({ pass: 1, warn: 1, fail: 0, error: 1, pending: 2 });
    expect(d.runs[0].eta?.minutes).toBeGreaterThan(0);
    expect(d.runs[1].counts).toEqual({ pass: 1, warn: 0, fail: 2, error: 0, pending: 0 });
    expect(d.runs[1].eta).toBeNull();
    expect(d.keepa).toEqual({ spentToday: 12, day: today });
  });
});
