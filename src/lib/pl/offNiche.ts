/**
 * The Niches incumbent check, on-niche only: a product counts when its title holds one of the niche's
 * search terms as a phrase (its words, in order, plurals allowed), isn't for a child or a pet (unless the
 * niche is), isn't a card, a gift, a part or a spare, isn't an accessory for any of the niche's terms
 * ("bag for fishing rod", "fits tackle box", "compatible with fishing reels"), and, for a bag or box
 * niche, isn't filed by Keepa under a category that only looks like one (locking carabiners, bait storage). The 10 best sellers among those (monthly sold, else sales rank) decide the shape.
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

/** Every place the term's words start in the title as a run (in order, side by side). */
function phraseStarts(tw: string[], pw: string[]): number[] {
  const out: number[] = [];
  if (!pw.length) return out;
  for (let i = 0; i + pw.length <= tw.length; i++) if (pw.every((p, j) => sameWord(tw[i + j], p))) out.push(i);
  return out;
}

/** Where the term's words start in the title as a run (in order, side by side), or -1. */
export function phraseAt(title: string, term: string): number {
  return phraseStarts(words(title), words(term))[0] ?? -1;
}

/** What makes the term after it the thing a product goes with, not the product: "for", "fits", "compatible with". */
const ACCESSORY_CUES = [["for"], ["fits"], ["fit"], ["fitting"], ["compatible", "with"]];
/** Words allowed between the cue and the term ("for your fishing rod", "fits most tackle boxes"); two at most. */
const FILLERS = new Set(["a", "an", "the", "your", "my", "all", "most", "any", "many", "both", "every", "standard"]);

/** The niche term a title is an accessory for ("for", "fits" or "compatible with" just before it), or null. */
export function accessoryFor(title: string, terms: string[]): string | null {
  const tw = words(title);
  for (const t of terms) {
    for (const at of phraseStarts(tw, words(t))) {
      let i = at;
      while (i > 0 && at - i < 2 && FILLERS.has(tw[i - 1])) i--;
      for (let k = at; k >= i; k--) {
        if (ACCESSORY_CUES.some((c) => c.length <= k && c.every((w, j) => tw[k - c.length + j] === w))) return t;
      }
    }
  }
  return null;
}

/** Keepa categories that only look like a bag or a box: left out when the niche is one. */
export const BAG_BOX_OFF_CATEGORIES = ["Locking Carabiners", "Bait Storage"];
const BAG_BOX = new Set(["bag", "bags", "box", "boxes"]);
/** A bag or box niche: one of its terms is a bag or a box ("fishing bag", "tackle box"). */
export const isBagOrBox = (terms: string[]) => terms.some((t) => BAG_BOX.has(words(t).at(-1) ?? ""));

export interface OffNicheOpts {
  /** The off-niche words in use. */
  words?: string[];
  /** A pet niche (Pet Supplies, or a pet word in the term): cat and dog products are on-niche. */
  pet?: boolean;
}

/** Why a title is off-niche for one term, or null: not the phrase, or an excluded word. */
function reasonFor(title: string, term: string, o: OffNicheOpts): string | null {
  const at = phraseAt(title, term);
  if (at < 0) return `title doesn't have "${term}"`;
  const tw = words(title), pw = new Set(words(term));
  const list = (o.words ?? DEFAULT_OFF_NICHE).map((w) => w.toLowerCase().trim()).filter(Boolean);
  const hit = list.find((w) => !pw.has(w) && !(o.pet && PET_WORDS.has(w)) && (w.includes(" ") ? ` ${tw.join(" ")} `.includes(` ${w} `) : tw.includes(w)));
  if (hit) return `"${hit}" in the title`;
  return null;
}

/**
 * Which of the niche's search terms a title is on-niche for (the first that passes), or why it's
 * off-niche: an accessory for any of the terms ("for", "fits" or "compatible with" just before
 * one), none of the terms as a phrase, or an excluded word (one the matched term itself uses
 * doesn't count: "cat tree" is about cats). The reason given is the one for the first term the
 * title has as a phrase.
 */
export function judgeTitle(title: string | null, terms: string | string[], o: OffNicheOpts = {}): { term: string | null; why: string | null } {
  const list = (Array.isArray(terms) ? terms : [terms]).map((t) => t.trim()).filter(Boolean);
  if (!title) return { term: null, why: "no title" };
  const acc = accessoryFor(title, list);
  if (acc) return { term: null, why: `an accessory for ${acc}` };
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
  /** Keepa's root category (where Amazon files it). */
  rootCategory?: string | null;
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
  const list = Array.isArray(terms) ? terms : [terms];
  const offCats = isBagOrBox(list) ? new Set(BAG_BOX_OFF_CATEGORIES.map((c) => c.toLowerCase())) : null;
  for (const p of products) {
    if (offCats && p.category && offCats.has(p.category.trim().toLowerCase())) {
      excluded.push({ ...p, why: `Keepa category ${p.category} (not a bag or box)` });
      continue;
    }
    const j = judgeTitle(p.title, terms, o);
    if (j.why) excluded.push({ ...p, why: j.why });
    else kept.push({ ...p, matchedTerm: j.term });
  }
  const bySales = [...kept].sort((a, b) =>
    (b.monthlySold ?? -1) - (a.monthlySold ?? -1) || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  const top = bySales.slice(0, take);
  // Where Amazon files the on-niche products (root category, else leaf), most first.
  const tally = new Map<string, number>();
  for (const p of kept) { const c = p.rootCategory ?? p.category; if (c) tally.set(c, (tally.get(c) ?? 0) + 1); }
  const categories = [...tally].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { top, shape: top.length ? shapeOf(top.map((x) => x.reviews)) : null, onNiche: kept.length, excluded, categories };
}

/** One a line or comma, lower case, no repeats. */
export const parseWordList = (text: string | string[]) => [...new Set((Array.isArray(text) ? text : text.split(/[\n,]/)).map((t) => t.trim().toLowerCase()).filter(Boolean))];
