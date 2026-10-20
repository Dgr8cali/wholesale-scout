import "server-only";
import { brandsToChase, type BrandSummary } from "../brandMap";
import { getKeepa } from "../keepa/client";
import { withAdsDefaults } from "../pl/adsDefaults";
import { LAUNCH_STEPS } from "../pl/launch";
import { evaluate } from "../pl/gatekeeper";
import { spApiConfigFromEnv } from "../spapi/client";
import { brandSummaries } from "./brandMap";
import { db, must, selectAll } from "./db";
import { favouritesWithLatest } from "./favourites";
import { memo } from "./memo";
import { listCandidates } from "./pl";
import { stockLevels } from "./stock";

/**
 * Today's "Next steps": rule-based (no AI) jobs worth doing now. gatherFacts() reads the data;
 * buildSteps() is pure (every rule is unit-tested on plain facts); todaySteps() ranks them and
 * drops what you snoozed or dismissed (today_step_state).
 *
 * Each step carries a fingerprint of the condition behind it: "Done" stores it, and a dismissed
 * step only comes back when the fingerprint changes (a new import, another proposal, a gate filled).
 */

export type Workspace = "System" | "Ads" | "Stock" | "Private label" | "Wholesale";

export interface NextStep {
  /** Stable per job: `ads:import`, `stock:reorder:<item>`, `pl:<candidate>`… */
  id: string;
  workspace: Workspace;
  title: string;
  /** One or two plain sentences with the real numbers. */
  why: string;
  minutes: number;
  /** 0 system (first), 1 high, 2 medium, 3 low. */
  priority: 0 | 1 | 2 | 3;
  /** When the condition started: older first within a priority. */
  since: string;
  cta: { label: string; href: string };
  help?: { label: string; href: string };
  fingerprint: string;
  /** Steps sharing a group are alternatives: only the first one not hidden is shown. */
  group?: string;
}

export interface Milestone { asin: string; product: string; key: string; date: string; title: string }

export interface TodayFacts {
  system: {
    /** The last nightly Qogita pull, null when none is recorded. */
    cron: { lastAt: string; error: string | null } | null;
    keepa: { available: boolean; tokensLeft: number | null; refillRate: number | null };
    spapi: { configured: boolean; lastSyncAt: string | null; error: string | null };
  };
  ads: {
    /** imported_at of the newest bulk file. */
    lastBulkImport: string | null;
    /** Products with campaigns that aren't archived (enabled: at least one enabled in the last import). */
    products: { asin: string; title: string | null; enabled: boolean }[];
    launches: { asin: string; title: string | null; startDate: string; plan: { from: string; title: string; detail: string }[] }[];
    proposals: { asin: string | null; title: string | null; rule: string; createdAt: string }[];
  };
  stock: {
    missingCosts: { purchaseId: string; name: string; asin: string; supplier: string | null; units: number; orderedOn: string; landed: number | null; unitCost: number | null }[];
    reorders: { itemId: string; name: string; status: "due" | "soon"; total: number; perDay: number; reorderPoint: number; suggestedQty: number; daysToReorder: number | null; leadTimeDays: number }[];
  };
  pl: {
    candidates: {
      id: string; name: string; status: "draft" | "researching" | "samples"; updatedAt: string;
      verdict: { cls: "pass" | "warn" | "fail" | "empty"; title: string };
      score: number; answered: number;
      gates: { n: string; title: string; status: "pass" | "warn" | "fail" | "empty" }[];
      /** Launch checklist: the first step not done (key), and how many are done. */
      nextLaunchStep: string | null; launchDone: number;
    }[];
    leads: { candidateId: string; candidate: string; toContact: number; best: number | null; awaiting: number; oldestContacted: string | null }[];
  };
  wholesale: {
    /** Brands you applied for (status applied), with the date you applied. */
    applied: { key: string; brand: string; since: string | null; held: number }[];
    /** The best brands to apply for (Home's "Brands to chase"), best first. */
    toChase: { key: string; brand: string; pass: number; warn: number; avgSellers: number | null }[];
    shortlist: { outdated: number; total: number; oldest: string | null };
  };
}

/** Keepa tokens under this: say so before a big run. */
export const KEEPA_LOW = 100;
/** A bulk file older than this needs refreshing. */
export const BULK_STALE_DAYS = 7;
/** The nightly pull runs at 03:00: older than this, it missed a night. */
const CRON_STALE_H = 36;
/** The Amazon sync runs daily. */
const SYNC_STALE_H = 48;
/** Messaged suppliers with no quote after this many days: chase them. */
const CHASE_DAYS = 7;

