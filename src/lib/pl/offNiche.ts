/**
 * The Niches incumbent check, on-niche only: a product counts when its title holds one of the niche's
 * search terms as a phrase (its words, in order, plurals allowed), isn't for a child or a pet (unless the
 * niche is), isn't a card, a gift, a part or a spare, and isn't an accessory for the thing ("bag for
 * fishing rod"). The 10 best sellers among those (monthly sold, else sales rank) decide the shape.
 * Pure.
 */
import { shapeOf } from "./hunt";

/** Words that make a product off-niche (Settings → Private label edits the list in use). */
export const DEFAULT_OFF_NICHE = [
  "toy", "toys", "kids", "kid", "children", "childrens", "child", "baby", "game", "games", "cat", "cats", "kitten", "dog", "dogs", "puppy",
  "card", "cards", "gift", "gifts", "tube", "tubing", "sleeve", "sleeves", "spare", "spares", "replacement", "part", "parts",
];
/** Pet words: off-niche unless the niche is a pet one. */
const PET_WORDS = new Set(["cat", "cats", "kitten", "dog", "dogs", "puppy"]);

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
/** "rod" matches "rod", "rods", "rodes"? — just the plural forms: +s, +es. */
const sameWord = (w: string, t: string) => w === t || w === `${t}s` || w === `${t}es` || `${w}s` === t;

/** Where the term's words start in the title as a run (in order, side by side), or -1. */
export function phraseAt(title: string, term: string): number {
  const tw = words(title), pw = words(term);
  if (!pw.length) return -1;
  for (let i = 0; i + pw.length <= tw.length; i++) if (pw.every((p, j) => sameWord(tw[i + j], p))) return i;
  return -1;
}

export interface OffNicheOpts {
  /** The off-niche words in use. */
  words?: string[];
  /** A pet niche (Pet Supplies, or a pet word in the term): cat and dog products are on-niche. */
  pet?: boolean;
}

/** Why a title is off-niche for one term, or null: not the phrase, an excluded word, or an accessory. */
function reasonFor(title: string, term: string, o: OffNicheOpts): string | null {
  const at = phraseAt(title, term);
  if (at < 0) return `title doesn't have "${term}"`;
  const tw = words(title), pw = new Set(words(term));
  const list = (o.words ?? DEFAULT_OFF_NICHE).map((w) => w.toLowerCase().trim()).filter(Boolean);
  const hit = list.find((w) => !pw.has(w) && !(o.pet && PET_WORDS.has(w)) && (w.includes(" ") ? ` ${tw.join(" ")} `.includes(` ${w} `) : tw.includes(w)));
  if (hit) return `"${hit}" in the title`;
  if (tw.slice(Math.max(0, at - 3), at).includes("for")) return `an accessory for ${term}`;
  return null;
}

/**
 * Which of the niche's search terms a title is on-niche for (the first that passes), or why it's
 * off-niche: none of the terms as a phrase, an excluded word (one the matched term itself uses
 * doesn't count: "cat tree" is about cats), or an accessory for the thing ("for" just before it).
 * The reason given is the one for the first term the title has as a phrase.
 */
export function judgeTitle(title: string | null, terms: string | string[], o: OffNicheOpts = {}): { term: string | null; why: string | null } {
  const list = (Array.isArray(terms) ? terms : [terms]).map((t) => t.trim()).filter(Boolean);
  if (!title) return { term: null, why: "no title" };
  let first: string | null = null;
  for (const t of list) {
    const why = reasonFor(title, t, o);
    if (!why) return { term: t, why: null };
    if (!first && phraseAt(title, t) >= 0) first = why;
  }
  return { term: null, why: first ?? (list.length === 1 ? `title doesn't have "${list[0]}"` : "title has none of the search terms") };
}

/** Why a product is off-niche for these terms, or null when it's on-niche. */
export function offNicheReason(title: string | null, terms: string | string[], o: OffNicheOpts = {}): string | null {
  return judgeTitle(title, terms, o).why;
}

/**
 * The terms the finder searches: the niche's terms less any that contain another one as a phrase
 * (Keepa's title search for "tackle box" already finds "fishing tackle box"), in order, at most `max`.
 */
export function finderTerms(terms: string[], max = 3): string[] {
  const list = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  return list.filter((t, i) => !list.some((u, j) => j !== i && phraseAt(t, u) >= 0 && (words(u).length < words(t).length || j < i))).slice(0, max);
}

export interface IncumbentCandidate {
  asin: string; title: string | null; brand: string | null; reviews: number | null; price: number | null;
  rank: number | null; monthlySold: number | null; category: string | null;
  /** The search term its title matched (on-niche products). */
  matchedTerm?: string | null;
}

/**
 * The on-niche products, the 10 best sellers among them (monthly sold, highest first; then sales
 * rank, lowest first, for those without one), their shape, and what was left out and why.
 */
export function classifyIncumbents(products: IncumbentCandidate[], terms: string | string[], o: OffNicheOpts = {}, take = 10) {
  const kept: IncumbentCandidate[] = [];
  const excluded: (IncumbentCandidate & { why: string })[] = [];
  for (const p of products) {
    const j = judgeTitle(p.title, terms, o);
    if (j.why) excluded.push({ ...p, why: j.why });
    else kept.push({ ...p, matchedTerm: j.term });
  }
  const bySales = [...kept].sort((a, b) =>
    (b.monthlySold ?? -1) - (a.monthlySold ?? -1) || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  const top = bySales.slice(0, take);
  return { top, shape: top.length ? shapeOf(top.map((x) => x.reviews)) : null, onNiche: kept.length, excluded };
}

/** One a line or comma, lower case, no repeats. */
export const parseWordList = (text: string | string[]) => [...new Set((Array.isArray(text) ? text : text.split(/[\n,]/)).map((t) => t.trim().toLowerCase()).filter(Boolean))];
