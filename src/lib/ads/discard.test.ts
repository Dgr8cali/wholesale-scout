import { describe, expect, it } from "vitest";
import { launchNoteAsin, planDiscard, type DiscardInput } from "./discard";

const base: DiscardInput = { kind: "launch", label: "2026-10-02 #3", uploadedAt: null, revertedBy: null, undo: null, plan: null, noteAsin: null };

describe("discarding a batch that was never uploaded", () => {
  it("refuses a batch marked uploaded, or one with a revert sheet", () => {
    expect(planDiscard({ ...base, uploadedAt: "2026-10-03T09:00:00Z" }, "b")).toEqual({ ok: false, error: "2026-10-02 #3 is marked uploaded: if it really wasn't, click Undo on it first" });
    expect(planDiscard({ ...base, revertedBy: "2026-10-04 #1" }, "b")).toMatchObject({ ok: false, error: expect.stringMatching(/discard that first/) });
  });

  it("reopens a proposals batch's proposals", () => {
    expect(planDiscard({ ...base, kind: "proposals" }, "b")).toMatchObject({ ok: true, reopenProposals: true, plan: null, phase: null });
    expect(planDiscard({ ...base, kind: "revert" }, "b")).toMatchObject({ ok: true, reopenProposals: false, notes: [] });
  });

  it("puts a launch's plan and phase back to what they were", () => {
    const undo = { asin: "B0H9ZH3RV5", phase: "steady" as const, plan: { asin: "B0H9ZH3RV5", start_date: "2026-09-01" } };
    const r = planDiscard({ ...base, undo, plan: { asin: "B0H9ZH3RV5", batchId: "b" } }, "b");
    expect(r).toEqual({
      ok: true, reopenProposals: false,
      plan: { asin: "B0H9ZH3RV5", action: "restore", row: undo.plan },
      phase: { asin: "B0H9ZH3RV5", to: "steady" },
      notes: ["B0H9ZH3RV5's earlier launch plan is back", "B0H9ZH3RV5 is in its steady phase again"],
    });
  });

  it("an older launch with nothing recorded: plan deleted, out of the launch phase", () => {
    const asin = launchNoteAsin(["Launch of B0H9ZH3RV5 at £13.99, 3 campaigns", "No competitor ASINs"]);
    expect(asin).toBe("B0H9ZH3RV5");
    expect(planDiscard({ ...base, noteAsin: asin, plan: { asin: "B0H9ZH3RV5", batchId: "b" } }, "b")).toMatchObject({
      ok: true, plan: { action: "delete", row: null }, phase: { asin: "B0H9ZH3RV5", to: "steady" },
    });
  });

  it("leaves a later launch's plan and phase alone", () => {
    expect(planDiscard({ ...base, noteAsin: "B0H9ZH3RV5", plan: { asin: "B0H9ZH3RV5", batchId: "later" } }, "b")).toMatchObject({ ok: true, plan: null, phase: null });
  });
});