const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${dayOf(b)}T12:00:00Z`) - Date.parse(`${dayOf(a)}T12:00:00Z`)) / DAY);
/** "19 Oct". */
export const shortDate = (iso: string) => new Date(`${dayOf(iso)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const gbp = (n: number) => `£${n.toFixed(2)}`;
const ago = (from: string, today: string) => { const d = daysBetween(from, today); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

/** A product's name for a title: up to the first comma, bar or dash ("Dog Seat Belt for Car"). */
export function shortName(title: string | null | undefined, fallback: string): string {
  const t = (title ?? "").split(/\s[|–—-]\s|[,|(]/)[0].trim();
  if (!t) return fallback;
  return t.length > 48 ? `${t.slice(0, 45).trimEnd()}…` : t;
}

/** What each launch checklist step asks you to do next. */
const LAUNCH_ACTION: Record<string, string> = {
  samples_ordered: "Order samples", samples_received: "Chase the samples", sample_chosen: "Choose a sample",
  trademark_filed: "File the trademark", po_placed: "Place the PO", inspection_booked: "Book the pre-shipment inspection",
  inspection_passed: "Get the inspection passed", shipped: "Ship the order", at_fba: "Check the stock reached FBA",
  listing_written: "Write the listing", listing_live: "Put the listing live", ads_launched: "Launch the ads", first_review: "Get the first review",
};

const RULE_WORDS: Record<string, string> = {
  bid_down: "bid-down", bid_up: "bid-up", negative: "negative", harvest: "harvest", pause: "pause", placement: "placement change", budget: "budget change",
  revive: "revive", ngram_negative: "n-gram negative", ngram_winner: "n-gram winner", stock_guard: "stock guard", ranked: "rank keyword", slipping: "slipping keyword",
};

/**
 * An Ads launch's milestones, from its start date: the week-1 review, then the plan's own steps
 * (bid changes from day 14, the lower target from day 28, steady from day 49).
 */
export function milestones(l: TodayFacts["ads"]["launches"][number]): Milestone[] {
  const product = shortName(l.title, l.asin);
  const at = (i: number, d: number) => l.plan[i]?.from ?? addDays(l.startDate, d);
  return [
    { asin: l.asin, product, key: "week1", date: addDays(l.startDate, 7), title: `Week-1 review for ${product}` },
    { asin: l.asin, product, key: "bids", date: at(1, 14), title: `Bid changes start for ${product}` },
    { asin: l.asin, product, key: "target", date: at(2, 28), title: `Lower ${product}'s target ACoS` },
    { asin: l.asin, product, key: "steady", date: at(3, 49), title: `Switch ${product} to steady` },
  ];
}

const MILESTONE_WHY: Record<string, (l: TodayFacts["ads"]["launches"][number], m: Milestone) => string> = {
  week1: (l) => `The campaigns went live on ${shortDate(l.startDate)}. Check spend is pacing to budget, approve harvests and clear-cut negatives; bid changes stay held until ${shortDate(addDays(l.startDate, 14))}.`,
  bids: (l) => `Two weeks in (since ${shortDate(addDays(l.startDate, 14))}): ${l.plan[1]?.detail ?? "bid-down proposals start for keywords with 10+ clicks far over target."}`,
  target: (l) => `Four weeks in: ${l.plan[2]?.detail ?? "lower the launch target ACoS by 5 points."}`,
  steady: (l) => `Seven weeks in: ${l.plan[3]?.detail ?? "switch the product's phase to steady."}`,
};

/** Every step the facts call for, unranked and before snoozes and dismissals. */
export function buildSteps(f: TodayFacts, now: Date): NextStep[] {
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const out: NextStep[] = [];

  /* ---------- System: first ---------- */
  const cron = f.system.cron;
  if (!cron) {
    out.push({ id: "system:cron", workspace: "System", title: "Check the nightly cron", why: "No nightly Qogita pull has been recorded, so nothing is re-screened overnight.", minutes: 5, priority: 0, since: nowIso,
      cta: { label: "Open Qogita pulls", href: "/new-run?tab=qogita" }, fingerprint: "none" });
  } else if (cron.error) {
    out.push({ id: "system:cron", workspace: "System", title: "Fix the failed nightly pull", why: `The nightly Qogita pull on ${shortDate(cron.lastAt)} failed: ${cron.error}.`, minutes: 10, priority: 0, since: cron.lastAt,
      cta: { label: "Open Qogita pulls", href: "/new-run?tab=qogita" }, fingerprint: `error:${cron.lastAt}` });
  } else if (now.getTime() - Date.parse(cron.lastAt) > CRON_STALE_H * 3_600_000) {
    out.push({ id: "system:cron", workspace: "System", title: "The nightly cron missed a night", why: `The last nightly Qogita pull ran on ${shortDate(cron.lastAt)} (${ago(cron.lastAt, today)}); it should run every night at 03:00.`, minutes: 10, priority: 0, since: cron.lastAt,
      cta: { label: "Open Qogita pulls", href: "/new-run?tab=qogita" }, fingerprint: `stale:${cron.lastAt}` });
  }
  const k = f.system.keepa;
  if (k.available && k.tokensLeft != null && k.tokensLeft < KEEPA_LOW) {
    const wait = k.refillRate ? Math.ceil((KEEPA_LOW - k.tokensLeft) / k.refillRate) : null;
    out.push({ id: "system:keepa", workspace: "System", title: "Keepa tokens are low", minutes: 1, priority: 0, since: nowIso,
      why: `${plural(k.tokensLeft, "token")} left${k.refillRate ? `, refilling ${k.refillRate} a minute` : ""}.${wait ? ` Hold big runs for about ${plural(wait, "minute")}.` : ""}`,
      cta: { label: "See runs", href: "/runs" }, help: { label: "Show me how", href: "/help/concepts/keepa-tokens" },
      // Comes back the next day it's still low.
      fingerprint: `low:${today}` });
  }
  const sp = f.system.spapi;
  if (!sp.configured) {
    out.push({ id: "system:spapi", workspace: "System", title: "Reconnect SP-API", why: "The SP-API keys aren't set, so gating checks, fees and the Amazon sync are off.", minutes: 10, priority: 0, since: nowIso,
      cta: { label: "Open Settings", href: "/settings" }, help: { label: "Show me how", href: "/help/howto/add-an-env-var" }, fingerprint: "unset" });
  } else if (sp.error) {
    out.push({ id: "system:spapi", workspace: "System", title: "The Amazon sync failed", why: `The last SP-API sync${sp.lastSyncAt ? ` (${shortDate(sp.lastSyncAt)})` : ""} stopped with: ${sp.error}.`, minutes: 10, priority: 0, since: sp.lastSyncAt ?? nowIso,
      cta: { label: "Open Purchases", href: "/stock/purchases" }, fingerprint: `error:${sp.lastSyncAt}` });
  } else if (sp.lastSyncAt && now.getTime() - Date.parse(sp.lastSyncAt) > SYNC_STALE_H * 3_600_000) {
    out.push({ id: "system:spapi", workspace: "System", title: "The Amazon sync has stopped", why: `The SP-API sync last finished on ${shortDate(sp.lastSyncAt)} (${ago(sp.lastSyncAt, today)}); orders, FBA stock and fees are that old.`, minutes: 10, priority: 0, since: sp.lastSyncAt,
      cta: { label: "Open Purchases", href: "/stock/purchases" }, fingerprint: `stale:${sp.lastSyncAt}` });
  }

  /* ---------- Ads ---------- */
  const last = f.ads.lastBulkImport;
  const titleOf = (asin: string) => f.ads.products.find((p) => p.asin === asin)?.title ?? f.ads.launches.find((l) => l.asin === asin)?.title ?? null;
  const launchedSince = f.ads.launches.filter((l) => l.startDate <= today && (!last || l.startDate > dayOf(last)));
  const lastTxt = last ? `the last one is from ${shortDate(last)}, ${ago(last, today)}` : "none has been imported yet";
  if (launchedSince.length) {
    const first = launchedSince.sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const name = shortName(first.title, first.asin);
    out.push({
      // As old as the last import: everything Ads shows (proposals included) is that old.
      id: "ads:import", workspace: "Ads", title: `Import a fresh bulk file for ${name}`, minutes: 5, priority: 1, since: last ?? first.startDate,
      why: `Its campaigns started on ${shortDate(first.startDate)} and no bulk file has been imported since (${lastTxt}). Until then the dashboard and the rules can't see them.`,
      cta: { label: "Import bulk file", href: "/ads/dashboard?import=1" }, help: { label: "Show me how", href: "/help/howto/ads-importing-reports" },
      fingerprint: `${last ?? "none"}:${launchedSince.map((l) => l.asin).sort().join(",")}`,
    });
  } else if (f.ads.products.length && (!last || daysBetween(last, today) > BULK_STALE_DAYS)) {
    const live = f.ads.products.filter((p) => p.enabled);
    const p = live[0] ?? f.ads.products[0];
    const name = shortName(p.title, p.asin);
    out.push({
      id: "ads:import", workspace: "Ads", title: `Import a fresh bulk file for ${name}${live.length > 1 ? ` and ${plural(live.length - 1, "other")}` : ""}`, minutes: 5, priority: 1, since: last ?? nowIso,
      why: `The ads figures stop at the last bulk file: ${lastTxt}. A fresh one (last 30 days) brings spend, sales and the proposals up to date.`,
      cta: { label: "Import bulk file", href: "/ads/dashboard?import=1" }, help: { label: "Show me how", href: "/help/howto/ads-importing-reports" },
      fingerprint: `stale:${last ?? "none"}`,
    });
  }

  if (f.ads.proposals.length) {
    const ps = [...f.ads.proposals].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const n = ps.length;
    const kinds = new Map<string, number>();
    for (const p of ps) kinds.set(p.rule, (kinds.get(p.rule) ?? 0) + 1);
    const products = [...new Set(ps.map((p) => shortName(p.title ?? (p.asin ? titleOf(p.asin) : null), p.asin ?? "an unassigned campaign")))];
    const kindTxt = [...kinds].map(([r, c]) => plural(c, RULE_WORDS[r] ?? r.replace(/_/g, " "))).join(", ");
    out.push({
      id: "ads:proposals", workspace: "Ads", title: `Review ${plural(n, "proposal")}`, minutes: Math.min(30, 5 * Math.ceil(Math.max(5, n * 2) / 5)), priority: 1, since: ps[0].createdAt,
      why: `${kindTxt} for ${products.slice(0, 2).join(" and ")}${products.length > 2 ? ` and ${plural(products.length - 2, "more product")}` : ""}, waiting since ${shortDate(ps[0].createdAt)}.${last ? ` They're based on data up to the bulk file of ${shortDate(last)}.` : ""}`,
      cta: { label: "Review proposals", href: "/ads/proposals?tab=review" }, help: { label: "Show me how", href: "/help/howto/ads-rules-and-proposals" },
      fingerprint: `${n}:${ps[n - 1].createdAt}`,
    });
  }

  for (const l of f.ads.launches) {
    const ms = milestones(l);
    ms.forEach((m, i) => {
      const until = ms[i + 1]?.date ?? addDays(m.date, 14);
      if (today < m.date || today >= until) return;
      out.push({
        id: `ads:milestone:${l.asin}:${m.key}`, workspace: "Ads", title: m.title, minutes: m.key === "week1" ? 15 : 10, priority: 1, since: m.date,
        why: MILESTONE_WHY[m.key](l, m),
        cta: { label: "Open the dashboard", href: `/ads/dashboard?asin=${l.asin}` }, help: { label: "Show me how", href: "/help/ads-playbook" },
        fingerprint: m.date,
      });
    });
  }

  /* ---------- Stock ---------- */
  // One step for every open order missing a cost (oldest first), so they don't crowd the list.
  const costs = [...f.stock.missingCosts].sort((a, b) => a.orderedOn.localeCompare(b.orderedOn));
  if (costs.length) {
    const c = costs[0];
    const what = (x: typeof c) => (x.unitCost == null && x.landed! > 0 ? `a landed cost (${gbp(x.landed!)} a unit) but no supplier price` : x.unitCost == null ? "no supplier price and no landed cost" : "no landed cost");
    const names = [...new Set(costs.map((x) => shortName(x.name, x.asin)))];
    const allNoPrice = costs.every((x) => x.unitCost == null && x.landed! > 0);
    out.push({
      id: "stock:costs", workspace: "Stock", minutes: 2 * Math.min(5, costs.length) + (costs.length > 1 ? 1 : 0), priority: 2, since: c.orderedOn,
      title: names.length === 1 ? `Add costs for ${names[0]}` : `Add costs for ${names[0]} and ${plural(names.length - 1, "more product")}`,
      why: costs.length === 1
        ? `The order of ${plural(c.units, "unit")}${c.supplier ? ` from ${c.supplier}` : ""} on ${shortDate(c.orderedOn)} has ${what(c)}.`
        : `${costs.length} open orders have ${allNoPrice ? "a landed cost but no supplier price" : "a cost missing"}: ${costs.slice(0, 4).map((x) => `${shortName(x.name, x.asin)} (${shortDate(x.orderedOn)}${allNoPrice ? `, landed ${gbp(x.landed!)}` : ""})`).join(", ")}${costs.length > 4 ? ` and ${costs.length - 4} more` : ""}.`,
      cta: { label: "Open Purchases", href: "/stock/purchases" },
      fingerprint: costs.map((x) => x.purchaseId).sort().join(","),
    });
  }
  for (const r of f.stock.reorders) {
    const perDay = r.perDay >= 10 ? Math.round(r.perDay).toString() : r.perDay.toFixed(1);
    out.push({
      id: `stock:reorder:${r.itemId}`, workspace: "Stock", title: `Reorder ${shortName(r.name, "an item")}`, minutes: 10, priority: r.status === "due" ? 1 : 2, since: nowIso,
      why: r.status === "due"
        ? `${plural(r.total, "unit")} left, selling about ${perDay} a day: at or under the reorder point of ${Math.round(r.reorderPoint)}. Suggested order ${plural(r.suggestedQty, "unit")} (lead time ${r.leadTimeDays} days).`
        : `${plural(r.total, "unit")} left, selling about ${perDay} a day: the reorder point (${Math.round(r.reorderPoint)}) is about ${plural(Math.max(1, Math.round(r.daysToReorder ?? 0)), "day")} away. Suggested order ${plural(r.suggestedQty, "unit")} (lead time ${r.leadTimeDays} days).`,
      cta: { label: "Open Reorder", href: "/stock/reorder" }, help: { label: "Show me how", href: "/help/howto/stock-how-levels-work" },
      fingerprint: r.status,
    });
  }

  /* ---------- Private label ---------- */
  for (const c of f.pl.candidates) {
    const name = shortName(c.name, "a candidate");
    const href = `/pl/candidates/${c.id}`;
    const done = c.gates.filter((g) => g.status !== "empty").length;
    const base = { workspace: "Private label" as const, priority: 2 as const, since: c.updatedAt, help: { label: "Show me how", href: "/help/pages/private-label" } };
    if (c.status === "samples" || c.launchDone > 0) {
      if (!c.nextLaunchStep) continue;
      const action = LAUNCH_ACTION[c.nextLaunchStep] ?? c.nextLaunchStep.replace(/_/g, " ");
      out.push({ ...base, id: `pl:${c.id}`, title: `${action} for ${name}`, minutes: 15,
        why: `${plural(c.launchDone, "launch step")} of 13 done; this one is next on the checklist.`,
        cta: { label: "Open its launch", href: `${href}?tab=launch` }, help: { label: "Show me how", href: "/help/howto/pl-launch-checklist" }, fingerprint: `launch:${c.nextLaunchStep}` });
      continue;
    }
    const failed = c.gates.find((g) => g.status === "fail");
    const open = c.gates.find((g) => g.status === "empty");
    if (c.verdict.cls === "pass") {
      out.push({ ...base, id: `pl:${c.id}`, title: `Order samples for ${name}`, minutes: 20,
        why: `Scored ${c.score}/30 with every gate clear. Get three quotes and order samples from two suppliers.`,
        cta: { label: "Open suppliers & quotes", href: `${href}?tab=suppliers` }, help: { label: "Show me how", href: "/help/howto/pl-quotes-and-landed-cost" }, fingerprint: "pass" });
    } else if (failed) {
      out.push({ ...base, id: `pl:${c.id}`, title: `Fix or drop ${name}`, minutes: 15,
        why: `Gate ${failed.n} (${failed.title}) failed${c.answered >= 10 ? ` and it scores ${c.score}/30` : `, with ${c.answered} of 10 score lines in`}. A failed gate isn't overridden by the score.`,
        cta: { label: `Open Gate ${failed.n}`, href: `${href}?tab=gates&gate=${failed.n}` }, help: { label: "Show me how", href: "/help/howto/waive-a-gate" }, fingerprint: `fail:${failed.n}` });
    } else if (open) {
      out.push({ ...base, id: `pl:${c.id}`, title: `Finish Gate ${open.n} (${open.title}) for ${name}`, minutes: 20,
        why: `${done} of ${c.gates.length} gates have answers and ${c.answered} of 10 score lines are in; the verdict means something once all ten are.`,
        cta: { label: `Open Gate ${open.n}`, href: `${href}?tab=gates&gate=${open.n}` }, fingerprint: `open:${open.n}:${c.answered}` });
    } else {
      out.push({ ...base, id: `pl:${c.id}`, title: `Decide on ${name}`, minutes: 10,
        why: `Every gate has an answer and it scores ${c.score}/30: ${c.verdict.title.toLowerCase()}.`,
        cta: { label: "Open the candidate", href }, fingerprint: `decide:${c.verdict.cls}:${c.score}` });
    }
  }
  for (const l of f.pl.leads) {
    const name = shortName(l.candidate, "a candidate");
    if (l.toContact > 0) {
      out.push({
        id: `pl:suppliers:${l.candidateId}`, workspace: "Private label", title: `Message ${plural(l.toContact, "supplier")} for ${name}`, minutes: Math.min(30, 5 * Math.ceil((5 + l.toContact) / 5)), priority: 3, since: nowIso,
        why: `${plural(l.toContact, "Alibaba listing")} score 60 or more${l.best != null ? ` (best ${Math.round(l.best)})` : ""} and haven't been messaged yet.`,
        cta: { label: "Open suppliers", href: `/pl/candidates/${l.candidateId}?tab=suppliers` }, help: { label: "Show me how", href: "/help/howto/pl-finding-suppliers" },
        fingerprint: String(l.toContact),
      });
    }
    if (l.awaiting > 0 && l.oldestContacted && daysBetween(l.oldestContacted, today) >= CHASE_DAYS) {
      out.push({
        id: `pl:chase:${l.candidateId}`, workspace: "Private label", title: `Chase ${plural(l.awaiting, "supplier")} for ${name}`, minutes: 5, priority: 3, since: l.oldestContacted,
        why: `Messaged ${l.awaiting === 1 ? "on" : "from"} ${shortDate(l.oldestContacted)} (${ago(l.oldestContacted, today)}) with no quote back yet.`,
        cta: { label: "Open suppliers", href: `/pl/candidates/${l.candidateId}?tab=suppliers` },
        fingerprint: `${l.awaiting}:${l.oldestContacted}`,
      });
    }
  }

  /* ---------- Wholesale ---------- */
  for (const b of f.wholesale.applied) {
    if (b.since && daysBetween(b.since, today) < CHASE_DAYS) continue;
    out.push({
      id: `wholesale:approval:${b.key}`, workspace: "Wholesale", title: `Chase your ${b.brand} approval`, minutes: 5, priority: 3, since: b.since ?? nowIso,
      why: `You applied${b.since ? ` on ${shortDate(b.since)} (${ago(b.since, today)})` : ""} and it's still pending${b.held ? `; ${plural(b.held, "Buy or Check product")} wait on it` : ""}.`,
      cta: { label: "Open the brand", href: `/brands/${encodeURIComponent(b.key)}` }, help: { label: "Show me how", href: "/help/howto/apply-for-brand-approval" },
      fingerprint: b.since ?? "applied",
    });
  }
  for (const b of f.wholesale.toChase) {
    // Only brands with a product worth buying now.
    if (b.pass < 1) continue;
    out.push({
      id: `wholesale:apply:${b.key}`, workspace: "Wholesale", title: `Apply to sell ${b.brand}`, minutes: 10, priority: 3, since: nowIso, group: "wholesale:apply",
      why: `${plural(b.pass, "Buy product")} and ${plural(b.warn, "Check product")} are held back by brand gating${b.avgSellers != null ? `, with ${b.avgSellers} FBA sellers on average` : ""}.`,
      cta: { label: "Open the brand", href: `/brands/${encodeURIComponent(b.key)}` }, help: { label: "Show me how", href: "/help/howto/apply-for-brand-approval" },
      fingerprint: `${b.pass}:${b.warn}`,
    });
  }
  const s = f.wholesale.shortlist;
  if (s.outdated > 0) {
    out.push({
      id: "wholesale:shortlist", workspace: "Wholesale", title: `Re-screen ${plural(s.outdated, "shortlisted product")}`, minutes: 2, priority: 3, since: s.oldest ?? nowIso,
      why: `${s.outdated} of ${s.total} were last screened over a week ago${s.oldest ? ` (the oldest on ${shortDate(s.oldest)})` : ""}; prices and sellers move.`,
      cta: { label: "Open Shortlist", href: "/shortlist?tab=products" },
      fingerprint: String(s.outdated),
    });
  }
  return out;
}

export interface StepState { step_id: string; fingerprint: string | null; snoozed_until: string | null; dismissed_at: string | null }

/** Hidden: snoozed until later, or dismissed while its condition hasn't changed. */
export function isHidden(s: NextStep, state: StepState | undefined, now: Date): boolean {
  if (!state) return false;
  if (state.snoozed_until && Date.parse(state.snoozed_until) > now.getTime()) return true;
  return !!state.dismissed_at && state.fingerprint === s.fingerprint;
}

/** Ranked by priority, then age (oldest first); hidden steps out; one step per group. */
export function rankSteps(steps: NextStep[], states: StepState[], now: Date): NextStep[] {
  const byId = new Map(states.map((s) => [s.step_id, s]));
  const seen = new Set<string>();
  return steps
    .filter((s) => !isHidden(s, byId.get(s.id), now))
    // Stable: equal steps keep the rules' order (brands best first).
    .sort((a, b) => a.priority - b.priority || a.since.localeCompare(b.since))
    .filter((s) => { if (!s.group) return true; if (seen.has(s.group)) return false; seen.add(s.group); return true; });
}

/** The next dated thing coming up (for "You're all caught up"). */
export function nextScheduled(f: TodayFacts, now: Date): { date: string; title: string } | null {
  const today = now.toISOString().slice(0, 10);
  const future = f.ads.launches.flatMap(milestones).filter((m) => m.date > today).sort((a, b) => a.date.localeCompare(b.date));
  return future[0] ? { date: future[0].date, title: future[0].title } : null;
}

/* ===================== reading the data ===================== */

/** A part that can't be read leaves its rules out, not the page. */
const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

type CampaignRow = { asin: string | null; state: string | null; archived: boolean };

async function adsFacts(): Promise<TodayFacts["ads"]> {
  const d = db();
  const [bulk, camps, prods, plans, props] = await Promise.all([
    d.from("ads_imports").select("imported_at").eq("report_type", "bulk").order("imported_at", { ascending: false }).limit(1),
    d.from("ads_campaigns").select("asin, state, archived"),
    d.from("ads_products").select("asin, title"),
    d.from("ads_launch_plans").select("asin, start_date, plan"),
    d.from("ads_proposals").select("asin, rule, created_at").eq("status", "open"),
  ]);
  const titles = new Map((must(prods, "ads products") as { asin: string; title: string | null }[]).map((p) => [p.asin, p.title]));
  const byAsin = new Map<string, boolean>();
  for (const c of must(camps, "campaigns") as CampaignRow[]) {
    if (c.archived || !c.asin) continue;
    byAsin.set(c.asin, (byAsin.get(c.asin) ?? false) || c.state === "enabled");
  }
  return {
    lastBulkImport: (must(bulk, "imports") as { imported_at: string }[])[0]?.imported_at ?? null,
    products: [...byAsin].map(([asin, enabled]) => ({ asin, title: titles.get(asin) ?? null, enabled })),
    launches: (must(plans, "launch plans") as { asin: string; start_date: string; plan: { from: string; title: string; detail: string }[] }[])
      .map((l) => ({ asin: l.asin, title: titles.get(l.asin) ?? null, startDate: l.start_date, plan: l.plan ?? [] })),
    proposals: (must(props, "proposals") as { asin: string | null; rule: string; created_at: string }[])
      .map((p) => ({ asin: p.asin, title: p.asin ? titles.get(p.asin) ?? null : null, rule: p.rule, createdAt: p.created_at })),
  };
}

async function stockFacts(): Promise<TodayFacts["stock"]> {
  const [{ items }, purchases] = await Promise.all([
    stockLevels(),
    db().from("purchases").select("id, asin, supplier_name, units, unit_cost_gbp, landed_gbp, status, ordered_on, stock_item_id").in("status", ["ordered", "received", "sent", "live"]),
  ]);
  const names = new Map(items.map((i) => [i.item.id, i.item.name]));
  const byAsin = new Map(items.filter((i) => i.item.asin).map((i) => [i.item.asin!, i.item.name]));
  type P = { id: string; asin: string; supplier_name: string | null; units: number; unit_cost_gbp: number | null; landed_gbp: number | null; ordered_on: string; stock_item_id: string | null };
  const missingCosts = (must(purchases, "purchases") as P[])
    .filter((p) => p.unit_cost_gbp == null || !(Number(p.landed_gbp) > 0))
    .map((p) => ({
      purchaseId: p.id, asin: p.asin, name: (p.stock_item_id && names.get(p.stock_item_id)) || byAsin.get(p.asin) || p.asin,
      supplier: p.supplier_name, units: p.units, orderedOn: p.ordered_on,
      landed: p.landed_gbp == null ? null : Number(p.landed_gbp), unitCost: p.unit_cost_gbp == null ? null : Number(p.unit_cost_gbp),
    }));
  const reorders = items
    .filter((i) => i.item.status === "active" && (i.reorder.status === "due" || i.reorder.status === "soon"))
    .map((i) => ({
      itemId: i.item.id, name: i.item.name, status: i.reorder.status as "due" | "soon", total: i.total, perDay: i.reorder.perDay,
      reorderPoint: i.reorder.reorderPoint, suggestedQty: i.reorder.suggestedQty, daysToReorder: i.reorder.daysToReorder, leadTimeDays: i.reorder.leadTimeDays,
    }));
  return { missingCosts, reorders };
}

async function plFacts(): Promise<TodayFacts["pl"]> {
  const { candidates, settings, card, adsCpc } = await listCandidates();
  const steps = must(await db().from("pl_launch_steps").select("candidate_id, step, done"), "launch steps") as { candidate_id: string; step: string; done: boolean }[];
  const active = candidates.filter((c) => c.status === "draft" || c.status === "researching" || c.status === "samples");
  const out: TodayFacts["pl"]["candidates"] = active.map((c) => {
    const fields = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.value]));
    const e = evaluate(withAdsDefaults(fields, adsCpc), c.category, settings, card, new Date(), c.waivers);
    const done = new Set(steps.filter((x) => x.candidate_id === c.id && x.done).map((x) => x.step));
    return {
      id: c.id, name: c.name, status: c.status as "draft" | "researching" | "samples", updatedAt: c.updated_at,
      verdict: { cls: e.v.cls, title: e.v.title }, score: e.sc.total, answered: e.sc.answered,
      gates: e.gates.map((g) => ({ n: g.g.n, title: g.g.title, status: g.status })),
      nextLaunchStep: LAUNCH_STEPS.find((x) => !done.has(x.key))?.key ?? null, launchDone: done.size,
    };
  });
  const names = new Map(active.map((c) => [c.id, c.name]));
  const leads = await selectAll<{ candidate_id: string; score: number | null; status: string; flags: string[]; updated_at: string }>(
    "pl_supplier_leads", "candidate_id, score, status, flags, updated_at", ["id"], (q) => q.in("status", ["new", "contacted"]));
  const per = new Map<string, TodayFacts["pl"]["leads"][number]>();
  for (const l of leads) {
    const name = names.get(l.candidate_id);
    if (!name) continue;
    const x = per.get(l.candidate_id) ?? { candidateId: l.candidate_id, candidate: name, toContact: 0, best: null, awaiting: 0, oldestContacted: null };
    const score = l.score == null ? null : Number(l.score);
    if (l.status === "new" && (score ?? 0) >= 60 && !(l.flags ?? []).includes("OFF_PRODUCT")) { x.toContact++; x.best = Math.max(x.best ?? 0, score ?? 0); }
    if (l.status === "contacted") { x.awaiting++; if (!x.oldestContacted || l.updated_at < x.oldestContacted) x.oldestContacted = l.updated_at; }
    per.set(l.candidate_id, x);
  }
  return { candidates: out, leads: [...per.values()] };
}

