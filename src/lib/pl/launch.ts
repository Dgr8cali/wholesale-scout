/**
 * A private-label launch, from samples to the first review: the checklist (each step done, dated,
 * with a note and what it cost), the candidate's status following it, the next step, and the
 * budget tracker against Gate 7's lines. Pure.
 */

export type BudgetLine = "stock" | "samples" | "inspection" | "photography" | "trademark" | "launchAds" | "other";

export interface LaunchStepDef { key: string; label: string; line: BudgetLine; hint?: string }

export const LAUNCH_STEPS: LaunchStepDef[] = [
  { key: "samples_ordered", label: "Samples ordered", line: "samples", hint: "From two suppliers if you can" },
  { key: "samples_received", label: "Samples received", line: "samples" },
  { key: "sample_chosen", label: "Sample chosen", line: "other", hint: "Against the complaint you mean to fix (Gate 4)" },
  { key: "trademark_filed", label: "Trademark filed", line: "trademark", hint: "UK IPO, £170 for one class" },
  { key: "po_placed", label: "PO placed", line: "stock", hint: "The deposit and the balance go here" },
  { key: "inspection_booked", label: "Pre-shipment inspection booked", line: "inspection" },
  { key: "inspection_passed", label: "Inspection passed", line: "inspection" },
  { key: "shipped", label: "Shipped", line: "stock", hint: "Freight, duty and import VAT" },
  { key: "at_fba", label: "At FBA", line: "other" },
  { key: "listing_live", label: "Listing live", line: "photography", hint: "Photography and the listing" },
  { key: "ads_launched", label: "Ads launched", line: "launchAds", hint: "Ads → Launch builds the campaigns" },
  { key: "first_review", label: "First review", line: "other" },
];
export const STEP_KEYS = LAUNCH_STEPS.map((s) => s.key);

export interface LaunchStep { step: string; done: boolean; done_on: string | null; note: string | null; spend: number | null }

export type PlStatus = "draft" | "researching" | "samples" | "parked" | "dropped" | "launched";
const ORDER: PlStatus[] = ["draft", "researching", "samples", "launched"];

/**
 * The status the checklist implies: listing live → launched; samples ordered → samples; anything
 * done → researching. It only moves forwards, and never off "dropped" or "parked".
 */
export function statusFromSteps(current: PlStatus, steps: LaunchStep[]): PlStatus {
  if (current === "dropped" || current === "parked") return current;
  const done = new Set(steps.filter((s) => s.done).map((s) => s.step));
  const implied: PlStatus = done.has("listing_live") ? "launched" : done.has("samples_ordered") ? "samples" : done.size ? "researching" : "draft";
  return ORDER.indexOf(implied) > ORDER.indexOf(current) ? implied : current;
}

/** The first step not done, in order. */
export function nextStep(steps: LaunchStep[]): LaunchStepDef | null {
  const done = new Set(steps.filter((s) => s.done).map((s) => s.step));
  return LAUNCH_STEPS.find((s) => !done.has(s.key)) ?? null;
}

export const LINE_LABEL: Record<BudgetLine, string> = {
  stock: "Stock (first order)", samples: "Samples", inspection: "Inspection", photography: "Photography", trademark: "Trademark", launchAds: "Launch ads", other: "Other",
};

export interface BudgetRow { line: BudgetLine | "buffer"; label: string; planned: number | null; actual: number }

/**
 * Gate 7's lines (stock = units × landed, samples, inspection, photography, trademark, launch ads,
 * the 10% buffer) against what the checklist says was spent on each.
 */
export function budgetTracker(plan: { stock: number | null; samples: number | null; inspection: number | null; photography: number | null; trademark: number | null; launchAds: number | null }, steps: LaunchStep[], budget: number) {
  const actual: Record<BudgetLine, number> = { stock: 0, samples: 0, inspection: 0, photography: 0, trademark: 0, launchAds: 0, other: 0 };
  for (const s of steps) {
    const def = LAUNCH_STEPS.find((d) => d.key === s.step);
    if (def && s.spend != null && Number.isFinite(s.spend)) actual[def.line] += s.spend;
  }
  const lines: BudgetLine[] = ["stock", "samples", "inspection", "photography", "trademark", "launchAds"];
  const rows: BudgetRow[] = lines.map((l) => ({ line: l, label: LINE_LABEL[l], planned: plan[l as keyof typeof plan], actual: actual[l] }));
  const plannedSub = rows.reduce((a, r) => a + (r.planned ?? 0), 0);
  rows.push({ line: "other", label: LINE_LABEL.other, planned: null, actual: actual.other });
  rows.push({ line: "buffer", label: "Buffer (10%)", planned: plannedSub * 0.1, actual: 0 });
  const plannedTotal = plannedSub * 1.1;
  const spent = Object.values(actual).reduce((a, b) => a + b, 0);
  return { rows, plannedTotal, spent, budget, spentRatio: budget > 0 ? spent / budget : 0, plannedRatio: budget > 0 ? plannedTotal / budget : 0 };
}
