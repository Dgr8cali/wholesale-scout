/**
 * The Niches incumbent check, on-niche only: a product counts when its title holds one of the niche's
 * search terms as a phrase (its words, in order, plurals allowed) or, failing that, has all its words
 * within a 4-word window in any order ("Ball Launcher Dog Toy" for "dog ball launcher"); isn't a
 * toy or for a child or a pet (unless the niche is), isn't a card, a gift, a part or a spare, isn't an accessory for any of the niche's terms
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
/** Toy words: a pet niche's products are toys too (a dog ball launcher is a dog toy), as are a Toys & Games niche's. */
const TOY_WORDS = new Set(["toy", "toys", "game", "games"]);
/** Child words: on-niche in Baby Products and Toys & Games. */
const KID_WORDS = new Set(["kids", "kid", "children", "childrens", "child"]);

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

/** The window the term's words must all fall in when they're not a phrase: 4 words (or the term's length, if longer). */
export const MATCH_WINDOW = 4;

/** Where windows start that hold every one of the term's words, in any order (each title word used once). */
function windowStarts(tw: string[], pw: string[]): number[] {
  const out: number[] = [];
  if (!pw.length) return out;
  const w = Math.max(MATCH_WINDOW, pw.length);
  for (let i = 0; i < tw.length; i++) {
    if (!pw.some((p) => sameWord(tw[i], p))) continue;
    const used = new Set<number>();
    const ok = pw.every((p) => {
      for (let j = i; j < Math.min(tw.length, i + w); j++) if (!used.has(j) && sameWord(tw[j], p)) { used.add(j); return true; }
      return false;
    });
    if (ok) out.push(i);
  }
  return out;
}

/**
 * An any-order (window) match doesn't count when the title also has one of these: it's likely a
 * thing that goes with the product (a mat, a cover, a holder), not the product. A phrase match isn't
 * affected, and a word the term itself uses doesn't count.
 */
export const WINDOW_BLOCK_WORDS = ["mat", "mats", "cover", "covers", "liner", "liners", "replacement", "holder", "holders"];
export const WINDOW_BLOCK_PHRASES = ["stand only"];
/** Nor when Keepa files it under one of these. */
export const WINDOW_BLOCK_CATEGORIES = ["Feeding Mats"];

/** Why a window match on this term doesn't count, or null. */
function windowBlock(title: string, term: string, category?: string | null): string | null {
  if (category && WINDOW_BLOCK_CATEGORIES.some((c) => c.toLowerCase() === category.trim().toLowerCase())) return `any-order match in Keepa category ${category}`;
  const tw = words(title), pw = words(term), joined = ` ${tw.join(" ")} `;
  const w = WINDOW_BLOCK_WORDS.find((x) => tw.includes(x) && !pw.some((p) => sameWord(x, p)));
  if (w) return `any-order match with "${w}" in the title`;
  const ph = WINDOW_BLOCK_PHRASES.find((x) => joined.includes(` ${x} `));
  return ph ? `any-order match with "${ph}" in the title` : null;
}

/** How a title holds a term: "phrase" (in order, side by side), "words" (all within the window, any order), or null. */
export function termMatch(title: string, term: string): { how: "phrase" | "words"; at: number[] } | null {
  const tw = words(title), pw = words(term);
  const ph = phraseStarts(tw, pw);
  if (ph.length) return { how: "phrase", at: ph };
  const win = windowStarts(tw, pw);
  return win.length ? { how: "words", at: win } : null;
}

/** What makes the term after it the thing a product goes with, not the product: "for", "fits", "compatible with". */
const ACCESSORY_CUES = [["for"], ["fits"], ["fit"], ["fitting"], ["compatible", "with"]];
/** Words allowed between the cue and the term ("for your fishing rod", "fits most tackle boxes"); two at most. */
const FILLERS = new Set(["a", "an", "the", "your", "my", "all", "most", "any", "many", "both", "every", "standard"]);