async function wholesaleFacts(): Promise<{ facts: TodayFacts["wholesale"]; awaiting: number }> {
  // The same cached map as the Brands page and the old Home tile.
  const [brands, favs] = await Promise.all([safe(memo("brands:all", 60_000, brandSummaries), [] as BrandSummary[]), safe(favouritesWithLatest(), [])]);
  const applied = brands.filter((b) => b.approval?.status === "applied")
    .map((b) => ({ key: b.key, brand: b.brand, since: b.approval?.status_date ?? null, held: b.pass + b.warn }));
  const toChase = brandsToChase(brands, 5).filter((b) => b.approval?.status !== "applied")
    .map((b) => ({ key: b.key, brand: b.brand, pass: b.pass, warn: b.warn, avgSellers: b.avgSellers }));
  const old = favs.filter((f) => f.outdated);
  const dates = old.map((f) => (f.latest ? String((f.latest as { updated_at?: string }).updated_at ?? "") : "")).filter(Boolean).sort();
  return {
    facts: { applied, toChase, shortlist: { outdated: old.length, total: favs.length, oldest: dates[0] ?? null } },
    // Brands you've applied to, and ones that need approval for a product that's a Buy now.
    awaiting: brands.filter((b) => b.gating === "applied" || (b.gating === "approval_needed" && b.pass > 0)).length,
  };
}

