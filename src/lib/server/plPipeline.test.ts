/** The pipeline board on a database: where cards land, the move action, and moving forwards on new records. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { createCandidate, updateCandidate } from "./pl";
import { advanceStage, moveStage, pipelineBoard } from "./plPipeline";

describe("pipeline board (FakeDb)", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
  });
  afterEach(() => __setDbForTests(null));
  const row = (id: string) => fake.tables.pl_candidates.find((c) => c.id === id)!;
  const cardOf = async (id: string) => (await pipelineBoard()).cards.find((c) => c.id === id)!;

  it("a messaged supplier puts a candidate in Sourcing; a selling product without one shows in Live", async () => {
    const c = await createCandidate({ name: "Lens cleaning wipes", asins: ["B0LENS0001"] });
    expect((await cardOf(c.id)).stage).toBe("research");
    fake.tables.pl_supplier_leads = [{ id: "l1", candidate_id: c.id, status: "contacted", score: 88, flags: [], updated_at: "2026-10-05T23:42:56Z" }];
    fake.tables.ads_products = [{ asin: "B0HM8FBX3T", title: "Dog Seat Belt for Car, 2 Pack", phase: "launch", pl_candidate_id: null, updated_at: "2026-10-19T00:00:00Z" }];
    fake.tables.stock_items = [{ id: "s1", asin: "B0HM8FBX3T", name: "Dog Seat Belt 2 Pack", archived_at: null }];
    const { cards } = await pipelineBoard(new Date("2026-10-20T09:00:00Z"));
    const lens = cards.find((x) => x.id === c.id)!;
    expect(lens).toMatchObject({ stage: "sourcing", moved: false, next: { label: "Chase 1 supplier" } });
    expect(lens.gates).toHaveLength(8);
    expect(cards.find((x) => x.kind === "product")).toMatchObject({ stage: "live", asin: "B0HM8FBX3T", links: [{ label: "Ads", href: "/ads/dashboard?asin=B0HM8FBX3T" }, { label: "Stock", href: "/stock/levels?item=s1" }] });
  });

  it("moving stores the column and keeps the status in line; a backwards move sticks", async () => {
    const c = await createCandidate({ name: "Pill box", asins: ["B0PILL0001"] });
    await moveStage(c.id, "sourcing");
    expect(row(c.id)).toMatchObject({ pipeline_stage: "sourcing", status: "samples" });
    await moveStage(c.id, "live");
    expect(row(c.id)).toMatchObject({ pipeline_stage: "live", status: "launched" });
    const back = await moveStage(c.id, "validate");
    expect(row(c.id)).toMatchObject({ pipeline_stage: "validate", status: "researching" });
    expect(back).toMatchObject({ stage: "validate", moved: true, derived: "research" });
  });

  it("rejects an unknown column and a parked candidate", async () => {
    const c = await createCandidate({ name: "Snap mouse traps", asins: [] });
    await expect(moveStage(c.id, "shipping")).rejects.toThrow("Stage must be");
    await updateCandidate(c.id, { status: "parked", park_reason: "Paused" });
    await expect(moveStage(c.id, "sourcing")).rejects.toThrow("unpark it first");
    expect(row(c.id).pipeline_stage ?? null).toBeNull();
    expect((await cardOf(c.id)).parked).toBe(true);
  });

  it("a launch step moves a stored column forwards, never back", async () => {
    const c = await createCandidate({ name: "Seat belt", asins: [] });
    await moveStage(c.id, "sourcing");
    fake.tables.pl_launch_steps = [{ candidate_id: c.id, step: "shipped", done: true }];
    await advanceStage(c.id);
    expect(row(c.id).pipeline_stage).toBe("launch");
    await moveStage(c.id, "research");
    fake.tables.pl_launch_steps = [];
    fake.tables.pl_quotes = [{ id: "q1", candidate_id: c.id, supplier_name: "Ningbo", status: "requested", unit_price: 2.25, currency: "USD", moq: 1000 }];
    await advanceStage(c.id);
    // A quote proves Sourcing, which is past Research: forwards.
    expect(row(c.id).pipeline_stage).toBe("sourcing");
    await moveStage(c.id, "launch");
    await advanceStage(c.id);
    expect(row(c.id).pipeline_stage).toBe("launch");
  });
});
