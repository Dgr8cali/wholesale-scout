/**
 * Keyword lists. Whitelist: terms never negatived or paused (your brand, the product's head terms):
 * the rules skip them and say so. Blacklist: words or phrases always added as negative phrase to a
 * product's new campaigns (and proposed for its broad and auto campaigns). Account-wide lists, and per
 * product additions, which can leave the account's out. Pure.
 */

export interface KeywordLists { whitelist: string[]; blacklist: string[] }
export interface ProductLists extends KeywordLists { useAccount: boolean }
export const EMPTY_LISTS: KeywordLists = { whitelist: [], blacklist: [] };

/** Lower case, punctuation out, single spaces: "Pill-Box!" and "pill box" are one term. */
export const normTerm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** One term per line or comma, normalised, no repeats. */
export function parseList(text: string | string[]): string[] {
  const items = Array.isArray(text) ? text : text.split(/[\n,]/);
  return [...new Set(items.map(normTerm).filter(Boolean))];
}

/** The product's lists: its own, plus the account's unless it leaves them out. */
export function listsFor(account: KeywordLists, product: ProductLists | null): KeywordLists {
  if (!product) return { whitelist: parseList(account.whitelist), blacklist: parseList(account.blacklist) };
  const base = product.useAccount ? account : EMPTY_LISTS;
  return { whitelist: parseList([...base.whitelist, ...product.whitelist]), blacklist: parseList([...base.blacklist, ...product.blacklist]) };
}

const has = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

/**
 * The whitelisted phrase a term touches, or null: the term contains it ("pill box organiser" holds
 * "pill box"), or it contains the term ("box" is in "pill box": negating "box" would block it).
 */
export function whitelistHit(text: string, whitelist: string[]): string | null {
  const t = normTerm(text);
  if (!t) return null;
  return whitelist.find((w) => w && (has(t, w) || has(w, t))) ?? null;
}