async function systemFacts(): Promise<TodayFacts["system"]> {
  const d = db();
  const keepa = getKeepa();
  const [pull, sync, tokens] = await Promise.all([
    d.from("qogita_pulls").select("started_at, error").eq("kind", "nightly").order("started_at", { ascending: false }).limit(1),
    d.from("amazon_sync").select("finished_at, error").eq("id", 1).maybeSingle(),
    keepa.available ? memo("keepa:tokens", 30_000, () => keepa.tokenStatus().catch(() => null)) : Promise.resolve(null),
  ]);
  const last = (must(pull, "nightly pulls") as { started_at: string; error: string | null }[])[0];
  const s = (sync.data ?? null) as { finished_at: string | null; error: string | null } | null;
  return {
    cron: last ? { lastAt: last.started_at, error: last.error } : null,
    keepa: { available: keepa.available, tokensLeft: tokens?.tokensLeft ?? null, refillRate: tokens?.refillRate ?? null },
    spapi: { configured: !!spApiConfigFromEnv(), lastSyncAt: s?.finished_at ?? null, error: s?.error ?? null },
  };
}

/** The key numbers under the steps: at most six, each one you can act on. */
export interface TodayNumbers {
  adSpend: { cost: number; sales: number; days: number; lastData: string | null } | null;
  proposals: number; candidates: number; stockDue: number;
  keepa: number | null; brandsAwaiting: number;
}

