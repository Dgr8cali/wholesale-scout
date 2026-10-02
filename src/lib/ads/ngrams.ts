/**
 * N-grams: every search term split into single words (unigrams) and adjacent pairs (bigrams), and
 * the search-term figures summed per product and gram. A word that wastes money in many terms
 * shows here when no single term has enough clicks to judge; Rules 9 and 10 act on it. Pure.
 */

/** Words that carry no meaning on their own. Numbers stay ("7 day", "3 times"). */
export const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "without", "of", "to", "in", "on", "by", "at", "from", "into", "is", "it", "its", "as", "be", "are",
  "my", "your", "our", "this", "that", "these", "those", "&", "+", "-", "x", "s",
]);

export const tokens = (term: string) => term.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The term's unigrams and bigrams (each once): stop-words dropped; a bigram is two adjacent words, neither a stop-word. */
export function grams(term: string): string[] {
  const t = tokens(term);
  const out = new Set<string>();
  for (let i = 0; i < t.length; i++) {
    if (STOP_WORDS.has(t[i])) continue;
    out.add(t[i]);
    if (i + 1 < t.length && !STOP_WORDS.has(t[i + 1])) out.add(`${t[i]} ${t[i + 1]}`);
  }
  return [...out];
}

/** Does the term contain the gram as whole words, in order? */
export const termHasGram = (term: string, gram: string) => ` ${tokens(term).join(" ")} `.includes(` ${gram} `);

export interface GramTerm {
  asin: string; campaign: string; adGroupIds: string[]; term: string;
  impressions: number | null; clicks: number; cost: number; orders: number; sales: number;
}

export interface GramRow {
  asin: string; gram: string; size: 1 | 2;
  impressions: number | null; clicks: number; cost: number; orders: number; sales: number;
  acos: number | null;
  /** Spend in terms with no order. */
  waste: number;
  /** Distinct search terms it appears in, and how many of those have an order. */
  terms: number; convertingTerms: number;
  examples: string[];
  /** Where it served: each campaign and its ad groups. */
  servedIn: { campaign: string; adGroupIds: string[] }[];
}

export function ngramTable(rows: GramTerm[]): GramRow[] {
  const map = new Map<string, GramRow & { termSet: Map<string, GramTerm[]> }>();
  for (const r of rows) {
    for (const g of grams(r.term)) {
      const k = `${r.asin}|${g}`;
      const cur: GramRow & { termSet: Map<string, GramTerm[]> } = map.get(k) ?? { asin: r.asin, gram: g, size: g.includes(" ") ? 2 : 1, impressions: null, clicks: 0, cost: 0, orders: 0, sales: 0, acos: null, waste: 0, terms: 0, convertingTerms: 0, examples: [], servedIn: [], termSet: new Map() };
      cur.impressions = r.impressions == null ? cur.impressions : (cur.impressions ?? 0) + r.impressions;
      cur.clicks += r.clicks; cur.cost += r.cost; cur.orders += r.orders; cur.sales += r.sales;
      cur.termSet.set(r.term, [...(cur.termSet.get(r.term) ?? []), r]);
      const served = cur.servedIn.find((s) => s.campaign === r.campaign);
      if (served) { for (const a of r.adGroupIds) if (!served.adGroupIds.includes(a)) served.adGroupIds.push(a); }
      else cur.servedIn.push({ campaign: r.campaign, adGroupIds: [...r.adGroupIds] });
      map.set(k, cur);
    }
  }
  return [...map.values()].map(({ termSet, ...g }) => {
    const perTerm = [...termSet.entries()].map(([term, rs]) => ({ term, orders: rs.reduce((a, x) => a + x.orders, 0), cost: rs.reduce((a, x) => a + x.cost, 0), clicks: rs.reduce((a, x) => a + x.clicks, 0) }));
    return {
      ...g,
      acos: g.sales > 0 ? g.cost / g.sales : g.cost > 0 ? Infinity : null,
      waste: perTerm.filter((t) => t.orders === 0).reduce((a, t) => a + t.cost, 0),
      terms: perTerm.length, convertingTerms: perTerm.filter((t) => t.orders > 0).length,
      examples: perTerm.sort((a, b) => b.clicks - a.clicks).slice(0, 5).map((t) => t.term),
    };
  }).sort((a, b) => b.cost - a.cost);
}
