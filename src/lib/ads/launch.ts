/**
 * The campaign launcher: a product's four launch campaigns as one bulk Create sheet, and the
 * 60-day plan that goes with them. Pure.
 *
 *   Auto            close-match and substitutes on, loose-match and complements off   bid × 1.0   30% of budget
 *   Broad research  head terms, broad                                                bid × 0.8   20%
 *   Exact           head terms, exact                                                bid × 1.0   40%
 *   PT              competitor ASINs, product targeting                              bid × 0.9   10%
 */
import type { BulkChange } from "./bulk";

export interface LaunchInput {
  asin: string; sku: string; price: number;
  headTerms: string[]; competitorAsins: string[];
  /** All four campaigns together, a day. */
  dailyBudget: number;
  /** Fraction (0.3). */
  targetAcos: number; steadyTargetAcos: number | null;
  startingBid: number;
  /** yyyy-mm-dd. */
  startDate: string;
}

export interface LaunchCampaign { name: string; kind: "Auto" | "Broad" | "Exact" | "PT"; budget: number; bid: number; share: number; targets: string[] }
export interface PlanStep { from: string; to: string | null; title: string; detail: string }
export interface Launch { changes: BulkChange[]; campaigns: LaunchCampaign[]; plan: PlanStep[]; warnings: string[] }

export const LAUNCH_SPLIT = { Auto: 0.3, Broad: 0.2, Exact: 0.4, PT: 0.1 } as const;
export const LAUNCH_BID = { Auto: 1, Broad: 0.8, Exact: 1, PT: 0.9 } as const;
/** As Amazon's bulk export writes it. */
export const LAUNCH_STRATEGY = "Dynamic bids – down only";

const r2 = (v: number) => Math.round(Number((v * 100).toFixed(6))) / 100;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function buildLaunch(i: LaunchInput): Launch {
  const warnings: string[] = [];
  const terms = clean(i.headTerms);
  const asins = [...new Set(i.competitorAsins.map((a) => a.trim().toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a) && a !== i.asin))];
  if (!terms.length) warnings.push("No head terms: the Broad and Exact campaigns are left out");
  if (!asins.length) warnings.push("No competitor ASINs: the product-targeting campaign is left out");
  if (!i.sku.trim()) warnings.push("No SKU: the product ad rows need the SKU Amazon knows the product by");
  const kinds = (["Auto", "Broad", "Exact", "PT"] as const).filter((k) => (k === "Broad" || k === "Exact" ? terms.length > 0 : k === "PT" ? asins.length > 0 : true));
  // A campaign left out: its share goes to the others in proportion.
  const total = kinds.reduce((a, k) => a + LAUNCH_SPLIT[k], 0);
  const campaigns: LaunchCampaign[] = kinds.map((k) => ({
    name: `${i.asin} ${k} – ${i.startDate}`, kind: k,
    budget: Math.max(1, r2((i.dailyBudget * LAUNCH_SPLIT[k]) / total)), share: LAUNCH_SPLIT[k] / total,
    bid: Math.max(0.02, r2(i.startingBid * LAUNCH_BID[k])),
    targets: k === "PT" ? asins : k === "Auto" ? ["close-match", "substitutes"] : terms,
  }));
  if (campaigns.some((c) => c.budget === 1 && c.share * i.dailyBudget < 1)) warnings.push("A campaign's share is under Amazon's £1 a day minimum: raised to £1");
  const base = { kind: "create_campaign" as const, biddingStrategy: LAUNCH_STRATEGY, startDate: i.startDate, sku: i.sku.trim(), placements: [{ placement: "top", percentage: 0 }] };
  const changes: BulkChange[] = campaigns.map((c) => {
    const common = { ...base, name: c.name, dailyBudget: c.budget, adGroupName: `${c.kind} ad group`, defaultBid: c.bid };
    switch (c.kind) {
      case "Auto":
        return { ...common, targetingType: "Auto" as const, keywords: [], targets: [
          { expression: "close-match", bid: c.bid, state: "enabled" as const }, { expression: "substitutes", bid: c.bid, state: "enabled" as const },
          { expression: "loose-match", bid: c.bid, state: "paused" as const }, { expression: "complements", bid: c.bid, state: "paused" as const },
        ] };
      case "Broad": return { ...common, keywords: terms.map((t) => ({ text: t, matchType: "Broad" as const, bid: c.bid })) };
      case "Exact": return { ...common, keywords: terms.map((t) => ({ text: t, matchType: "Exact" as const, bid: c.bid })) };
      case "PT": return { ...common, keywords: [], targets: asins.map((a) => ({ expression: `asin="${a}"`, bid: c.bid, state: "enabled" as const })) };
    }
  });
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lowered = Math.max(0.05, i.targetAcos - 0.05);
  const plan: PlanStep[] = [
    { from: i.startDate, to: addDays(i.startDate, 13), title: "Weeks 1–2: harvest only", detail: `Let the campaigns gather data at ${pct(i.targetAcos)} target ACoS. Approve harvests and clear-cut negatives only; the rules hold back bid changes.` },
    { from: addDays(i.startDate, 14), to: addDays(i.startDate, 27), title: "Week 3: first bid-downs", detail: "Bid-down proposals start: keywords with 10+ clicks far over target come down." },
    { from: addDays(i.startDate, 28), to: addDays(i.startDate, 48), title: "Week 5: lower the target", detail: `Lower the launch target ACoS by 5 points, to ${pct(lowered)} (dashboard → the product's targets).` },
    { from: addDays(i.startDate, 49), to: addDays(i.startDate, 59), title: "Week 8: steady state", detail: `Switch the product's phase to steady${i.steadyTargetAcos != null ? ` (target ${pct(i.steadyTargetAcos)})` : ""}.` },
  ];
  return { changes, campaigns, plan, warnings };
}
