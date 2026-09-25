import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { stalledRuns } from "./watchdog";

describe("watchdog: restart dead processing chains", () => {
  let fake: FakeDb;
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake as never);
    fake.tables.runs = [
      { id: "dead", status: "processing", lease_until: ago(4), last_progress_at: ago(5), started_at: ago(60), stats: {} },
      { id: "working", status: "processing", lease_until: later(0.5), last_progress_at: ago(10), started_at: ago(60), stats: {} },
      { id: "recent", status: "processing", lease_until: null, last_progress_at: ago(1), started_at: ago(60), stats: {} },
      { id: "paused", status: "processing", lease_until: null, last_progress_at: ago(30), started_at: ago(60), paused_at: ago(30), stats: {} },
      { id: "done", status: "done", lease_until: null, last_progress_at: ago(30), started_at: ago(60), stats: {} },
      { id: "rescreen", status: "processing", lease_until: null, last_progress_at: ago(10), started_at: ago(60), stats: { rescreen: { startedAt: ago(12), finishedAt: null } } },
      { id: "nothing-left", status: "processing", lease_until: null, last_progress_at: ago(10), started_at: ago(60), stats: {} },
    ];
    fake.tables.results = ["dead", "working", "recent", "paused", "rescreen"].map((run_id) => ({ id: `r-${run_id}`, run_id, status: "pending" }));
  });

  it("restarts only runs with work left, no worker holding them, and nothing moving for 3 minutes", async () => {
    expect(await stalledRuns()).toEqual([{ runId: "dead", path: "process" }, { runId: "rescreen", path: "rescreen" }]);
  });

  it("leaves a run alone when all it has left is Keepa work and it isn't its turn", async () => {
    fake.tables.runs = [
      { id: "first", status: "processing", lease_until: null, last_progress_at: ago(10), started_at: ago(90), stats: {} },
      { id: "second", status: "processing", lease_until: null, last_progress_at: ago(10), started_at: ago(60), stats: {} },
    ];
    fake.tables.results = [
      { id: "a", run_id: "first", status: "pending", inputs: { stage: "priced" } },
      { id: "b", run_id: "second", status: "pending", inputs: { stage: "priced" } },
    ];
    expect(await stalledRuns()).toEqual([{ runId: "first", path: "process" }]);
    // "Go first" on the second: now it's the one restarted.
    fake.tables.runs[1].keepa_first_at = ago(1);
    expect(await stalledRuns()).toEqual([{ runId: "second", path: "process" }]);
  });
});