async function adSpendWeek(now: Date): Promise<TodayNumbers["adSpend"]> {
  const from = new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10);
  const rows = await selectAll<{ date: string; cost: number; sales: number }>("ads_campaign_daily", "date, cost, sales", ["campaign", "date"], (q) => q.gte("date", from));
  const ranges = must(await db().from("ads_campaign_ranges").select("date_to").order("date_to", { ascending: false }).limit(1), "ranges") as { date_to: string | null }[];
  const lastData = [rows.map((r) => r.date).sort().at(-1), ranges[0]?.date_to].filter(Boolean).sort().at(-1) ?? null;
  return { cost: rows.reduce((a, r) => a + Number(r.cost), 0), sales: rows.reduce((a, r) => a + Number(r.sales), 0), days: new Set(rows.map((r) => r.date)).size, lastData };
}

const EMPTY: TodayFacts = {
  system: { cron: null, keepa: { available: false, tokensLeft: null, refillRate: null }, spapi: { configured: true, lastSyncAt: null, error: null } },
  ads: { lastBulkImport: null, products: [], launches: [], proposals: [] },
  stock: { missingCosts: [], reorders: [] },
  pl: { candidates: [], leads: [] },
  wholesale: { applied: [], toChase: [], shortlist: { outdated: 0, total: 0, oldest: null } },
};

