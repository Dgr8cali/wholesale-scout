/**
 * Discarding a batch that was never uploaded to Amazon: nothing changed in the account, so nothing
 * needs Amazon data. It undoes only what writing the batch did here: its proposals go back to open
 * (to be refreshed with the latest numbers, or dropped when their rule no longer fires), and a
 * launch's plan and launch phase go back to what they were before it.
 */

/** What a launch batch replaced when it was written, kept on the batch for a discard. */
export interface LaunchUndo {
  asin: string;
  /** The product's phase before the launch; null when it had no Ads product row. */
  phase: "launch" | "steady" | null;
  /** The launch plan it overwrote (one per ASIN), if any. */
  plan: Record<string, unknown> | null;
}

export interface DiscardInput {
  kind: "proposals" | "revert" | "restore" | "launch";
  label: string;
  uploadedAt: string | null;
  /** The label of a batch that reverts this one, if any. */
  revertedBy: string | null;
  undo: LaunchUndo | null;
  /** The launch plan for the launch's ASIN now: its ASIN and the batch it came from. */
  plan: { asin: string; batchId: string | null } | null;
  /** For a launch written before the undo was kept: the ASIN from its notes ("Launch of B0… at …"). */
  noteAsin: string | null;
}

export type DiscardPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      /** The batch's proposals back to open. */
      reopenProposals: boolean;
      /** The launch plan: deleted, put back to the one the launch overwrote, or left (it's another launch's). */
      plan: { asin: string; action: "delete" | "restore"; row: Record<string, unknown> | null } | null;
      phase: { asin: string; to: "launch" | "steady" } | null;
      notes: string[];
    };

export function planDiscard(b: DiscardInput, batchId: string): DiscardPlan {
  if (b.uploadedAt) return { ok: false, error: `${b.label} is marked uploaded: if it really wasn't, click Undo on it first` };
  if (b.revertedBy) return { ok: false, error: `${b.label} has a revert sheet (${b.revertedBy}): discard that first` };
  const notes: string[] = [];
  if (b.kind !== "launch") {
    if (b.kind === "proposals") notes.push("Its proposals are open again, refreshed with the latest numbers (or dropped when their rule no longer fires)");
    return { ok: true, reopenProposals: b.kind === "proposals", plan: null, phase: null, notes };
  }
  const asin = b.undo?.asin ?? b.noteAsin;
  if (!asin) return { ok: true, reopenProposals: false, plan: null, phase: null, notes: ["The launch's product couldn't be found: check its phase on Ads → Dashboard"] };
  // A later launch of the same ASIN owns the plan and the phase now: leave both.
  if (b.plan && b.plan.batchId !== batchId) {
    return { ok: true, reopenProposals: false, plan: null, phase: null, notes: [`${asin}'s launch plan and phase belong to a later launch, so they're left as they are`] };
  }
  const plan = b.plan ? { asin, action: b.undo?.plan ? "restore" as const : "delete" as const, row: b.undo?.plan ?? null } : null;
  if (plan) notes.push(plan.action === "restore" ? `${asin}'s earlier launch plan is back` : `${asin}'s launch plan is deleted`);
  // The phase it had; with none recorded (no product row before, or a launch written before this
  // was kept), steady: the launch it was put into never ran.
  const to = b.undo?.phase ?? "steady";
  notes.push(`${asin} is in its ${to} phase${b.undo?.phase ? " again" : ""}`);
  return { ok: true, reopenProposals: false, plan, phase: { asin, to }, notes };
}

/** The ASIN from a launch batch's first note ("Launch of B0H9ZH3RV5 at £13.99, 3 campaigns"). */
export const launchNoteAsin = (notes: string[]) => /^Launch of ([A-Z0-9]{10})\b/.exec(notes[0] ?? "")?.[1] ?? null;
