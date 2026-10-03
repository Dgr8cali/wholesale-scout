/**
 * The keyword bank: one place per product for every term worth knowing: Opportunity Explorer's
 * search terms (from the private-label candidate's Gate 5 capture), harvested terms, n-gram winners,
 * rank-tracked terms and your own additions, de-duplicated by normalised text, with what the ads
 * have done with each and where it stands. Pure.
 */
import { normTerm } from "./lists";

export type BankSource = "poe" | "harvested" | "ngram" | "rank" | "manual";
export const BANK_SOURCE_LABEL: Record<BankSource, string> = { poe: "Opportunity Explorer", harvested: "Harvested", ngram: "N-gram winner", rank: "Rank tracked", manual: "Added by you" };
export type BankStatus = "targeted exact" | "targeted broad" | "negatived" | "not targeted";

export interface BankInput {
  sources: { text: string; source: BankSource; searches?: number | null }[];
  /** The product's search terms (summed over the imports counted). */
  terms: { term: string; clicks: number; cost: number; orders: number; sales: number }[];
  /** The product's keywords (not archived) and negatives. */
  keywords: { text: string; matchType: string; state: string | null }[];
  negatives: { text: string; matchType: string }[];
  /** Latest organic position per keyword (lower case); null = not in the top 48. */
  ranks: Record<string, { position: number | null; checkedAt: string }>;
  tracked: string[];
}

export interface BankRow {
  text: string; norm: string; sources: BankSource[]; searches: number | null;
  clicks: number; orders: number; cost: number; sales: number; acos: number | null;
  rank: { position: number | null; checkedAt: string } | null; tracked: boolean; status: BankStatus;
}

const has = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

/** Where a term stands: an exact keyword, a broad or phrase one, negatived, or none of those. */
export function bankStatus(norm: string, keywords: BankInput["keywords"], negatives: BankInput["negatives"]): BankStatus {
  const live = keywords.filter((k) => !/archived|paused/i.test(k.state ?? ""));
  if (live.some((k) => /^exact$/i.test(k.matchType) && normTerm(k.text) === norm)) return "targeted exact";
  if (live.some((k) => !/^exact$/i.test(k.matchType) && normTerm(k.text) === norm)) return "targeted broad";
  if (negatives.some((n) => (/exact/i.test(n.matchType) && normTerm(n.text) === norm) || (/phrase/i.test(n.matchType) && has(norm, normTerm(n.text))))) return "negatived";
  return "not targeted";
}

export function buildBank(x: BankInput): BankRow[] {
  const rows = new Map<string, BankRow>();
  const termStats = new Map<string, { clicks: number; cost: number; orders: number; sales: number }>();
  for (const t of x.terms) {
    const k = normTerm(t.term);
    const s = termStats.get(k) ?? { clicks: 0, cost: 0, orders: 0, sales: 0 };
    s.clicks += t.clicks; s.cost += t.cost; s.orders += t.orders; s.sales += t.sales;
    termStats.set(k, s);
  }
  const tracked = new Set(x.tracked.map(normTerm));
  for (const s of x.sources) {
    const norm = normTerm(s.text);
    if (!norm) continue;
    const cur = rows.get(norm);
    if (cur) {
      if (!cur.sources.includes(s.source)) cur.sources.push(s.source);
      if (s.searches != null) cur.searches = Math.max(cur.searches ?? 0, s.searches);
      continue;
    }
    const st = termStats.get(norm) ?? { clicks: 0, cost: 0, orders: 0, sales: 0 };
    const rank = x.ranks[norm] ?? null;
    rows.set(norm, {
      text: s.text.trim().toLowerCase(), norm, sources: [s.source], searches: s.searches ?? null, ...st,
      acos: st.sales > 0 ? st.cost / st.sales : st.cost > 0 ? Infinity : null,
      rank, tracked: tracked.has(norm), status: bankStatus(norm, x.keywords, x.negatives),
    });
  }
  return [...rows.values()].sort((a, b) => (b.searches ?? -1) - (a.searches ?? -1) || b.orders - a.orders || b.clicks - a.clicks || a.norm.localeCompare(b.norm));
}

/** The launcher's head terms from the bank: Opportunity Explorer's biggest, then what sells, then yours. */
export function headTermsFromBank(rows: BankRow[], n = 8): string[] {
  const score = (r: BankRow) => (r.searches ?? 0) * 10 + r.orders * 1000 + (r.sources.includes("manual") ? 500 : 0) + (r.sources.includes("harvested") ? 300 : 0);
  return rows.filter((r) => r.status !== "negatived").sort((a, b) => score(b) - score(a)).slice(0, n).map((r) => r.text);
}