export async function gatherFacts(now = new Date()): Promise<{ facts: TodayFacts; numbers: TodayNumbers }> {
  const [system, ads, stock, pl, w, spend] = await Promise.all([
    safe(systemFacts(), EMPTY.system), safe(adsFacts(), EMPTY.ads), safe(stockFacts(), EMPTY.stock), safe(plFacts(), EMPTY.pl),
    safe(wholesaleFacts(), { facts: EMPTY.wholesale, awaiting: 0 }), safe(adSpendWeek(now), null),
  ]);
  const facts: TodayFacts = { system, ads, stock, pl, wholesale: w.facts };
  return {
    facts,
    numbers: {
      adSpend: spend, proposals: ads.proposals.length, candidates: pl.candidates.length, stockDue: stock.reorders.length,
      keepa: system.keepa.tokensLeft, brandsAwaiting: w.awaiting,
    },
  };
}

/* ===================== snoozes and dismissals ===================== */

/** "Later" hides a step for this long. */
export const SNOOZE_MS = 24 * 3_600_000;

async function stepStates(): Promise<StepState[]> {
  // Before the migration the table isn't there: nothing is snoozed.
  const r = await db().from("today_step_state").select("step_id, fingerprint, snoozed_until, dismissed_at");
  return r.error ? [] : (r.data as StepState[]);
}

