/**
 * The product page's judgement: Buy / Wait / Skip with reasons, and how far to trust the
 * figures (high / medium / low) from how much data there is, how fresh it is and whether the
 * sources agree. Pure: shared by the page and its tests.
 */

export type Decision = "buy" | "wait" | "skip";
export type Confidence = "high" | "medium" | "low";

/** What the judgement reads from a product's latest result and its data. */
export interface JudgeInput {
  verdict: "pass" | "warn" | "fail" | null;
  failedGate: { label: string; detail: string } | null;
  /** Gates that warned (label: detail). */
  warns: { label: string; detail: string }[];
  /** Gating: open, approval needed or blocked; approved when you've recorded the brand's approval. */
  gating: "open" | "approval_required" | "blocked" | "approved" | null;
  /** A supplier cost is known for the latest result. */
  costKnown: boolean;
  /** When the latest result was screened. */
  checkedAt: string | null;
  market: {
    hasHistory: boolean;
    historyDays?: number | null;
    rankDrops30d?: number | null;
    keepaRankDrops30?: number | null;
    monthlySold?: number | null;
    offersNow?: number | null;
    offers90dAgo?: number | null;
    lastOfferDaysAgo?: number | null;
  } | null;
  /** When the newest Keepa history was fetched. */
  keepaAt: string | null;
  /** Referral + FBA from Amazon's estimate and from the rate card, when both are known. */
  fees: { amazon: number | null; rateCard: number | null } | null;
  dormant: boolean;
}

export interface Judgement {
  decision: Decision;
  reasons: string[];
  confidence: Confidence;
  /** Why confidence isn't high (empty when it is). */
  doubts: string[];
}

const DAY = 86_400_000;
const days = (iso: string | null, now: number) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);
const rank: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

/** How far to trust the figures, and why not further. */
export function confidenceOf(x: JudgeInput, now = Date.now()): { confidence: Confidence; doubts: string[] } {
  let level: Confidence = "high";
  const doubts: string[] = [];
  const lower = (to: Confidence, why: string) => {
    doubts.push(why);
    if (rank[to] < rank[level]) level = to;
  };
  const m = x.market;
  if (!m?.hasHistory) lower("low", "no Keepa sales history: sales and price are today's snapshot only");
  else {
    const h = m.historyDays ?? null;
    if (h != null && h < 90) lower("low", `only ${h} days of history`);
    else if (h != null && h < 180) lower("medium", `${h} days of history (under 6 months)`);
    // The three sales signals should roughly agree.
    const signals = [m.rankDrops30d, m.keepaRankDrops30, m.monthlySold].filter((v): v is number => v != null && v > 0);
    if (signals.length >= 2) {
      const hi = Math.max(...signals), lo = Math.min(...signals);
      if (hi / lo > 3) lower("low", `sales signals disagree (${lo} to ${hi} a month)`);
      else if (hi / lo > 1.8) lower("medium", `sales signals differ (${lo} to ${hi} a month)`);
    }
    if (m.offersNow != null && m.offers90dAgo != null && Math.max(m.offersNow, m.offers90dAgo) >= 3) {
      const a = m.offersNow, b = m.offers90dAgo;
      if (Math.abs(a - b) / Math.max(a, b) > 0.5) lower("medium", `seller count moved from ${b} to ${a} in 90 days`);
    }
  }
  if (x.dormant) lower("low", "dormant listing: nobody is selling it now");
  const kAge = days(x.keepaAt, now);
  if (kAge != null && kAge > 30) lower("low", `Keepa data is ${kAge} days old`);
  else if (kAge != null && kAge > 7) lower("medium", `Keepa data is ${kAge} days old`);
  const cAge = days(x.checkedAt, now);
  if (cAge != null && cAge > 14) lower("medium", `screened ${cAge} days ago`);
  if (x.fees?.amazon != null && x.fees.rateCard != null && x.fees.rateCard > 0) {
    const diff = Math.abs(x.fees.amazon - x.fees.rateCard) / x.fees.rateCard;
    if (diff > 0.15) lower("medium", `Amazon's fee estimate and the rate card differ by ${Math.round(diff * 100)}%`);
  }
  return { confidence: level, doubts };
}

/** Buy, Wait or Skip, with the reasons in plain words. */
export function judge(x: JudgeInput, now = Date.now()): Judgement {
  const { confidence, doubts } = confidenceOf(x, now);
  if (!x.verdict) return { decision: "wait", reasons: ["Not screened to the end yet: check it or wait for its run."], confidence, doubts };
  if (x.verdict === "fail") {
    return { decision: "skip", reasons: [x.failedGate ? `Fails ${x.failedGate.label}: ${x.failedGate.detail}` : "Fails a gate."], confidence, doubts };
  }
  const reasons: string[] = [];
  if (x.gating === "approval_required") reasons.push("Needs brand or category approval before you can list it.");
  if (x.gating === "blocked") reasons.push("Amazon blocks you from listing it.");
  if (!x.costKnown) reasons.push("No supplier price yet: find one (the most it can cost landed is below).");
  for (const w of x.warns.filter((w) => w.label !== "Gating and blocks")) reasons.push(`${w.label}: ${w.detail}`);
  if (confidence === "low") reasons.push("The data is too thin to rely on (see confidence).");
  if (!reasons.length) return { decision: "buy", reasons: ["Passes every gate with a known cost, and you can list it."], confidence, doubts };
  return { decision: "wait", reasons, confidence, doubts };
}
