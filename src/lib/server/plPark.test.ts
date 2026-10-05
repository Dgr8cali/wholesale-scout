/** Parking a candidate: shelved with a reason, not deleted; unpark puts it back. */
import { beforeEach, describe, expect, it } from "vitest";
import { __setDbForTests } from "./db";
import { FakeDb } from "./fakeDb";
import { createCandidate, updateCandidate } from "./pl";

describe("parking a candidate", () => {
  let fake: FakeDb;
  beforeEach(() => {
    fake = new FakeDb();
    __setDbForTests(fake);
  });
  const row = (id: string) => fake.tables.pl_candidates.find((c) => c.id === id)!;

  it("needs a reason, remembers where it was, and unparks back there", async () => {
    const c = await createCandidate({ name: "Tackle box", asins: ["B0ROD00001"] });
    await updateCandidate(c.id, { status: "samples" });
    await expect(updateCandidate(c.id, { status: "parked" })).rejects.toThrow("Give a reason to park it");
    await expect(updateCandidate(c.id, { status: "parked", park_reason: "   " })).rejects.toThrow("reason");
    await updateCandidate(c.id, { status: "parked", park_reason: "Supplier MOQ too high for now" });
    expect(row(c.id)).toMatchObject({ status: "parked", park_reason: "Supplier MOQ too high for now", parked_from: "samples" });
    expect(row(c.id).parked_at).toBeTruthy();
    await updateCandidate(c.id, { park_reason: "Waiting for Q1 prices" });
    expect(row(c.id)).toMatchObject({ status: "parked", park_reason: "Waiting for Q1 prices", parked_from: "samples" });
    await updateCandidate(c.id, { notes: "Two suppliers quoted" });
    expect(row(c.id)).toMatchObject({ status: "parked", notes: "Two suppliers quoted" });
    await updateCandidate(c.id, { unpark: true });
    expect(row(c.id)).toMatchObject({ status: "samples", park_reason: null, parked_at: null, parked_from: null, notes: "Two suppliers quoted" });
  });

  it("picking another status unparks too; a reason alone doesn't park", async () => {
    const c = await createCandidate({ name: "Hedgehog house", asins: [] });
    await updateCandidate(c.id, { park_reason: "ignored" });
    expect(row(c.id)).toMatchObject({ status: "draft" });
    expect(row(c.id).park_reason ?? null).toBeNull();
    await updateCandidate(c.id, { status: "parked", park_reason: "Seasonal: revisit in spring" });
    await updateCandidate(c.id, { status: "dropped" });
    expect(row(c.id)).toMatchObject({ status: "dropped", park_reason: null });
  });
});