export interface TodayView {
  date: string;
  steps: NextStep[];
  /** Steps hidden by Later or Done (they come back when the snooze ends or the condition changes). */
  hidden: number;
  numbers: TodayNumbers;
  next: { date: string; title: string } | null;
}

export async function todaySteps(now = new Date()): Promise<TodayView> {
  const [{ facts, numbers }, states] = await Promise.all([gatherFacts(now), stepStates()]);
  const all = buildSteps(facts, now);
  const byId = new Map(states.map((s) => [s.step_id, s]));
  return {
    date: now.toISOString().slice(0, 10), steps: rankSteps(all, states, now),
    hidden: all.filter((s) => isHidden(s, byId.get(s.id), now)).length, numbers, next: nextScheduled(facts, now),
  };
}

/** Later (24 h) or Done (until the condition changes). */
export async function setStepState(id: string, action: "snooze" | "dismiss" | "restore", fingerprint: string | null, now = new Date()) {
  if (!id || id.length > 200) throw new Error("A step id is required");
  const row = {
    step_id: id, fingerprint, updated_at: now.toISOString(),
    snoozed_until: action === "snooze" ? new Date(now.getTime() + SNOOZE_MS).toISOString() : null,
    dismissed_at: action === "dismiss" ? now.toISOString() : null,
  };
  must(await db().from("today_step_state").upsert(row, { onConflict: "step_id" }), "save step");
  return row;
}
