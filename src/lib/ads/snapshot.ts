/**
 * Undoing bulk changes: the values an export is about to change (so a batch can be reverted),
 * full snapshots of the account's bids, states, budgets and placements, and the bulk changes that
 * put either back. Bulk files can't delete: a created keyword is paused, a created negative
 * archived, a created campaign paused. Pure.
 */
import type { BulkChange } from "./bulk";

type State3 = "enabled" | "paused" | "archived";

/** The account as last imported (by Amazon's IDs). */
export interface EntityState {
  campaigns: { campaignId: string; name: string; budget: number | null; state: string | null; biddingStrategy: string | null }[];
  adGroups: { campaignId: string; adGroupId: string; defaultBid: number | null; state: string | null }[];
  keywords: { campaignId: string; adGroupId: string; keywordId: string; text: string; matchType: string; bid: number | null; state: string | null }[];
  targets: { campaignId: string; adGroupId: string; targetId: string; expression: string; bid: number | null; state: string | null }[];
  placements: { campaignId: string; placement: string; percentage: number | null }[];
  negatives: { campaignId: string; adGroupId: string | null; keywordId: string; text: string; matchType: string; state: string | null }[];
}
export type Snapshot = Omit<EntityState, "negatives">;

const st = (s: string | null | undefined): State3 => (/paused/i.test(s ?? "") ? "paused" : /archived/i.test(s ?? "") ? "archived" : "enabled");
const placeKey = (p: string) => p.replace(/^Placement\s+/i, "").trim().toLowerCase();
const lc = (s: string) => s.trim().toLowerCase();

/** One entity a change touches, so the same entity is restored once. */
function entityKey(c: BulkChange): string | null {
  switch (c.kind) {
    case "keyword_bid": return `kwbid:${c.keywordId}`;
    case "keyword_state": return `kwstate:${c.keywordId}`;
    case "target_bid": return `tgbid:${c.targetId}`;
    case "target_state": return `tgstate:${c.targetId}`;
    case "ad_group_bid": return `ag:${c.adGroupId}`;
    case "campaign_budget": return `budget:${c.campaignId}`;
    case "campaign_state": return `cstate:${c.campaignId}`;
    case "placement": return `pl:${c.campaignId}:${placeKey(c.placement)}`;
    default: return null;
  }
}

/** What the updates in `changes` replace, as changes that put it back (taken before the export). */
export function restoresFor(changes: BulkChange[], s: EntityState): { restores: BulkChange[]; notes: string[] } {
  const restores: BulkChange[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const c of changes) {
    const k = entityKey(c);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const r = restoreOne(c, s);
    if (r) restores.push(r);
    else notes.push(`No imported value to restore for ${k}`);
  }
  return { restores, notes };
}

function restoreOne(c: BulkChange, s: EntityState): BulkChange | null {
  switch (c.kind) {
    case "keyword_bid": case "keyword_state": {
      const k = s.keywords.find((x) => x.keywordId === c.keywordId);
      if (!k) return null;
      return c.kind === "keyword_bid" ? (k.bid == null ? null : { ...c, bid: k.bid }) : { ...c, state: st(k.state) };
    }
    case "target_bid": case "target_state": {
      const t = s.targets.find((x) => x.targetId === c.targetId);
      if (!t) return null;
      return c.kind === "target_bid" ? (t.bid == null ? null : { ...c, bid: t.bid }) : { ...c, state: st(t.state) };
    }
    case "ad_group_bid": {
      const g = s.adGroups.find((x) => x.adGroupId === c.adGroupId);
      return g?.defaultBid == null ? null : { ...c, defaultBid: g.defaultBid };
    }
    case "campaign_budget": case "campaign_state": {
      const x = s.campaigns.find((y) => y.campaignId === c.campaignId);
      if (!x) return null;
      return c.kind === "campaign_budget" ? (x.budget == null ? null : { ...c, dailyBudget: x.budget }) : { ...c, state: st(x.state) };
    }
    case "placement": {
      const p = s.placements.find((y) => y.campaignId === c.campaignId && placeKey(y.placement) === placeKey(c.placement));
      const camp = s.campaigns.find((y) => y.campaignId === c.campaignId);
      return { ...c, percentage: p?.percentage ?? 0, biddingStrategy: camp?.biddingStrategy ?? c.biddingStrategy };
    }
    default: return null;
  }
}

/**
 * The inverse of a batch: its updates' saved values back, and what it created switched off (found
 * in the latest import by campaign, ad group, text and match type; listed as unresolved when the
 * created entity hasn't been imported since the upload).
 */