/** The niche term a title is an accessory for ("for", "fits" or "compatible with" just before it), or null. */
export function accessoryFor(title: string, terms: string[]): string | null {
  const tw = words(title);
  for (const t of terms) {
    for (const at of termMatch(title, t)?.at ?? []) {
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
/** Off-niche words for bag or box niches only, on top of the list in use: a dry bag isn't a fishing bag. */
export const BAG_BOX_OFF_WORDS = ["dry"];
/** A bag or box niche: one of its terms is a bag or a box ("fishing bag", "tackle box"). */
export const isBagOrBox = (terms: string[]) => terms.some((t) => BAG_BOX.has(words(t).at(-1) ?? ""));

export interface OffNicheOpts {
  /** The off-niche words in use. */
  words?: string[];
  /** A pet niche (Pet Supplies, or a pet word in a term): cat, dog, toy and game products are on-niche. */
  pet?: boolean;
  /** A Baby Products or Toys & Games niche: kids and children products are on-niche. */
  kids?: boolean;
  /** A Baby Products niche: baby products are on-niche. */
  baby?: boolean;
  /** ASINs you marked "Not on-niche" on this niche: left out whatever their titles say. */
  notOnNiche?: string[];
  /** A Toys & Games niche: toy and game products are on-niche. */
  toys?: boolean;
}

/** A word on the off-niche list that this niche allows. */
const exempt = (w: string, o: OffNicheOpts) =>
  (o.pet && (PET_WORDS.has(w) || TOY_WORDS.has(w))) || (o.kids && KID_WORDS.has(w)) || (o.baby && w === "baby") || (o.toys && TOY_WORDS.has(w));

/** Why a title is off-niche for one term, or null: not the term (phrase or window), or an excluded word. */
function reasonFor(title: string, term: string, o: OffNicheOpts): string | null {
  if (!termMatch(title, term)) return `title doesn't have "${term}"`;
  const tw = words(title), pw = words(term);
  const list = (o.words ?? DEFAULT_OFF_NICHE).map((w) => w.toLowerCase().trim()).filter(Boolean);
  // The term's own words (and their plurals) never exclude: "dogs" in a "dog ball launcher" title.
  const hit = list.find((w) => !pw.some((p) => sameWord(w, p)) && !exempt(w, o) && (w.includes(" ") ? ` ${tw.join(" ")} `.includes(` ${w} `) : tw.includes(w)));
  if (hit) return `"${hit}" in the title`;
  return null;
}

/**
 * Which of the niche's search terms a title is on-niche for, or why it's off-niche: an accessory for
 * any of the terms ("for", "fits" or "compatible with" just before one), none of the terms (as a
 * phrase or within the window), or an excluded word (one the matched term itself uses doesn't
 * count: "cat tree" is about cats). A term held as a phrase is preferred over one held only within
 * the window. The reason given is the one for the first term the title holds.
 */
export function judgeTitle(title: string | null, terms: string | string[], o: OffNicheOpts = {}, category?: string | null): { term: string | null; how: "phrase" | "words" | null; why: string | null } {
  const list = (Array.isArray(terms) ? terms : [terms]).map((t) => t.trim()).filter(Boolean);
  if (!title) return { term: null, how: null, why: "no title" };
  const acc = accessoryFor(title, list);
  if (acc) return { term: null, how: null, why: `an accessory for ${acc}` };
  let first: string | null = null;
  for (const how of ["phrase", "words"] as const) {
    for (const t of list) {
      if (termMatch(title, t)?.how !== how) continue;
      const why = (how === "words" ? windowBlock(title, t, category) : null) ?? reasonFor(title, t, o);
      if (!why) return { term: t, how, why: null };
      first ??= why;
    }
  }
  return { term: null, how: null, why: first ?? (list.length === 1 ? `title doesn't have "${list[0]}"` : "title has none of the search terms") };
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

/** The reason on a product you marked "Not on-niche". */
export const MARKED_OUT = "marked not on-niche by you";

export interface IncumbentCandidate {
  asin: string; title: string | null; brand: string | null; reviews: number | null; price: number | null;
  rank: number | null; monthlySold: number | null; category: string | null;
  /** Keepa's root category (where Amazon files it). */
  rootCategory?: string | null;
  /** The search term its title matched (on-niche products), and how: as a phrase, or its words within the window. */
  matchedTerm?: string | null; matchedHow?: "phrase" | "words" | null;
}

/**
 * The on-niche products, the 10 best sellers among them (monthly sold, highest first; then sales
 * rank, lowest first, for those without one), their shape, and what was left out and why.
 */
export function classifyIncumbents(products: IncumbentCandidate[], terms: string | string[], o: OffNicheOpts = {}, take = 10) {
  const kept: IncumbentCandidate[] = [];
  const excluded: (IncumbentCandidate & { why: string })[] = [];
  const list = Array.isArray(terms) ? terms : [terms];
  const bagBox = isBagOrBox(list);
  const offCats = bagBox ? new Set(BAG_BOX_OFF_CATEGORIES.map((c) => c.toLowerCase())) : null;
  if (bagBox) o = { ...o, words: [...(o.words ?? DEFAULT_OFF_NICHE), ...BAG_BOX_OFF_WORDS] };
  const mine = new Set((o.notOnNiche ?? []).map((a) => a.toUpperCase()));
  for (const p of products) {
    if (mine.has(p.asin.toUpperCase())) {
      excluded.push({ ...p, why: MARKED_OUT });
      continue;
    }
    if (offCats && p.category && offCats.has(p.category.trim().toLowerCase())) {
      excluded.push({ ...p, why: `Keepa category ${p.category} (not a bag or box)` });
      continue;
    }
    const j = judgeTitle(p.title, terms, o, p.category);
    if (j.why) excluded.push({ ...p, why: j.why });
    else kept.push({ ...p, matchedTerm: j.term, matchedHow: j.how });
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
