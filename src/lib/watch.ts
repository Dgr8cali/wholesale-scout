import { money } from "./format";
/**
 * Watchlist flip conditions: what would turn a warn or near-miss into a buy, suggested from what
 * blocked it, and checked each week. Pure, for the page, the job and tests.
 */

export const CONDITION_KINDS = ["buyBox", "landed", "brandApproved", "sellers", "amazonGone", "backInStock"] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export interface WatchCondition {
  kind: ConditionKind;
  /** £ for buyBox / landed, a count for sellers. */
  value?: number | null;
}

export const CONDITION_LABELS: Record<ConditionKind, string> = {
  buyBox: "Buy Box ≥ £X",
  landed: "Landed ≤ £X",
  brandApproved: "Brand approved",
  sellers: "Sellers ≤ N",
  amazonGone: "Amazon gone 30+ days",
  backInStock: "Back in stock at supplier",
};
export const needsValue = (k: ConditionKind) => k === "buyBox" || k === "landed" || k === "sellers";


/** "Buy Box ≥ £24.50", or "Re-check weekly" with no condition. */
export function conditionLabel(c: WatchCondition | null | undefined): string {
  if (!c) return "Re-check weekly";
  switch (c.kind) {
    case "buyBox": return `Buy Box ≥ ${c.value != null ? money(c.value) : "£?"}`;
    case "landed": return `Landed ≤ ${c.value != null ? money(c.value) : "£?"}`;
    case "sellers": return `Sellers ≤ ${c.value ?? "?"}`;
    default: return CONDITION_LABELS[c.kind];
  }
}

/** The slice of a result a suggestion reads. */
export interface SuggestFrom {
  failed_gate: string | null;
  gate_outcomes: { gate: string; status: string; detail: string; tags?: string[] }[];
  hurdle_price: number | null;
  landed_cost: number | null;
  inputs: { maxLandedGbp?: number | null; market?: { fbaOffers?: number | null; offersNow?: number | null } | null; restriction?: { status: string } | null } | null;
  offer: { stock?: number | null; cost_known?: boolean } | null;
}

const up5 = (n: number) => Math.ceil(n * 20) / 20;
const down5 = (n: number) => Math.floor(n * 20) / 20;

/**
 * The condition that would unblock it, from the failing gate (or, for a warn, the gate that
 * warned): a fee miss wants a higher Buy Box (or, with no cost, a landed cost at or under the
 * max); approval wants the brand approved; too many sellers wants fewer; Amazon wants Amazon
 * gone; out of stock wants it back. Null means "re-check weekly".
 */
export function suggestCondition(r: SuggestFrom): WatchCondition | null {
  const noCost = r.offer?.cost_known === false || r.landed_cost == null;
  const maxLanded = r.inputs?.maxLandedGbp ?? null;
  const outcome = (g: string) => r.gate_outcomes.find((o) => o.gate === g);
  const byGate = (gate: string | null): WatchCondition | null => {
    switch (gate) {
      case "fees":
        if (!noCost && r.hurdle_price != null) return { kind: "buyBox", value: up5(Number(r.hurdle_price)) };
        return maxLanded != null ? { kind: "landed", value: down5(maxLanded) } : null;
      case "priceBand": {
        const floor = outcome("priceBand")?.detail.match(/under the £(\d+(?:\.\d+)?) floor/);
        return floor ? { kind: "buyBox", value: Number(floor[1]) } : null;
      }
      case "gating":
        return { kind: "brandApproved" };
      case "competition": {
        const over = outcome("competition")?.detail.match(/over (\d+)/);
        return over ? { kind: "sellers", value: Number(over[1]) } : null;
      }
      case "amazonPresence":
        return { kind: "amazonGone" };
      default:
        return null;
    }
  };
  const failed = byGate(r.failed_gate);
  if (failed) return failed;
  if (r.offer?.stock === 0) return { kind: "backInStock" };
  if (!r.failed_gate) {
    // A warn: approval is the usual thing between it and a pass.
    if (outcome("gating")?.status === "warn" && r.inputs?.restriction?.status === "approval_required") return { kind: "brandApproved" };
    if (noCost && maxLanded != null) return { kind: "landed", value: down5(maxLanded) };
  }
  return null;
}

/** What a re-check found, for testing a condition. */
export interface WatchFacts {
  verdict: "pass" | "warn" | "fail" | null;
  buyBox: number | null;
  /** The most it can cost landed and clear the floors, at today's price. */
  maxLanded: number | null;
  /** The best offer's landed cost, when there is one with a cost. */
  landed: number | null;
  sellers: number | null;
  hasHistory: boolean;
  amazonNow: boolean;
  amazonLastSeenDays: number | null;
  brandApproved: boolean;
  gatingOpen: boolean;
  stock: number | null;
}

/** Whether the condition holds, and a line saying what was seen. */
export function conditionMet(c: WatchCondition | null | undefined, f: WatchFacts): { met: boolean; detail: string } {
  if (!c) return { met: false, detail: `re-checked: ${f.verdict ?? "not screened"}` };
  switch (c.kind) {
    case "buyBox":
      return f.buyBox == null ? { met: false, detail: "no Buy Box" }
        : { met: c.value != null && f.buyBox >= c.value, detail: `Buy Box ${money(f.buyBox)}` };
    case "landed":
      return f.landed == null ? { met: false, detail: "no costed offer yet" }
        : { met: c.value != null && f.landed <= c.value, detail: `landed ${money(f.landed)}` };
    case "sellers":
      return f.sellers == null ? { met: false, detail: "no seller count" }
        : { met: c.value != null && f.sellers <= c.value, detail: `${f.sellers} sellers` };
    case "brandApproved":
      return { met: f.brandApproved || f.gatingOpen, detail: f.brandApproved ? "brand approved" : f.gatingOpen ? "open to list" : "still needs approval" };
    case "amazonGone": {
      if (f.amazonNow) return { met: false, detail: "Amazon selling now" };
      if (!f.hasHistory) return { met: false, detail: "needs Keepa history" };
      const gone = f.amazonLastSeenDays == null || f.amazonLastSeenDays >= 30;
      return { met: gone, detail: f.amazonLastSeenDays == null ? "Amazon not seen in the history" : `Amazon last seen ${f.amazonLastSeenDays} days ago` };
    }
    case "backInStock":
      return { met: (f.stock ?? 0) > 0, detail: f.stock == null ? "stock unknown" : `${f.stock} in stock` };
  }
}