export function revertChanges(changes: BulkChange[], restores: BulkChange[], s: EntityState): { changes: BulkChange[]; unresolved: string[] } {
  const out: BulkChange[] = [...restores];
  const unresolved: string[] = [];
  const later = "isn't in the imported data yet: import a bulk export made after the upload, then revert again";
  for (const c of changes) {
    if (c.kind === "create_keyword") {
      const k = s.keywords.find((x) => x.campaignId === c.campaignId && x.adGroupId === c.adGroupId && lc(x.text) === lc(c.text) && lc(x.matchType) === lc(c.matchType));
      if (k) out.push({ kind: "keyword_state", campaignId: c.campaignId, adGroupId: c.adGroupId, keywordId: k.keywordId, state: "paused" });
      else unresolved.push(`Keyword "${c.text}" (${c.matchType.toLowerCase()}) ${later}`);
    } else if (c.kind === "create_negative") {
      const n = s.negatives.find((x) => x.campaignId === c.campaignId && (x.adGroupId ?? null) === (c.adGroupId ?? null) && lc(x.text) === lc(c.text) && lc(x.matchType) === lc(c.matchType));
      if (n) out.push({ kind: "negative_state", campaignId: c.campaignId, adGroupId: c.adGroupId, keywordId: n.keywordId, state: "archived" });
      else unresolved.push(`Negative "${c.text}" (${c.matchType.toLowerCase()}) ${later}`);
    } else if (c.kind === "create_campaign") {
      const x = s.campaigns.find((y) => lc(y.name) === lc(c.name));
      if (x) out.push({ kind: "campaign_state", campaignId: x.campaignId, state: "paused" });
      else unresolved.push(`Campaign "${c.name}" ${later}`);
    } else if (c.kind === "negative_state") {
      out.push({ ...c, state: c.state === "archived" ? "enabled" : "archived" });
    }
  }
  return { changes: out, unresolved };
}

/** Everything a snapshot keeps. */
export const takeSnapshot = (s: EntityState): Snapshot => ({ campaigns: s.campaigns, adGroups: s.adGroups, keywords: s.keywords, targets: s.targets, placements: s.placements });

/**
 * The changes that bring the account (as imported) back to a snapshot: bids, states, budgets and
 * placement percentages that differ; keywords, targets and campaigns added since are paused.
 */
export function diffSnapshot(snap: Snapshot, s: EntityState): BulkChange[] {
  const out: BulkChange[] = [];
  const near = (a: number | null, b: number | null) => a == null || b == null || Math.abs(a - b) < 0.005;
  for (const c of s.campaigns) {
    const was = snap.campaigns.find((x) => x.campaignId === c.campaignId);
    if (!was) { if (st(c.state) === "enabled") out.push({ kind: "campaign_state", campaignId: c.campaignId, state: "paused" }); continue; }
    if (!near(was.budget, c.budget)) out.push({ kind: "campaign_budget", campaignId: c.campaignId, dailyBudget: was.budget! });
    if (st(was.state) !== st(c.state)) out.push({ kind: "campaign_state", campaignId: c.campaignId, state: st(was.state) });
  }
  for (const g of s.adGroups) {
    const was = snap.adGroups.find((x) => x.adGroupId === g.adGroupId);
    if (was && !near(was.defaultBid, g.defaultBid)) out.push({ kind: "ad_group_bid", campaignId: g.campaignId, adGroupId: g.adGroupId, defaultBid: was.defaultBid! });
  }
  for (const k of s.keywords) {
    const was = snap.keywords.find((x) => x.keywordId === k.keywordId);
    if (!was) { if (st(k.state) === "enabled") out.push({ kind: "keyword_state", campaignId: k.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, state: "paused" }); continue; }
    if (!near(was.bid, k.bid)) out.push({ kind: "keyword_bid", campaignId: k.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, bid: was.bid! });
    if (st(was.state) !== st(k.state)) out.push({ kind: "keyword_state", campaignId: k.campaignId, adGroupId: k.adGroupId, keywordId: k.keywordId, state: st(was.state) });
  }
  for (const t of s.targets) {
    const was = snap.targets.find((x) => x.targetId === t.targetId);
    if (!was) { if (st(t.state) === "enabled") out.push({ kind: "target_state", campaignId: t.campaignId, adGroupId: t.adGroupId, targetId: t.targetId, state: "paused" }); continue; }
    if (!near(was.bid, t.bid)) out.push({ kind: "target_bid", campaignId: t.campaignId, adGroupId: t.adGroupId, targetId: t.targetId, bid: was.bid! });
    if (st(was.state) !== st(t.state)) out.push({ kind: "target_state", campaignId: t.campaignId, adGroupId: t.adGroupId, targetId: t.targetId, state: st(was.state) });
  }
  for (const p of s.placements) {
    const was = snap.placements.find((x) => x.campaignId === p.campaignId && placeKey(x.placement) === placeKey(p.placement));
    if (was && !near(was.percentage ?? 0, p.percentage ?? 0)) {
      const camp = s.campaigns.find((x) => x.campaignId === p.campaignId);
      out.push({ kind: "placement", campaignId: p.campaignId, biddingStrategy: camp?.biddingStrategy ?? "Dynamic bids – down only", placement: p.placement, percentage: was.percentage ?? 0 });
    }
  }
  return out;
}
